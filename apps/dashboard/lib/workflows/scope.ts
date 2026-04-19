import type { SessionRecord } from '../auth/session';

interface WorkflowTenantFilter {
  tenantId: string | { $in: string[] };
}

export function buildWorkflowTenantFilter(session: SessionRecord): WorkflowTenantFilter {
  if (session.actor.tenantId.length > 0) {
    return { tenantId: session.actor.tenantId };
  }

  const scopedTenantIds = session.actor.tenantIds.filter((tenantId) => tenantId.length > 0);
  if (scopedTenantIds.length > 0) {
    return { tenantId: { $in: scopedTenantIds } };
  }

  // Force an empty match when the actor has no usable tenant scope.
  return { tenantId: '__no_tenant_scope__' };
}

export function resolveWorkflowWriteTenantId(session: SessionRecord): string | null {
  if (session.actor.tenantId.length > 0) {
    return session.actor.tenantId;
  }

  const fallbackTenantId = session.actor.tenantIds.find((tenantId) => tenantId.length > 0);
  return fallbackTenantId ?? null;
}
