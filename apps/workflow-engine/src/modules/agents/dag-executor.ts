import {
  WorkflowExecutionEventModel,
  WorkflowRunModel
} from '@noxivo/database';
import { type CompiledDag, type CompiledDagNode } from '@noxivo/contracts';
import { type PluginExecutionResult } from '@noxivo/contracts';
import { type MeterMetric } from '@noxivo/contracts';
import { type PluginRegistry } from '../plugins/registry.service.js';
import {
  applyRuntimeContextPatch,
  type RuntimeContext,
  type RuntimeContextPatch
} from './runtime-context.js';

export interface ContinuationQueue {
  add(
    name: string,
    data: Record<string, unknown>,
    options?: { delay?: number; jobId?: string }
  ): Promise<unknown>;
}

export interface MessagingTarget {
  sessionName: string;
  chatId: string;
}

export interface MessagingSendOperation {
  kind:
    | 'messaging.sendText'
    | 'messaging.sendImage'
    | 'messaging.sendFile'
    | 'messaging.sendButtons'
    | 'messaging.sendList';
  sessionName: string;
  chatId: string;
  payload: Record<string, unknown>;
}

export interface DagExecutorDependencies {
  pluginRegistry: Pick<PluginRegistry, 'execute'>;
  continuationQueue: ContinuationQueue;
  resolveMessagingTarget: (context: RuntimeContext) => Promise<MessagingTarget>;
  meteringCounter?: {
    increment(input: {
      agencyId: string;
      metric: MeterMetric;
      amount: number;
      occurredAt?: Date;
    }): Promise<number>;
  };
  notifyWorkflowFailure?: (input: {
    agencyId: string;
    tenantId: string;
    workflowId: string;
    workflowName: string;
    nodeId: string;
    error: string;
  }) => Promise<void>;
  notifyHandoffRequested?: (input: {
    agencyId: string;
    tenantId: string;
    workflowId: string;
    workflowName: string;
    conversationId: string;
    customerName?: string;
  }) => Promise<void>;
  workflowEventsPublisher?: {
    publishHit(workflowId: string, workflowRunId: string, nodeId: string): Promise<void>;
    publishCompleted(workflowId: string, workflowRunId: string, nodeId: string, output?: Record<string, unknown>): Promise<void>;
    publishFailed(workflowId: string, workflowRunId: string, nodeId: string, error: string): Promise<void>;
  } | undefined;
  memoryService?: {
    getContext(input: {
      agencyId: string;
      tenantId: string;
      contactId: string;
      category?: string;
      limit?: number;
    }): Promise<string[]>;
    upsert(input: {
      agencyId: string;
      tenantId: string;
      contactId: string;
      fact: string;
      category?: string;
      source?: string;
    }): Promise<void>;
  };
}

export interface ExecutionResultRecord {
  nodeId: string;
  status: 'completed' | 'failed' | 'skipped';
  output: unknown;
  error?: string;
}

export interface DagExecutionResult {
  status: 'completed' | 'failed' | 'suspended';
  results: ExecutionResultRecord[];
  context: RuntimeContext;
}

const MAX_PERSISTED_VALUE_LENGTH = 4096;
const SENSITIVE_KEY_PATTERN = /(password|token|secret|authorization|api[_-]?key|cookie|session)/i;

function sanitizeForPersistence(value: unknown): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > MAX_PERSISTED_VALUE_LENGTH
      ? `${value.slice(0, MAX_PERSISTED_VALUE_LENGTH)}…`
      : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((entry) => sanitizeForPersistence(entry));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 25);

    return Object.fromEntries(entries.map(([key, entryValue]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, '[redacted]'];
      }

      return [key, sanitizeForPersistence(entryValue)];
    }));
  }

  return String(value);
}

function toNodeLookup(dag: CompiledDag): Map<string, CompiledDagNode> {
  return new Map(dag.nodes.map((node) => [node.id, node]));
}

export class DagExecutor {
  private readonly nodeLookup: Map<string, CompiledDagNode>;
  private readonly topologicalIndex: Map<string, number>;

