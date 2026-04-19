import { PluginInstallationModel } from '@noxivo/database';
import {
  parseCompiledDag,
  parseWorkflowEditorGraph,
  type CompiledDag,
  type CompiledDagNode,
  type WorkflowEditorEdge,
  type WorkflowEditorNode
} from '@noxivo/contracts';
import { type PluginRegistry } from '../plugins/registry.service.js';

export interface CompileDagInput {
  agencyId: string;
  tenantId: string;
  version: string;
  graph: unknown;
}

export interface DagCompilerOptions {
  pluginRegistry?: PluginRegistry;
}

interface ValidatedConditionBranches {
  onTrue: string;
  onFalse: string;
  next: [string, string];
}

function sortStrings(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function validateConditionBranches(nodeId: string, edges: WorkflowEditorEdge[]): ValidatedConditionBranches {
  const allowedHandles = new Set(['onTrue', 'onFalse']);
  const branchTargets = new Map<'onTrue' | 'onFalse', string[]>();

  branchTargets.set('onTrue', []);
  branchTargets.set('onFalse', []);

  for (const edge of edges) {
    if (edge.sourceHandle !== 'onTrue' && edge.sourceHandle !== 'onFalse') {
      throw new Error(`Condition node ${nodeId} uses unsupported branch handle ${edge.sourceHandle ?? 'null'}`);
    }

    if (!allowedHandles.has(edge.sourceHandle)) {
      throw new Error(`Condition node ${nodeId} uses unsupported branch handle ${edge.sourceHandle}`);
    }

    branchTargets.get(edge.sourceHandle)?.push(edge.target);
  }

  const onTrueTargets = branchTargets.get('onTrue') ?? [];
  const onFalseTargets = branchTargets.get('onFalse') ?? [];

  if (onTrueTargets.length !== 1) {
    throw new Error(`Condition node ${nodeId} must define exactly one onTrue branch`);
  }

  if (onFalseTargets.length !== 1) {
    throw new Error(`Condition node ${nodeId} must define exactly one onFalse branch`);
  }

  return {
    onTrue: onTrueTargets[0] ?? '',
    onFalse: onFalseTargets[0] ?? '',
    next: sortStrings([onTrueTargets[0] ?? '', onFalseTargets[0] ?? '']) as [string, string]
  };
}

export class DagCompiler {
  constructor(private readonly options: DagCompilerOptions = {}) {}

  async compile(input: CompileDagInput): Promise<CompiledDag> {
    const graph = parseWorkflowEditorGraph(input.graph);
    const nodeMap = new Map<string, WorkflowEditorNode>();

    for (const node of graph.nodes) {
      if (nodeMap.has(node.id)) {
        throw new Error(`Duplicate node id detected: ${node.id}`);
      }

      nodeMap.set(node.id, node);
    }

    const triggerNodes = graph.nodes.filter((node) => node.type === 'trigger');

    if (triggerNodes.length !== 1) {
      throw new Error('Workflow graph must contain exactly one trigger node');
    }

    const outgoing = new Map<string, WorkflowEditorEdge[]>();
    const incoming = new Map<string, string[]>();

    for (const node of graph.nodes) {
      outgoing.set(node.id, []);
      incoming.set(node.id, []);
    }

    for (const edge of graph.edges) {
      if (!nodeMap.has(edge.source)) {
        throw new Error(`Workflow graph references missing source node ${edge.source}`);
      }

      if (!nodeMap.has(edge.target)) {
        throw new Error(`Workflow graph references missing target node ${edge.target}`);
      }

      outgoing.get(edge.source)?.push(edge);
      incoming.get(edge.target)?.push(edge.source);
    }

    const conditionBranches = new Map<string, ValidatedConditionBranches>();

    for (const [nodeId, edges] of outgoing.entries()) {
      edges.sort((left, right) => {
        const leftKey = `${left.sourceHandle ?? ''}:${left.target}`;
        const rightKey = `${right.sourceHandle ?? ''}:${right.target}`;

        return leftKey.localeCompare(rightKey);
      });

      const node = nodeMap.get(nodeId);
      if (node?.type === 'condition') {
        conditionBranches.set(nodeId, validateConditionBranches(nodeId, edges));
      }
    }

    const entryNodeId = triggerNodes[0]?.id;
    const reachable = new Set<string>();
    const stack = [entryNodeId];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || reachable.has(current)) {
        continue;
      }

      reachable.add(current);

      for (const edge of outgoing.get(current) ?? []) {
        stack.push(edge.target);
      }
    }

    for (const node of graph.nodes) {
      if (!reachable.has(node.id)) {
        throw new Error(`Workflow graph contains disconnected node ${node.id}`);
      }
    }

    const indegree = new Map<string, number>();
    for (const node of graph.nodes) {
      indegree.set(node.id, incoming.get(node.id)?.length ?? 0);
    }

    const queue = sortStrings(
      graph.nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id)
    );
    const topologicalOrder: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        break;
      }

      topologicalOrder.push(current);

      for (const edge of outgoing.get(current) ?? []) {
        const nextIndegree = (indegree.get(edge.target) ?? 0) - 1;
        indegree.set(edge.target, nextIndegree);

        if (nextIndegree === 0) {
          queue.push(edge.target);
          queue.sort((left, right) => left.localeCompare(right));
        }
      }
    }

    if (topologicalOrder.length !== graph.nodes.length) {
      throw new Error('Workflow graph contains a cycle');
    }

    const compiledNodes: CompiledDagNode[] = [];

    for (const nodeId of topologicalOrder) {
      const node = nodeMap.get(nodeId);
      if (!node) {
        throw new Error(`Compiled node ${nodeId} could not be resolved`);
      }

      const validatedBranches = conditionBranches.get(nodeId);
      const next = validatedBranches?.next ?? sortStrings((outgoing.get(nodeId) ?? []).map((edge) => edge.target));
      const compiledNode: CompiledDagNode = {
        id: node.id,
        type: node.type,
        next,
        input: { ...node.data }
      };

      if (node.type === 'condition') {
        compiledNode.onTrue = validatedBranches?.onTrue ?? null;
        compiledNode.onFalse = validatedBranches?.onFalse ?? null;
      }

      if (node.type === 'delay') {
        const delayMs = node.data.delayMs;
        if (typeof delayMs !== 'number' || delayMs <= 0) {
          throw new Error(`Delay node ${nodeId} must define a positive delayMs value`);
        }

        compiledNode.input = {
          ...compiledNode.input,
          delayMs,
          resumeStrategy: 'bullmq'
        };
      }

      if (node.type === 'plugin') {
        const pluginId = node.data.pluginId;
        if (typeof pluginId !== 'string' || pluginId.length === 0) {
          throw new Error(`Plugin node ${nodeId} must define pluginId`);
        }

        const pluginRegistry = this.options.pluginRegistry;
        if (!pluginRegistry) {
          throw new Error(`Plugin node ${nodeId} requires a plugin registry for validation`);
        }

        const plugin = pluginRegistry.resolve(pluginId);
        const installation = await PluginInstallationModel.findOne({
          agencyId: input.agencyId,
          tenantId: input.tenantId,
          pluginId,
          enabled: true,
          pluginVersion: plugin.manifest.version
        }).lean().exec();

        if (!installation) {
          throw new Error(`Plugin node ${nodeId} references plugin ${pluginId} that is not enabled for this tenant`);
        }
      }

      compiledNodes.push(compiledNode);
    }

    return parseCompiledDag({
      entryNodeId,
      topologicalOrder,
      nodes: compiledNodes,
      metadata: {
        compiledAt: new Date().toISOString(),
        version: input.version,
        nodeCount: compiledNodes.length
      }
    });
  }
}
