import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { buildWorkflowEngineUrl } from '../api/workflow-engine-client';
import { AUTH_SESSION_COOKIE_NAME, type SessionRecord } from './session';

type WorkflowEngineSessionResponse = {
  user: SessionRecord['actor'];
};

function isRole(value: unknown): value is SessionRecord['actor']['role'] {
  return value === 'platform_admin'
    || value === 'agency_owner'
    || value === 'agency_admin'
    || value === 'agency_member'
    || value === 'viewer';
}

function isScopeRole(value: unknown): value is NonNullable<SessionRecord['actor']['scopeRole']> {
  return value === 'owner'
    || value === 'agency_admin'
    || value === 'client_admin'
    || value === 'agent';
}

function isSessionMembership(value: unknown): value is NonNullable<SessionRecord['actor']['memberships']>[number] {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const membership = value as Record<string, unknown>;
  const hasOptionalScopeRole = membership.scopeRole === undefined || isScopeRole(membership.scopeRole);
  const hasOptionalDefaultTenantId = membership.defaultTenantId === undefined || membership.defaultTenantId === null || typeof membership.defaultTenantId === 'string';
  const hasOptionalCustomRoleId = membership.customRoleId === undefined || typeof membership.customRoleId === 'string';

  return typeof membership.agencyId === 'string'
    && isRole(membership.role)
    && Array.isArray(membership.tenantIds)
    && membership.tenantIds.every((tenantId) => typeof tenantId === 'string')
    && hasOptionalScopeRole
    && hasOptionalDefaultTenantId
    && hasOptionalCustomRoleId;
}

function isSessionActor(value: unknown): value is SessionRecord['actor'] {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const actor = value as Record<string, unknown>;

  const hasOptionalScopeRole = actor.scopeRole === undefined || isScopeRole(actor.scopeRole);
  const hasOptionalClientContext = actor.isClientContextActive === undefined || typeof actor.isClientContextActive === 'boolean';
  const hasOptionalMemberships = actor.memberships === undefined || (Array.isArray(actor.memberships) && actor.memberships.every(isSessionMembership));
  const hasOptionalAccessibleAgencyIds = actor.accessibleAgencyIds === undefined
    || (Array.isArray(actor.accessibleAgencyIds) && actor.accessibleAgencyIds.every((agencyId) => typeof agencyId === 'string'));

  return typeof actor.userId === 'string'
    && typeof actor.agencyId === 'string'
    && typeof actor.tenantId === 'string'
    && Array.isArray(actor.tenantIds)
    && actor.tenantIds.every((tenantId) => typeof tenantId === 'string')
    && typeof actor.email === 'string'
    && typeof actor.fullName === 'string'
    && isRole(actor.role)
    && (actor.status === 'active' || actor.status === 'suspended')
    && hasOptionalScopeRole
    && hasOptionalClientContext
    && hasOptionalMemberships
    && hasOptionalAccessibleAgencyIds;
}

function toCookieHeaderValue(cookieStore: Awaited<ReturnType<typeof cookies>>): string {
  return cookieStore.getAll().map(({ name, value }) => `${name}=${encodeURIComponent(value)}`).join('; ');
}

async function fetchWorkflowEngineSession(): Promise<SessionRecord | null> {
  const cookieStore = await cookies();
  if (!cookieStore.has(AUTH_SESSION_COOKIE_NAME)) {
    return null;
  }

  try {
    const response = await fetch(buildWorkflowEngineUrl('/api/v1/dashboard-auth/session'), {
      method: 'GET',
      headers: {
        cookie: toCookieHeaderValue(cookieStore),
        accept: 'application/json'
      },
      cache: 'no-store'
    });

    if (response.status === 401) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Workflow engine session request failed with ${response.status}`);
    }

    const payload = await response.json() as unknown;
    if (!payload || typeof payload !== 'object' || !('user' in payload) || !isSessionActor(payload.user)) {
      throw new Error('Workflow engine returned invalid session payload');
    }

    const sessionPayload: WorkflowEngineSessionResponse = {
      user: payload.user,
    };

    return {
      id: `workflow-engine:${sessionPayload.user.userId}`,
      actor: sessionPayload.user,
      expiresAt: new Date(Date.now() + 1000 * 60 * 30)
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return null;
    }
    throw error;
  }
}

export async function requireCurrentSession(): Promise<SessionRecord> {
  const session = await fetchWorkflowEngineSession();

  if (!session) {
    redirect('/auth/login');
  }

  return session;
}

export async function getOptionalCurrentSession(): Promise<SessionRecord | null> {
  return fetchWorkflowEngineSession();
}
