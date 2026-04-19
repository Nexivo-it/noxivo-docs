import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '../lib/auth/session';
import { buildWorkflowTenantFilter, resolveWorkflowWriteTenantId } from '../lib/workflows/scope';

function createSession(overrides?: Partial<SessionRecord['actor']>): SessionRecord {
  const actor: SessionRecord['actor'] = {
    userId: 'user-1',
    agencyId: 'agency-1',
    tenantId: 'tenant-1',
    tenantIds: ['tenant-1'],
    email: 'user@example.com',
    fullName: 'Test User',
    role: 'agency_admin',
    status: 'active',
    memberships: [],
    ...overrides
  };

  return {
    id: 'session-1',
    actor,
    expiresAt: new Date(Date.now() + 60_000)
  };
}

describe('workflow scope helpers', () => {
  it('builds tenant filter from actor.tenantId first when active tenant exists', () => {
    const session = createSession({ tenantId: 'tenant-main', tenantIds: ['tenant-a', 'tenant-b'] });
    expect(buildWorkflowTenantFilter(session)).toEqual({ tenantId: 'tenant-main' });
  });

  it('falls back to actor.tenantIds when active tenant is empty', () => {
    const session = createSession({ tenantId: '', tenantIds: ['tenant-a', 'tenant-b'] });
    expect(buildWorkflowTenantFilter(session)).toEqual({ tenantId: { $in: ['tenant-a', 'tenant-b'] } });
  });

  it('returns an empty-scope sentinel when no tenant context is available', () => {
    const session = createSession({ tenantId: '', tenantIds: [] });
    expect(buildWorkflowTenantFilter(session)).toEqual({ tenantId: '__no_tenant_scope__' });
  });

  it('resolves write tenant from actor.tenantId first', () => {
    const session = createSession({ tenantId: 'tenant-main', tenantIds: ['tenant-a'] });
    expect(resolveWorkflowWriteTenantId(session)).toBe('tenant-main');
  });

  it('falls back to first non-empty tenantId when actor.tenantId is blank', () => {
    const session = createSession({ tenantId: '', tenantIds: ['', 'tenant-a', 'tenant-b'] });
    expect(resolveWorkflowWriteTenantId(session)).toBe('tenant-a');
  });

  it('returns null when no write tenant is available', () => {
    const session = createSession({ tenantId: '', tenantIds: [] });
    expect(resolveWorkflowWriteTenantId(session)).toBeNull();
  });
});