  constructor(
    private readonly dag: CompiledDag,
    private readonly dependencies: DagExecutorDependencies
  ) {
    this.nodeLookup = toNodeLookup(dag);
    this.topologicalIndex = new Map(dag.topologicalOrder.map((nodeId, index) => [nodeId, index]));
  }

  async execute(initialContext: RuntimeContext): Promise<DagExecutionResult> {
    let context = {
      ...initialContext,
      payload: { ...initialContext.payload },
      pendingNodeIds: initialContext.pendingNodeIds.length > 0
        ? [...initialContext.pendingNodeIds]
        : (initialContext.visitedNodeIds.length === 0 ? [this.dag.entryNodeId] : []),
      visitedNodeIds: [...initialContext.visitedNodeIds],
      branchDecisions: { ...initialContext.branchDecisions }
    };
    const results: ExecutionResultRecord[] = [];
    const runIdentityFilter = {
      workflowRunId: context.workflowRunId,
      conversationId: context.conversationId,
      agencyId: context.agencyId,
      tenantId: context.tenantId
    };

    const existingRun = await WorkflowRunModel.findOne(runIdentityFilter).lean().exec();
    if (existingRun && existingRun.workflowDefinitionId !== context.workflowDefinitionId) {
      throw new Error(
        `Workflow run ${context.workflowRunId} belongs to a different workflow definition`
      );
    }

    const runFilter = runIdentityFilter;

    await WorkflowRunModel.findOneAndUpdate(
      runFilter,
      {
        $setOnInsert: {
          workflowRunId: context.workflowRunId,
          conversationId: context.conversationId,
          workflowDefinitionId: context.workflowDefinitionId,
          agencyId: context.agencyId,
          tenantId: context.tenantId,
          startedAt: new Date()
        },
        $set: {
          status: 'running',
          currentNodeId: context.currentNodeId,
          contextPatch: {
            payload: sanitizeForPersistence(context.payload),
            pendingNodeIds: context.pendingNodeIds,
            visitedNodeIds: context.visitedNodeIds,
            branchDecisions: context.branchDecisions
          }
        }
      },
      { upsert: true, new: true }
    ).exec();

    while (context.pendingNodeIds.length > 0) {
      const currentNodeId = this.nextExecutableNodeId(context.pendingNodeIds, context.visitedNodeIds);

      if (!currentNodeId) {
        throw new Error('No executable pending node could be resolved from runtime state');
      }

      if (context.visitedNodeIds.includes(currentNodeId)) {
        throw new Error(`Node ${currentNodeId} has already been executed in this workflow run`);
      }

      const node = this.nodeLookup.get(currentNodeId);
      if (!node) {
        throw new Error(`Node ${currentNodeId} not found in compiled DAG`);
      }

      if (this.dependencies.workflowEventsPublisher) {
        await this.dependencies.workflowEventsPublisher.publishHit(
          context.workflowDefinitionId,
          context.workflowRunId,
          node.id
        );
      }

      const startedAt = new Date();
      const runningEvent = await WorkflowExecutionEventModel.create({
        workflowRunId: context.workflowRunId,
        workflowDefinitionId: context.workflowDefinitionId,
        conversationId: context.conversationId,
        agencyId: context.agencyId,
        tenantId: context.tenantId,
        nodeId: node.id,
        startedAt,
        status: 'running'
      });

      try {
        const step = await this.withRetry(() => this.executeNode(node, context));
        const remainingPendingNodeIds = context.pendingNodeIds.filter((nodeId) => nodeId !== currentNodeId);
        const contextPatch: RuntimeContextPatch = {
          visitedNodeId: node.id,
          currentNodeId: node.id,
          pendingNodeIds: this.mergePendingNodeIds(remainingPendingNodeIds, context.visitedNodeIds, step.pendingNodeIds)
        };

        if (step.contextPatch) {
          contextPatch.payload = step.contextPatch;
        }

        if (step.branchDecision) {
          contextPatch.branchDecision = step.branchDecision;
        }

        context = applyRuntimeContextPatch(context, contextPatch);

        await WorkflowExecutionEventModel.findByIdAndUpdate(runningEvent._id, {
          status: step.status,
          output: sanitizeForPersistence(step.output),
          finishedAt: new Date(),
          error: step.error ? String(sanitizeForPersistence(step.error)) : null
        }).exec();

        if (this.dependencies.workflowEventsPublisher) {
          if (step.status === 'completed') {
            await this.dependencies.workflowEventsPublisher.publishCompleted(
              context.workflowDefinitionId,
              context.workflowRunId,
              node.id,
              step.output as Record<string, unknown>
            );
          } else if (step.status === 'failed') {
            await this.dependencies.workflowEventsPublisher.publishFailed(
              context.workflowDefinitionId,
              context.workflowRunId,
              node.id,
              step.error ?? 'Unknown error'
            );
          }
        }

        results.push({
          nodeId: node.id,
          status: step.status,
          output: step.output,
          ...(step.error ? { error: step.error } : {})
        });

        await WorkflowRunModel.findOneAndUpdate(
          runFilter,
          {
            currentNodeId: node.id,
            contextPatch: {
              payload: sanitizeForPersistence(context.payload),
              pendingNodeIds: context.pendingNodeIds,
              visitedNodeIds: context.visitedNodeIds,
              branchDecisions: context.branchDecisions
            },
            status: step.runStatus
          }
        ).exec();

        if (step.runStatus === 'suspended') {
          await WorkflowRunModel.findOneAndUpdate(
            runFilter,
            {
              status: 'suspended',
              contextPatch: {
                payload: sanitizeForPersistence(context.payload),
                pendingNodeIds: context.pendingNodeIds,
                visitedNodeIds: context.visitedNodeIds,
                branchDecisions: context.branchDecisions
              }
            }
          ).exec();

          return {
            status: 'suspended',
            results,
            context
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown execution error';

        await WorkflowExecutionEventModel.findByIdAndUpdate(runningEvent._id, {
          status: 'failed',
          output: sanitizeForPersistence({ error: message }),
          finishedAt: new Date(),
          error: String(sanitizeForPersistence(message))
        }).exec();

        if (this.dependencies.workflowEventsPublisher) {
          await this.dependencies.workflowEventsPublisher.publishFailed(
            context.workflowDefinitionId,
            context.workflowRunId,
            node.id,
            message
          );
        }

        results.push({
          nodeId: node.id,
          status: 'failed',
          output: { error: message },
          error: message
        });

        await WorkflowRunModel.findOneAndUpdate(
          runFilter,
          { status: 'failed', finishedAt: new Date(), currentNodeId: node.id }
        ).exec();

        if (this.dependencies.notifyWorkflowFailure) {
          this.dependencies.notifyWorkflowFailure({
            agencyId: context.agencyId,
            tenantId: context.tenantId,
            workflowId: context.workflowDefinitionId,
            workflowName: '',
            nodeId: node.id,
            error: message
          }).catch(() => {});
        }

        return {
          status: 'failed',
          results,
          context
        };
      }
    }

    await WorkflowRunModel.findOneAndUpdate(
      runFilter,
      { status: 'completed', finishedAt: new Date() }
    ).exec();

    return {
      status: 'completed',
      results,
      context
    };
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        // Don't retry if it's a validation error or something that won't change
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('missing') || message.includes('unsupported') || message.includes('not found')) {
          throw error;
        }
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        }
      }
    }
    throw lastError;
  }

  private async executeNode(
    node: CompiledDagNode,
    context: RuntimeContext
  ): Promise<{
    status: 'completed';
    output: unknown;
    pendingNodeIds: string[];
    runStatus: 'running' | 'completed' | 'suspended';
    contextPatch?: Record<string, unknown>;
    branchDecision?: { nodeId: string; value: boolean };
    error?: string;
  }> {
    switch (node.type) {
      case 'trigger':
        return {
          status: 'completed',
          output: { accepted: true },
          pendingNodeIds: [...node.next],
          runStatus: node.next.length > 0 ? 'running' : 'completed'
        };

      case 'condition': {
        const result = this.evaluateCondition(node, context);
        const branchTarget = result ? node.onTrue ?? null : node.onFalse ?? null;
        return {
          status: 'completed',
          output: { result },
          pendingNodeIds: branchTarget ? [branchTarget] : [],
          runStatus: branchTarget ? 'running' : 'completed',
          branchDecision: { nodeId: node.id, value: result }
        };
      }

      case 'plugin': {
        const pluginId = node.input.pluginId;
        if (typeof pluginId !== 'string' || pluginId.length === 0) {
          throw new Error(`Plugin node ${node.id} is missing pluginId`);
        }

        const { pluginId: _pluginId, ...pluginPayload } = node.input;
        const payload = {
          ...context.payload,
          ...pluginPayload
        };

        const pluginResult = await this.dependencies.pluginRegistry.execute({
          pluginId,
          subject: { agencyId: context.agencyId, tenantId: context.tenantId },
          payload
        }) as PluginExecutionResult;

        if (!pluginResult.success) {
          throw new Error(pluginResult.error ?? 'Plugin execution failed');
        }

        if (this.dependencies.meteringCounter) {
          await this.dependencies.meteringCounter.increment({
            agencyId: context.agencyId,
            metric: 'plugin_execution',
            amount: 1,
            occurredAt: new Date()
          });
        }

        return {
          status: 'completed',
          output: pluginResult,
          pendingNodeIds: [...node.next],
          runStatus: node.next.length > 0 ? 'running' : 'completed'
        };
      }

      case 'action': {
        const operation = await this.buildMessagingSendOperation(node, context);

        if (this.dependencies.meteringCounter) {
          await this.dependencies.meteringCounter.increment({
            agencyId: context.agencyId,
            metric: 'outbound_message',
            amount: 1,
            occurredAt: new Date()
          });
        }

        return {
          status: 'completed',
          output: operation,
          pendingNodeIds: [...node.next],
          runStatus: node.next.length > 0 ? 'running' : 'completed'
        };
      }

      case 'delay': {
        const delayMs = node.input.delayMs;
        if (typeof delayMs !== 'number' || delayMs <= 0) {
          throw new Error(`Delay node ${node.id} must define a positive delayMs value`);
        }

        await this.dependencies.continuationQueue.add(
          'workflow.delay.resume',
          {
            workflowRunId: context.workflowRunId,
            nodeId: node.id,
            conversationId: context.conversationId,
            workflowDefinitionId: context.workflowDefinitionId,
            agencyId: context.agencyId,
            tenantId: context.tenantId,
            pendingNodeIds: node.next
          },
          {
            delay: delayMs,
            jobId: `workflow.delay.resume:${context.workflowRunId}:${node.id}`
          }
        );

        return {
          status: 'completed',
          output: { scheduled: true, delayMs },
          pendingNodeIds: [...node.next],
          runStatus: 'suspended'
        };
      }

      case 'handoff':
        if (this.dependencies.notifyHandoffRequested) {
          this.dependencies.notifyHandoffRequested({
            agencyId: context.agencyId,
            tenantId: context.tenantId,
            workflowId: context.workflowDefinitionId,
            workflowName: '',
            conversationId: context.conversationId
          }).catch(() => {});
        }
        return {
          status: 'completed',
          output: { handedOff: true },
          pendingNodeIds: [],
          runStatus: 'completed'
        };

      case 'airtable':
      case 'google_sheets':
      case 'webhook':
      case 'crm':
      case 'agentic_ai': {
        const pluginId = node.type === 'airtable'
          ? 'airtable'
          : node.type === 'google_sheets'
            ? 'google-sheets'
            : node.type === 'webhook'
              ? 'webhook'
              : node.type === 'agentic_ai'
                ? 'ai-sales-agent'
                : 'hubspot';
        const payload = {
          ...context.payload,
          ...node.input
        };

        const pluginResult = await this.dependencies.pluginRegistry.execute({
          pluginId,
          subject: { agencyId: context.agencyId, tenantId: context.tenantId },
          payload
        }) as PluginExecutionResult;

        if (!pluginResult.success) {
          throw new Error(pluginResult.error ?? `${node.type} execution failed`);
        }

        return {
          status: 'completed',
          output: pluginResult.output,
          pendingNodeIds: [...node.next],
          runStatus: node.next.length > 0 ? 'running' : 'completed'
        };
      }

      default:
        throw new Error(`Unsupported node type ${String(node.type)}`);
    }
  }

  private evaluateCondition(node: CompiledDagNode, context: RuntimeContext): boolean {
    const sourceKey = node.input.sourceKey;
    const operator = node.input.operator;
    const expectedValue = node.input.value;

    if (typeof sourceKey !== 'string' || sourceKey.length === 0) {
      throw new Error(`Condition node ${node.id} is missing sourceKey`);
    }

    if (operator !== 'equals' && operator !== 'notEquals') {
      throw new Error(`Condition node ${node.id} uses unsupported operator ${String(operator)}`);
    }

    const actualValue = context.payload[sourceKey];
    return operator === 'equals' ? actualValue === expectedValue : actualValue !== expectedValue;
  }

  private async buildMessagingSendOperation(
    node: CompiledDagNode,
    context: RuntimeContext
  ): Promise<MessagingSendOperation> {
    const target = await this.dependencies.resolveMessagingTarget(context);
    const operation = node.input.operation;

    if (operation === 'sendText') {
      const text = node.input.text;
      if (typeof text !== 'string' || text.length === 0) {
        throw new Error(`Action node ${node.id} must define text`);
      }
      return {
        kind: 'messaging.sendText',
        sessionName: target.sessionName,
        chatId: target.chatId,
        payload: { text }
      };
    }

    if (operation === 'sendImage') {
      const url = node.input.url;
      const caption = node.input.caption;
      if (typeof url !== 'string' || url.length === 0) {
        throw new Error(`Action node ${node.id} must define url for sendImage`);
      }
      return {
        kind: 'messaging.sendImage',
        sessionName: target.sessionName,
        chatId: target.chatId,
        payload: { file: { url }, caption }
      };
    }

    if (operation === 'sendFile') {
      const url = node.input.url;
      const filename = node.input.filename;
      const caption = node.input.caption;
      if (typeof url !== 'string' || url.length === 0) {
        throw new Error(`Action node ${node.id} must define url for sendFile`);
      }
      return {
        kind: 'messaging.sendFile',
        sessionName: target.sessionName,
        chatId: target.chatId,
        payload: { file: { url }, filename, caption }
      };
    }

    throw new Error(`Action node ${node.id} uses unsupported MessagingProvider operation ${String(operation)}`);
  }

  private nextExecutableNodeId(pendingNodeIds: string[], visitedNodeIds: string[]): string | null {
    const pending = [...pendingNodeIds].sort((left, right) => {
      return (this.topologicalIndex.get(left) ?? Number.MAX_SAFE_INTEGER)
        - (this.topologicalIndex.get(right) ?? Number.MAX_SAFE_INTEGER);
    });

    for (const nodeId of pending) {
      if (!visitedNodeIds.includes(nodeId)) {
        return nodeId;
      }
    }

    return null;
  }

  private mergePendingNodeIds(
    currentPendingNodeIds: string[],
    visitedNodeIds: string[],
    nextNodeIds: string[]
  ): string[] {
    const merged = new Set<string>(currentPendingNodeIds);

    for (const nodeId of nextNodeIds) {
      if (!visitedNodeIds.includes(nodeId)) {
        merged.add(nodeId);
      }
    }

    return [...merged].sort((left, right) => {
      return (this.topologicalIndex.get(left) ?? Number.MAX_SAFE_INTEGER)
        - (this.topologicalIndex.get(right) ?? Number.MAX_SAFE_INTEGER);
    });
  }
}
