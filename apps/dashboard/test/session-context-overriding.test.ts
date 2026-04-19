import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pre-hoist mock functions to use in vi.mock
const {
  mockCookies,
  mockHeaders,
  mockAuthSessionFindOne,
  mockUserFindById,
  mockAgencyFindById,
  mockTenantFindOne,
  mockTenantFind,
} = vi.hoisted(() => ({
  mockCookies: vi.fn(),
  mockHeaders: vi.fn(),
  mockAuthSessionFindOne: vi.fn(),
  mockAuthSessionFindByIdAndUpdate: vi.fn(),
  mockUserFindById: vi.fn(),
  mockAgencyFindById: vi.fn(),
  mockTenantFindOne: vi.fn(),
  mockTenantFind: vi.fn(),
}));

// Mock Next.js headers/cookies
vi.mock('next/headers', () => ({
  cookies: mockCookies,
  headers: mockHeaders,
}));

// Mock database models
vi.mock('@noxivo/database', () => ({
  AuthSessionModel: {
    findOne: mockAuthSessionFindOne,
    findByIdAndUpdate: vi.fn().mockReturnValue({ exec: vi.fn() }),
  },
  UserModel: {
    findById: mockUserFindById,
  },
  AgencyModel: {
    findById: mockAgencyFindById,
  },
  TenantModel: {
    findOne: mockTenantFindOne,
    find: mockTenantFind,
  },
  normalizeStoredUserRole: (role: string) => {
    switch (role) {
      case 'owner':
      case 'platform_admin':
        return 'owner';
      case 'agency_owner':
      case 'agency_admin':
        return 'agency_admin';
      case 'client_admin':
        return 'client_admin';
      default:
        return 'agent';
    }
  },
  mapScopeRoleToLegacyRole: (scopeRole: string) => {
    switch (scopeRole) {
      case 'owner':
        return 'platform_admin';
      case 'agency_admin':
        return 'agency_admin';
      default:
        return 'agency_member';
    }
  },
}));

// Mock dbConnect
vi.mock('../lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue(null),
}));

// Import the function after mocks
import { getCurrentSession, AUTH_SESSION_COOKIE_NAME } from '../lib/auth/session';

describe('getCurrentSession context overriding', () => {
  const mockUser = {
    _id: { toString: () => 'user-1' },
    agencyId: { toString: () => 'platform-agency' },
    defaultTenantId: { toString: () => 'platform-tenant' },
    tenantIds: [{ toString: () => 'platform-tenant' }],
    email: 'admin@noxivo.test',
    fullName: 'Platform Admin',
    role: 'platform_admin',
    status: 'active',
    memberships: [],
  };

  const mockSessionDoc = {
    _id: 'session-1',
    userId: 'user-1',
    expiresAt: new Date(Date.now() + 3600000),
  };

  function buildCookieStore(values: Record<string, string>) {
    return {
      get: vi.fn().mockImplementation((name: string) => {
        const value = values[name];
        return value ? { value } : undefined;
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: Return a valid cookie
    mockCookies.mockResolvedValue(buildCookieStore({
      [AUTH_SESSION_COOKIE_NAME]: 'valid-token',
    }));

    // Default: No override header
    mockHeaders.mockResolvedValue({
      get: vi.fn().mockReturnValue(null),
    });

    // Default: Valid session and user
    mockAuthSessionFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockSessionDoc) });
    mockUserFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockUser) });
    mockAgencyFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mockTenantFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mockTenantFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
  });

  it('returns normal session when no override header is present', async () => {
    const session = await getCurrentSession();

    expect(session).not.toBeNull();
    expect(session?.actor.agencyId).toBe('platform-agency');
    expect(session?.actor.role).toBe('platform_admin');
  });

  it('applies agencyId override for platform_admin when x-agency-context is present', async () => {
    const targetAgencyId = 'target-agency-123';
    const targetTenantId = 'target-tenant-456';

    mockHeaders.mockResolvedValue({
      get: vi.fn().mockImplementation((name) => {
        if (name === 'x-agency-context') return targetAgencyId;
        return null;
      }),
    });

    mockAgencyFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: targetAgencyId, name: 'Target Agency' }) });
    mockTenantFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: targetTenantId, agencyId: targetAgencyId }) });
    mockTenantFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: targetTenantId }]) });

    const session = await getCurrentSession();

    expect(session).not.toBeNull();
    expect(session?.actor.agencyId).toBe(targetAgencyId);
    expect(session?.actor.tenantId).toBe(targetTenantId);
    expect(session?.actor.tenantIds).toContain(targetTenantId);
    expect(session?.actor.scopeRole).toBe('owner');
  });

  it('applies tenant override when requested tenant is within scoped tenants', async () => {
    const scopedAgencyId = 'agency-scoped';
    const tenantA = 'tenant-a';
    const tenantB = 'tenant-b';

    const regularUser = {
      ...mockUser,
      role: 'agency_owner',
      agencyId: { toString: () => scopedAgencyId },
      memberships: [{ agencyId: { toString: () => scopedAgencyId }, role: 'agency_owner' }],
    };
    mockUserFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(regularUser) });

    mockHeaders.mockResolvedValue({
      get: vi.fn().mockImplementation((name) => {
        if (name === 'x-agency-context') return scopedAgencyId;
        if (name === 'x-tenant-context') return tenantB;
        return null;
      }),
    });

    mockAgencyFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: scopedAgencyId }) });
    mockTenantFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: tenantA, agencyId: scopedAgencyId }) });
    mockTenantFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: tenantA }, { _id: tenantB }]) });

    const session = await getCurrentSession();

    expect(session?.actor.agencyId).toBe(scopedAgencyId);
    expect(session?.actor.tenantIds).toEqual([tenantA, tenantB]);
    expect(session?.actor.tenantId).toBe(tenantB);
    expect(session?.actor.scopeRole).toBe('agency_admin');
  });

  it('rejects tenant override when requested tenant is outside client scope', async () => {
    const agencyId = 'agency-client';
    const allowedTenantId = 'tenant-allowed';
    const blockedTenantId = 'tenant-blocked';

    const clientScopedUser = {
      ...mockUser,
      role: 'agency_member',
      agencyId: { toString: () => agencyId },
      defaultTenantId: { toString: () => allowedTenantId },
      tenantIds: [{ toString: () => allowedTenantId }],
      memberships: [
        {
          agencyId: { toString: () => agencyId },
          role: 'client_admin',
          tenantIds: [{ toString: () => allowedTenantId }],
          defaultTenantId: { toString: () => allowedTenantId },
        },
      ],
    };
    mockUserFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(clientScopedUser) });

    mockHeaders.mockResolvedValue({
      get: vi.fn().mockImplementation((name) => {
        if (name === 'x-agency-context') return agencyId;
        if (name === 'x-tenant-context') return blockedTenantId;
        return null;
      }),
    });

    mockAgencyFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: agencyId }) });
    mockTenantFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: blockedTenantId, agencyId }) });
    mockTenantFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: allowedTenantId }]) });

    const session = await getCurrentSession();

    expect(session?.actor.agencyId).toBe(agencyId);
    expect(session?.actor.tenantIds).toEqual([allowedTenantId]);
    expect(session?.actor.tenantId).toBe(allowedTenantId);
    expect(session?.actor.scopeRole).toBe('client_admin');
  });

  it('falls back to default agency if target agency does not exist', async () => {
    mockHeaders.mockResolvedValue({
      get: vi.fn().mockReturnValue('non-existent-id'),
    });

    mockAgencyFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const session = await getCurrentSession();

    expect(session?.actor.agencyId).toBe('platform-agency');
  });
});
