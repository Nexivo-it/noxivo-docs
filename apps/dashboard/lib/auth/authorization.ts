import type { SessionRecord } from './session';

function getScopeRole(session: SessionRecord): SessionRecord['actor']['scopeRole'] {
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

export function isClientContextActive(session: SessionRecord): boolean {
  if (session.actor.isClientContextActive) {
    return true;
  }

  const scopeRole = getScopeRole(session);
  return scopeRole === 'client_admin' || scopeRole === 'agent';
}

export function isPlatformAdmin(session: SessionRecord): boolean {
  return getScopeRole(session) === 'owner' || session.actor.role === 'platform_admin';
}

export function canManageAgencies(session: SessionRecord): boolean {
  return isPlatformAdmin(session) && !isClientContextActive(session);
}

export function canManageAgencyTeam(session: SessionRecord): boolean {
  if (isClientContextActive(session)) {
    return false;
  }
  const scopeRole = getScopeRole(session);
  return isPlatformAdmin(session) || scopeRole === 'agency_admin';
}

export function canManageAgencySettings(session: SessionRecord): boolean {
  if (isClientContextActive(session)) {
    return false;
  }
  const scopeRole = getScopeRole(session);
  return isPlatformAdmin(session) || scopeRole === 'agency_admin';
}

export function canManageWorkflows(session: SessionRecord): boolean {
  const scopeRole = getScopeRole(session);
  return isPlatformAdmin(session) || scopeRole === 'agency_admin' || scopeRole === 'client_admin';
}

export function canManageCredentials(session: SessionRecord): boolean {
  const scopeRole = getScopeRole(session);
  return scopeRole === 'agency_admin' || scopeRole === 'client_admin';
}

export function canCreateAgencies(session: SessionRecord): boolean {
  return isPlatformAdmin(session);
}

export function canManageTargetAgency(session: SessionRecord, agencyId: string): boolean {
  if (isPlatformAdmin(session)) {
    return true;
  }

  if (session.actor.agencyId === agencyId) {
    return true;
  }

  return (session.actor.accessibleAgencyIds ?? []).includes(agencyId);
}
