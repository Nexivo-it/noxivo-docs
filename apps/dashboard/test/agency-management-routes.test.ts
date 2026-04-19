import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import {
  AgencyInvitationModel,
  AgencyModel,
  CustomDomainReservationModel,
  TenantModel,
  UserModel,
} from '@noxivo/database';
import { GET as listAgencies, POST as createAgency } from '../app/api/agencies/route.js';
import { GET as getAgency, PATCH as patchAgency } from '../app/api/agencies/[agencyId]/route.js';
import { GET as listAgencyTenants, POST as createAgencyTenant } from '../app/api/agencies/[agencyId]/tenants/route.js';
import {
  connectDashboardTestDb,
  disconnectDashboardTestDb,
  resetDashboardTestDb,
} from './helpers/mongo-memory.js';

const { mockGetCurrentSession } = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn(),
}));

vi.mock('../lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession,
}));

async function seedAgencyUser(input: {
  role: 'platform_admin' | 'agency_owner' | 'agency_admin' | 'agency_member' | 'viewer';
  agencyName: string;
  agencySlug: string;
  email: string;
}) {
  const agencyId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  await AgencyModel.create({
    _id: agencyId,
    name: input.agencyName,
    slug: input.agencySlug,
    plan: 'enterprise',
    billingStripeCustomerId: null,
    billingStripeSubscriptionId: null,
    billingOwnerUserId: userId,
    whiteLabelDefaults: {
      customDomain: null,
      logoUrl: null,
      primaryColor: '#6366F1',
      supportEmail: `${input.agencySlug}@example.com`,
      hidePlatformBranding: false,
    },
    usageLimits: { tenants: 5, activeSessions: 25 },
    status: 'active',
  });

  await TenantModel.create({
    _id: tenantId,
    agencyId,
    slug: `${input.agencySlug}-main`,
    name: `${input.agencyName} Main`,
    region: 'us-east-1',
    status: 'active',
    billingMode: 'agency_pays',
    whiteLabelOverrides: {},
    effectiveBrandingCache: {},
  });

  await UserModel.create({
    _id: userId,
    agencyId,
    defaultTenantId: tenantId,
    tenantIds: [tenantId],
    email: input.email,
    fullName: `${input.agencyName} User`,
    passwordHash: 'hash',
    role: input.role,
    status: 'active',
  });

  return { agencyId, tenantId, userId };
}

