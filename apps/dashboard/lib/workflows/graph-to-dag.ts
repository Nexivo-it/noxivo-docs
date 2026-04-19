import { 
  WorkflowEditorGraph, 
  WorkflowEditorNode, 
  WorkflowEditorEdge,
  CompiledDag,
  CompiledDagNode
} from '@noxivo/contracts';

export function compileGraphToDag(graph: WorkflowEditorGraph): CompiledDag {
  const { nodes, edges } = graph;
  
  // 1. Find entry node (trigger)
  const entryNode = nodes.find(n => n.type === 'trigger');
  if (!entryNode) {
    throw new Error('Workflow must have exactly one trigger node.');
  }

  // 2. Build adjacency list and node map
  const adj = new Map<string, string[]>();
  const nodesMap = new Map<string, WorkflowEditorNode>();
  
  nodes.forEach(node => {
    nodesMap.set(node.id, node);
    adj.set(node.id, []);
  });

  edges.forEach(edge => {
    const list = adj.get(edge.source) || [];
    list.push(edge.target);
    adj.set(edge.source, list);
  });

  // 3. Map nodes to CompiledDagNode
  const compiledNodes: CompiledDagNode[] = nodes.map(node => {
    const outgoingEdges = edges.filter(e => e.source === node.id);
    const next = outgoingEdges.map(e => e.target);
    
    // Handle conditional branching
    let onTrue: string | undefined;
    let onFalse: string | undefined;
    
    if (node.type === 'condition') {
      const trueEdge = outgoingEdges.find(e => e.sourceHandle === 'true');
      const falseEdge = outgoingEdges.find(e => e.sourceHandle === 'false');
      onTrue = trueEdge?.target;
      onFalse = falseEdge?.target;
    }

    return {
      id: node.id,
      type: node.type,
      next,
      onTrue,
      onFalse,
      input: (node.data.config as Record<string, unknown>) || {}
    };
  });

  // 4. Simple topological sort (DFS based)
  const topologicalOrder: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(id: string) {
    if (visiting.has(id)) {
      throw new Error('Circular dependency detected in workflow graph.');
    }
    if (!visited.has(id)) {
      visiting.add(id);
      const neighbors = adj.get(id) || [];
      neighbors.forEach(visit);
      visiting.delete(id);
      visited.add(id);
      topologicalOrder.unshift(id);
    }
  }

  // We start from the entry node, then visit any disconnected nodes just to be safe
  visit(entryNode.id);
  nodes.forEach(n => {
    if (!visited.has(n.id)) {
      visit(n.id);
    }
  });

  return {
    entryNodeId: entryNode.id,
    topologicalOrder,
    nodes: compiledNodes,
    metadata: {
      compiledAt: new Date().toISOString(),
      version: '1.0',
      nodeCount: nodes.length
    }
  };
}
