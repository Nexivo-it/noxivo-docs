import type { ScopeRole } from '@noxivo/database';
import type { SessionRecord } from '../agency/session-auth.js';

function getScopeRole(session: SessionRecord): ScopeRole {
  if (session.actor.scopeRole) {
    return session.actor.scopeRole;
  }

  switch (session.actor.role) {
    case 'platform_admin':
      return 'owner';
    case 'agency_owner':
    case 'agency_admin':
      return 'agency_admin';
    default:
      return 'agent';
  }
}

function isPlatformAdmin(session: SessionRecord): boolean {
  return getScopeRole(session) === 'owner' || session.actor.role === 'platform_admin';
}

export function canManageWorkflows(session: SessionRecord): boolean {
  const scopeRole = getScopeRole(session);
  return isPlatformAdmin(session) || scopeRole === 'agency_admin' || scopeRole === 'client_admin';
}
