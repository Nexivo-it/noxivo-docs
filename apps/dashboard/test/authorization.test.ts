import { describe, expect, it } from 'vitest';
import {
  canCreateAgencies,
  canManageAgencies,
  canManageAgencySettings,
  canManageAgencyTeam,
  canManageCredentials,
  canManageTargetAgency,
  canManageWorkflows,
  isPlatformAdmin,
} from '../lib/auth/authorization';
import type { SessionRecord } from '../lib/auth/session';

function buildSession(overrides?: Partial<SessionRecord['actor']>): SessionRecord {
  const actor = {
    userId: 'user-1',
    agencyId: 'agency-1',
    tenantId: 'tenant-1',
    tenantIds: ['tenant-1'],
    email: 'user@noxivo.test',
    fullName: 'Test User',
    role: 'agency_admin',
    scopeRole: 'agency_admin',
    status: 'active',
    memberships: [{ agencyId: 'agency-1', role: 'agency_admin' }],
    accessibleAgencyIds: ['agency-1'],
    ...overrides,
  };

  return {
    id: 'session-1',
    actor: actor as unknown as SessionRecord['actor'],
    expiresAt: new Date(Date.now() + 60_000),
  };
}

describe('authorization scope-aware gates', () => {
  it('treats owner scopeRole as platform access even when legacy role is not platform_admin', () => {
    const session = buildSession({
      role: 'agency_admin',
      scopeRole: 'owner',
      accessibleAgencyIds: ['agency-1', 'agency-2'],
    });

    expect(isPlatformAdmin(session)).toBe(true);
    expect(canCreateAgencies(session)).toBe(true);
    expect(canManageAgencies(session)).toBe(true);
    expect(canManageTargetAgency(session, 'agency-2')).toBe(true);
  });

  it('allows client_admin to manage workflows but not agency settings or team', () => {
    const session = buildSession({
      role: 'agency_member',
      scopeRole: 'client_admin',
      tenantIds: ['tenant-2'],
      memberships: [{ agencyId: 'agency-1', role: 'client_admin', tenantIds: ['tenant-2'] }],
      accessibleAgencyIds: ['agency-1'],
    });

    expect(canManageWorkflows(session)).toBe(true);
    expect(canManageAgencyTeam(session)).toBe(false);
    expect(canManageAgencySettings(session)).toBe(false);
    expect(canManageCredentials(session)).toBe(true);
    expect(canManageAgencies(session)).toBe(false);
  });

  it('restricts agent role from workflow and agency management', () => {
    const session = buildSession({
      role: 'agency_member',
      scopeRole: 'agent',
      memberships: [{ agencyId: 'agency-1', role: 'agent', tenantIds: ['tenant-1'] }],
    });

    expect(canManageWorkflows(session)).toBe(false);
    expect(canManageAgencyTeam(session)).toBe(false);
    expect(canManageAgencySettings(session)).toBe(false);
    expect(canManageCredentials(session)).toBe(false);
    expect(canManageAgencies(session)).toBe(false);
  });

  it('locks agency-level permissions when agency admin is in client context', () => {
    const session = buildSession({
      role: 'agency_admin',
      scopeRole: 'agency_admin',
      isClientContextActive: true,
    });

    expect(canManageAgencyTeam(session)).toBe(false);
    expect(canManageAgencySettings(session)).toBe(false);
    expect(canManageCredentials(session)).toBe(true);
    expect(canManageWorkflows(session)).toBe(true);
  });
});
