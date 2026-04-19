import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { AgencyInvitationModel, AgencyModel, TenantModel, UserModel } from '@noxivo/database';
import { GET as listTeam } from '../app/api/agencies/[agencyId]/team/route.js';
import { POST as inviteMember } from '../app/api/agencies/[agencyId]/invitations/route.js';
import { DELETE as revokeInvitation } from '../app/api/agencies/[agencyId]/invitations/[invitationId]/route.js';
import { DELETE as deleteMember, PATCH as patchMember } from '../app/api/agencies/[agencyId]/team/[userId]/route.js';
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

async function seedAgencyBundle(input: {
  agencyName: string;
  agencySlug: string;
  role: 'agency_owner' | 'agency_admin' | 'agency_member' | 'viewer';
  email: string;
}) {
  const agencyId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  await AgencyModel.create({
    _id: agencyId,
    name: input.agencyName,
    slug: input.agencySlug,
    plan: 'reseller_pro',
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

describe('team management routes', () => {
  beforeAll(async () => {
    await connectDashboardTestDb({ dbName: 'noxivo-dashboard-team-management-tests' });
    await Promise.all([
      AgencyModel.init(),
      TenantModel.init(),
      UserModel.init(),
      AgencyInvitationModel.init(),
    ]);
  });

  afterEach(async () => {
    mockGetCurrentSession.mockReset();
    await resetDashboardTestDb();
  });

  afterAll(async () => {
    await disconnectDashboardTestDb();
  });

  it('agency admin can invite a member to their own agency and the invitation stays scoped', async () => {
    const actor = await seedAgencyBundle({
      agencyName: 'Acme Agency',
      agencySlug: 'acme-agency',
      role: 'agency_admin',
      email: 'admin@acme.test',
    });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-team-admin',
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

    const response = await inviteMember(new Request(`http://localhost/api/agencies/${actor.agencyId}/invitations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'operator@acme.test',
        fullName: 'Operator User',
        role: 'agency_member',
        tenantIds: [actor.tenantId.toString()],
      }),
    }), {
      params: Promise.resolve({ agencyId: actor.agencyId.toString() }),
    });

    const payload = await response.json() as { invitation: { agencyId: string; email: string; tenantIds: string[] } };
    expect(response.status).toBe(201);
    expect(payload.invitation.agencyId).toBe(actor.agencyId.toString());
    expect(payload.invitation.email).toBe('operator@acme.test');
    expect(payload.invitation.tenantIds).toEqual([actor.tenantId.toString()]);

    expect(await AgencyInvitationModel.countDocuments({ agencyId: actor.agencyId, status: 'pending' })).toBe(1);
  });

  it('agency admin cannot invite a member into another agency', async () => {
    const actor = await seedAgencyBundle({
      agencyName: 'Acme Agency',
      agencySlug: 'acme-agency',
      role: 'agency_admin',
      email: 'admin@acme.test',
    });
    const otherAgency = await seedAgencyBundle({
      agencyName: 'Other Agency',
      agencySlug: 'other-agency',
      role: 'agency_owner',
      email: 'owner@other.test',
    });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-team-admin',
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

    const response = await inviteMember(new Request(`http://localhost/api/agencies/${otherAgency.agencyId}/invitations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'operator@other.test',
        role: 'agency_member',
        tenantIds: [otherAgency.tenantId.toString()],
      }),
    }), {
      params: Promise.resolve({ agencyId: otherAgency.agencyId.toString() }),
    });

    expect(response.status).toBe(403);
    expect(await AgencyInvitationModel.countDocuments()).toBe(0);
  });

  it('cannot remove the last agency owner', async () => {
    const owner = await seedAgencyBundle({
      agencyName: 'Acme Agency',
      agencySlug: 'acme-agency',
      role: 'agency_owner',
      email: 'owner@acme.test',
    });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-owner',
      actor: {
        userId: owner.userId.toString(),
        agencyId: owner.agencyId.toString(),
        tenantId: owner.tenantId.toString(),
        tenantIds: [owner.tenantId.toString()],
        email: 'owner@acme.test',
        fullName: 'Agency Owner',
        role: 'agency_owner',
        status: 'active',
      },
      expiresAt: new Date(Date.now() + 60000),
    });

    const deleteResponse = await deleteMember(new Request(`http://localhost/api/agencies/${owner.agencyId}/team/${owner.userId}`, {
      method: 'DELETE',
    }), {
      params: Promise.resolve({ agencyId: owner.agencyId.toString(), userId: owner.userId.toString() }),
    });
    expect(deleteResponse.status).toBe(409);

    const patchResponse = await patchMember(new Request(`http://localhost/api/agencies/${owner.agencyId}/team/${owner.userId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'agency_admin' }),
    }), {
      params: Promise.resolve({ agencyId: owner.agencyId.toString(), userId: owner.userId.toString() }),
    });
    expect(patchResponse.status).toBe(409);
  });

  it('team listing includes members and pending invitations for the scoped agency only', async () => {
    const actor = await seedAgencyBundle({
      agencyName: 'Acme Agency',
      agencySlug: 'acme-agency',
      role: 'agency_owner',
      email: 'owner@acme.test',
    });

    await AgencyInvitationModel.create({
      agencyId: actor.agencyId,
      email: 'pending@acme.test',
      fullName: 'Pending User',
      role: 'agency_member',
      tenantIds: [actor.tenantId],
      invitedByUserId: actor.userId,
      tokenHash: 'pending-token',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60000),
      lastSentAt: new Date(),
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

    const response = await listTeam(new Request(`http://localhost/api/agencies/${actor.agencyId}/team`), {
      params: Promise.resolve({ agencyId: actor.agencyId.toString() }),
    });

    const payload = await response.json() as {
      members: Array<{ email: string }>;
      invitations: Array<{ email: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.members).toHaveLength(1);
    expect(payload.members[0]?.email).toBe('owner@acme.test');
    expect(payload.invitations).toHaveLength(1);
    expect(payload.invitations[0]?.email).toBe('pending@acme.test');

    const invitationId = await AgencyInvitationModel.findOne({ email: 'pending@acme.test' }).then((record) => record?._id.toString());
    expect(invitationId).toBeTruthy();

    const revokeResponse = await revokeInvitation(new Request(`http://localhost/api/agencies/${actor.agencyId}/invitations/${invitationId}`, {
      method: 'DELETE',
    }), {
      params: Promise.resolve({ agencyId: actor.agencyId.toString(), invitationId: invitationId ?? '' }),
    });
    expect(revokeResponse.status).toBe(200);
    expect(await AgencyInvitationModel.countDocuments({ agencyId: actor.agencyId, status: 'pending' })).toBe(0);
  });
});
