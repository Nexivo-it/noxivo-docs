import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { UserModel, AgencyModel, TenantModel, AuthSessionModel } from '@noxivo/database';
import { getCurrentSession, AUTH_SESSION_COOKIE_NAME } from '../lib/auth/session';
import { connectDashboardTestDb, disconnectDashboardTestDb, resetDashboardTestDb } from './helpers/mongo-memory';
import { createHash } from 'crypto';

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Mock next/headers and next/cookies
vi.mock('next/headers', () => ({
  headers: vi.fn(),
  cookies: vi.fn(),
}));

import { headers, cookies } from 'next/headers';

describe('Auth RBAC & Context Switching Logic', () => {
  beforeAll(async () => {
    await connectDashboardTestDb({ dbName: 'auth-rbac-test' });
  });

  afterAll(async () => {
    await disconnectDashboardTestDb();
  });

  beforeEach(async () => {
    await resetDashboardTestDb();
    vi.clearAllMocks();
  });

  const createTestAgency = async (name: string, slug: string, ownerId: mongoose.Types.ObjectId) => {
    return AgencyModel.create({
      name,
      slug,
      plan: 'enterprise',
      status: 'active',
      billingOwnerUserId: ownerId,
      usageLimits: { tenants: 10, activeSessions: 100 },
      whiteLabelDefaults: {
        customDomain: null,
        logoUrl: null,
        primaryColor: '#000000',
        supportEmail: 'support@test.com',
        hidePlatformBranding: false
      }
    });
  };

  describe('getCurrentSession with Multi-Agency', () => {
    it('should allow platform_admin to override context to ANY agency', async () => {
      const adminId = new mongoose.Types.ObjectId();
      const admin = await UserModel.create({
        _id: adminId,
        email: 'admin@noxivo.ai',
        fullName: 'Platform Admin',
        passwordHash: 'hash',
        role: 'platform_admin',
        status: 'active',
        agencyId: new mongoose.Types.ObjectId(), // legacy
        defaultTenantId: new mongoose.Types.ObjectId() // legacy
      });

      const targetAgency = await createTestAgency('Target Agency', 'target-agency', admin._id);
      const targetTenant = await TenantModel.create({
        agencyId: targetAgency._id,
        name: 'Main Office',
        slug: 'main-office',
        region: 'us-east-1',
        billingMode: 'agency_pays',
        status: 'active'
      });

      const sessionToken = 'test-token';
      await AuthSessionModel.create({
        userId: admin._id,
        agencyId: targetAgency._id,
        tenantId: targetTenant._id,
        sessionTokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 100000)
      });

      (cookies as any).mockReturnValue({
        get: vi.fn().mockImplementation((name) => {
          if (name === AUTH_SESSION_COOKIE_NAME) return { value: sessionToken };
          if (name === 'nf_agency_context') return { value: targetAgency._id.toString() };
          return undefined;
        })
      });
      (headers as any).mockReturnValue({ get: vi.fn().mockReturnValue(null) });

      const result = await getCurrentSession();

      expect(result).not.toBeNull();
      expect(result?.actor.agencyId).toBe(targetAgency._id.toString());
      expect(result?.actor.role).toBe('platform_admin');
    });

    it('should allow multi-agency user to override context to assigned agency', async () => {
      const dummyOwnerId = new mongoose.Types.ObjectId();
      const agency1 = await createTestAgency('Agency 1', 'agency-1', dummyOwnerId);
      const agency2 = await createTestAgency('Agency 2', 'agency-2', dummyOwnerId);
      
      const user = await UserModel.create({
        email: 'agent@test.com',
        fullName: 'Support Agent',
        passwordHash: 'hash',
        status: 'active',
        memberships: [
          { agencyId: agency1._id, role: 'agency_owner' },
          { agencyId: agency2._id, role: 'agency_member' }
        ]
      });

      const sessionToken = 'test-token-multi';
      await AuthSessionModel.create({
        userId: user._id,
        agencyId: agency1._id,
        tenantId: user._id,
        sessionTokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 100000)
      });

      (cookies as any).mockReturnValue({
        get: vi.fn().mockImplementation((name) => {
          if (name === AUTH_SESSION_COOKIE_NAME) return { value: sessionToken };
          if (name === 'nf_agency_context') return { value: agency2._id.toString() };
          return undefined;
        })
      });
      (headers as any).mockReturnValue({ get: vi.fn().mockReturnValue(null) });

      const result = await getCurrentSession();

      expect(result?.actor.agencyId).toBe(agency2._id.toString());
      expect(result?.actor.role).toBe('agency_member');
    });

    it('should REJECT context override if user does not belong to target agency', async () => {
      const dummyOwnerId = new mongoose.Types.ObjectId();
      const agency1 = await createTestAgency('Agency 1', 'agency-1', dummyOwnerId);
      const rogueAgency = await createTestAgency('Rogue', 'rogue-agency', dummyOwnerId);
      
      const user = await UserModel.create({
        email: 'victim@test.com',
        fullName: 'Victim',
        passwordHash: 'hash',
        status: 'active',
        memberships: [{ agencyId: agency1._id, role: 'agency_owner' }]
      });

      const sessionToken = 'test-token-isolation';
      await AuthSessionModel.create({
        userId: user._id,
        agencyId: agency1._id,
        tenantId: user._id,
        sessionTokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 100000)
      });

      (cookies as any).mockReturnValue({
        get: vi.fn().mockImplementation((name) => {
          if (name === AUTH_SESSION_COOKIE_NAME) return { value: sessionToken };
          if (name === 'nf_agency_context') return { value: rogueAgency._id.toString() };
          return undefined;
        })
      });
      (headers as any).mockReturnValue({ get: vi.fn().mockReturnValue(null) });

      const result = await getCurrentSession();

      expect(result?.actor.agencyId).toBe(agency1._id.toString());
      expect(result?.actor.agencyId).not.toBe(rogueAgency._id.toString());
    });
  });
});