describe('agency management routes', () => {
  beforeAll(async () => {
    await connectDashboardTestDb({ dbName: 'noxivo-dashboard-agency-management-tests' });
    await Promise.all([
      AgencyModel.init(),
      TenantModel.init(),
      UserModel.init(),
      AgencyInvitationModel.init(),
      CustomDomainReservationModel.init(),
    ]);
  });

  afterEach(async () => {
    mockGetCurrentSession.mockReset();
    await resetDashboardTestDb();
  });

  afterAll(async () => {
    await disconnectDashboardTestDb();
  });

  it('platform admin can create an agency and bootstrap its default tenant', async () => {
    const actor = await seedAgencyUser({
      role: 'platform_admin',
      agencyName: 'Platform Home',
      agencySlug: 'platform-home',
      email: 'platform@example.com',
    });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-platform',
      actor: {
        userId: actor.userId.toString(),
        agencyId: actor.agencyId.toString(),
        tenantId: actor.tenantId.toString(),
        tenantIds: [actor.tenantId.toString()],
        email: 'platform@example.com',
        fullName: 'Platform Admin',
        role: 'platform_admin',
        status: 'active',
      },
      expiresAt: new Date(Date.now() + 60000),
    });

    const response = await createAgency(new Request('http://localhost/api/agencies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Acme Agency',
        slug: 'acme-agency',
        plan: 'reseller_pro',
        ownerEmail: 'owner@acme.test',
        ownerFullName: 'Acme Owner',
      }),
    }));

    const payload = await response.json() as {
      agency: { id: string; slug: string };
      ownerInvitation: { email: string; signupUrl: string } | null;
    };

    expect(response.status).toBe(201);
    expect(payload.agency.slug).toBe('acme-agency');
    expect(payload.ownerInvitation?.email).toBe('owner@acme.test');
    expect(payload.ownerInvitation?.signupUrl).toContain('/acme-agency/auth/signup?invitationToken=');

    expect(await AgencyModel.countDocuments()).toBe(2);
    expect(await TenantModel.countDocuments({ agencyId: payload.agency.id })).toBe(1);
    expect(await AgencyInvitationModel.countDocuments({ agencyId: payload.agency.id, status: 'pending' })).toBe(1);
  });

  it('agency admin cannot create another agency', async () => {
    const actor = await seedAgencyUser({
      role: 'agency_admin',
      agencyName: 'Acme Agency',
      agencySlug: 'acme-agency',
      email: 'admin@acme.test',
    });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-admin',
      actor: {
        userId: actor.userId.toString(),
        agencyId: actor.agencyId.toString(),
        tenantId: actor.tenantId.toString(),
        tenantIds: [actor.tenantId.toString()],
        email: 'admin@acme.test',
        fullName: 'Agency Admin',
        role: 'agency_admin',
        status: 'active',
      },
      expiresAt: new Date(Date.now() + 60000),
    });

    const response = await createAgency(new Request('http://localhost/api/agencies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Blocked Agency', slug: 'blocked-agency', plan: 'reseller_basic' }),
    }));

    expect(response.status).toBe(403);
    expect(await AgencyModel.countDocuments()).toBe(1);
  });

  it('platform admin sees all agencies while agency admin sees only the current agency', async () => {
    const platform = await seedAgencyUser({
      role: 'platform_admin',
      agencyName: 'Platform Home',
      agencySlug: 'platform-home',
      email: 'platform@example.com',
    });
    await seedAgencyUser({
      role: 'agency_owner',
      agencyName: 'Second Agency',
      agencySlug: 'second-agency',
      email: 'owner@second.test',
    });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-platform',
      actor: {
        userId: platform.userId.toString(),
        agencyId: platform.agencyId.toString(),
        tenantId: platform.tenantId.toString(),
        tenantIds: [platform.tenantId.toString()],
        email: 'platform@example.com',
        fullName: 'Platform Admin',
        role: 'platform_admin',
        status: 'active',
      },
      expiresAt: new Date(Date.now() + 60000),
    });

    const platformResponse = await listAgencies();
    const platformPayload = await platformResponse.json() as Array<{ slug: string }>;
    expect(platformResponse.status).toBe(200);
    expect(platformPayload).toHaveLength(2);

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-agency-admin',
      actor: {
        userId: platform.userId.toString(),
        agencyId: platform.agencyId.toString(),
        tenantId: platform.tenantId.toString(),
        tenantIds: [platform.tenantId.toString()],
        email: 'platform@example.com',
        fullName: 'Agency Owner',
        role: 'agency_owner',
        status: 'active',
      },
      expiresAt: new Date(Date.now() + 60000),
    });

    const agencyResponse = await listAgencies();
    const agencyPayload = await agencyResponse.json() as Array<{ slug: string }>;
    expect(agencyResponse.status).toBe(200);
    expect(agencyPayload).toHaveLength(1);
    expect(agencyPayload[0]?.slug).toBe('platform-home');
  });

  it('rejects duplicate agency custom domains and keeps tenant creation scoped under an agency', async () => {
    const actor = await seedAgencyUser({
      role: 'platform_admin',
      agencyName: 'Platform Home',
      agencySlug: 'platform-home',
      email: 'platform@example.com',
    });

    await CustomDomainReservationModel.create({
      domain: 'portal.acme.test',
      ownerType: 'agency',
      ownerId: new mongoose.Types.ObjectId(),
    });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-platform',
      actor: {
        userId: actor.userId.toString(),
        agencyId: actor.agencyId.toString(),
        tenantId: actor.tenantId.toString(),
        tenantIds: [actor.tenantId.toString()],
        email: 'platform@example.com',
        fullName: 'Platform Admin',
        role: 'platform_admin',
        status: 'active',
      },
      expiresAt: new Date(Date.now() + 60000),
    });

    const duplicateDomainResponse = await createAgency(new Request('http://localhost/api/agencies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Acme Agency',
        slug: 'acme-agency',
        customDomain: 'portal.acme.test',
        plan: 'reseller_basic',
      }),
    }));

    expect(duplicateDomainResponse.status).toBe(409);

    const detailResponse = await getAgency(new Request(`http://localhost/api/agencies/${actor.agencyId}`), {
      params: Promise.resolve({ agencyId: actor.agencyId.toString() }),
    });
    expect(detailResponse.status).toBe(200);

    const tenantResponse = await createAgencyTenant(new Request(`http://localhost/api/agencies/${actor.agencyId}/tenants`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Northwind Client',
        slug: 'northwind-client',
        region: 'eu-west-1',
        billingMode: 'tenant_pays',
      }),
    }), {
      params: Promise.resolve({ agencyId: actor.agencyId.toString() }),
    });

    const tenantPayload = await tenantResponse.json() as { agencyId: string; slug: string };
    expect(tenantResponse.status).toBe(201);
    expect(tenantPayload.agencyId).toBe(actor.agencyId.toString());

    const listedTenantsResponse = await listAgencyTenants(new Request(`http://localhost/api/agencies/${actor.agencyId}/tenants`), {
      params: Promise.resolve({ agencyId: actor.agencyId.toString() }),
    });
    const listedTenants = await listedTenantsResponse.json() as Array<{ slug: string }>;
    expect(listedTenants.some((tenant) => tenant.slug === 'northwind-client')).toBe(true);
  });

  it('agency owner can update its own agency but cannot change platform-only fields', async () => {
    const actor = await seedAgencyUser({
      role: 'agency_owner',
      agencyName: 'Acme Agency',
      agencySlug: 'acme-agency',
      email: 'owner@acme.test',
    });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-owner',
      actor: {
        userId: actor.userId.toString(),
        agencyId: actor.agencyId.toString(),
        tenantId: actor.tenantId.toString(),
        tenantIds: [actor.tenantId.toString()],
        email: 'owner@acme.test',
        fullName: 'Agency Owner',
        role: 'agency_owner',
        status: 'active',
      },
      expiresAt: new Date(Date.now() + 60000),
    });

    const forbiddenResponse = await patchAgency(new Request(`http://localhost/api/agencies/${actor.agencyId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'suspended' }),
    }), {
      params: Promise.resolve({ agencyId: actor.agencyId.toString() }),
    });
    expect(forbiddenResponse.status).toBe(403);

    const allowedResponse = await patchAgency(new Request(`http://localhost/api/agencies/${actor.agencyId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Acme Updated', supportEmail: 'ops@acme.test' }),
    }), {
      params: Promise.resolve({ agencyId: actor.agencyId.toString() }),
    });
    const allowedPayload = await allowedResponse.json() as { name: string; supportEmail: string | null };
    expect(allowedResponse.status).toBe(200);
    expect(allowedPayload.name).toBe('Acme Updated');
  });
});
