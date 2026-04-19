export interface RuntimeContext {
  workflowRunId: string;
  conversationId: string;
  workflowDefinitionId: string;
  agencyId: string;
  tenantId: string;
  payload: Record<string, unknown>;
  pendingNodeIds: string[];
  visitedNodeIds: string[];
  currentNodeId: string | null;
  branchDecisions: Record<string, boolean>;
}

export interface RuntimeContextPatch {
  payload?: Record<string, unknown>;
  pendingNodeIds?: string[];
  visitedNodeId?: string;
  currentNodeId?: string | null;
  branchDecision?: {
    nodeId: string;
    value: boolean;
  };
}

export function createInitialRuntimeContext(input: {
  workflowRunId: string;
  conversationId: string;
  workflowDefinitionId: string;
  agencyId: string;
  tenantId: string;
  payload?: Record<string, unknown>;
  pendingNodeIds?: string[];
  visitedNodeIds?: string[];
  currentNodeId?: string | null;
  branchDecisions?: Record<string, boolean>;
}): RuntimeContext {
  return {
    workflowRunId: input.workflowRunId,
    conversationId: input.conversationId,
    workflowDefinitionId: input.workflowDefinitionId,
    agencyId: input.agencyId,
    tenantId: input.tenantId,
    payload: { ...(input.payload ?? {}) },
    pendingNodeIds: [...(input.pendingNodeIds ?? [])],
    visitedNodeIds: [...(input.visitedNodeIds ?? [])],
    currentNodeId: input.currentNodeId ?? null,
    branchDecisions: { ...(input.branchDecisions ?? {}) }
  };
}

export function applyRuntimeContextPatch(
  context: RuntimeContext,
  patch: RuntimeContextPatch
): RuntimeContext {
  const nextVisitedNodeIds = patch.visitedNodeId
    ? [...context.visitedNodeIds, patch.visitedNodeId]
    : [...context.visitedNodeIds];

  return {
    ...context,
    payload: patch.payload ? { ...context.payload, ...patch.payload } : { ...context.payload },
    pendingNodeIds: patch.pendingNodeIds ? [...patch.pendingNodeIds] : [...context.pendingNodeIds],
    visitedNodeIds: nextVisitedNodeIds,
    currentNodeId: patch.currentNodeId ?? context.currentNodeId,
    branchDecisions: patch.branchDecision
      ? {
          ...context.branchDecisions,
          [patch.branchDecision.nodeId]: patch.branchDecision.value
        }
      : { ...context.branchDecisions }
  };
}
