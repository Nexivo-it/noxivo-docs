import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AgencyInvitationModel,
  AgencyModel,
  AuthSessionModel,
  CustomDomainReservationModel,
  TenantModel,
  UserModel,
} from '@noxivo/database';
import { buildServer } from '../src/server.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb,
} from './helpers/mongo-memory.js';

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function createSessionCookie(input: {
  userId: mongoose.Types.ObjectId;
  agencyId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
}): Promise<string> {
  const token = `session-${new mongoose.Types.ObjectId().toString()}`;
  await AuthSessionModel.create({
    userId: input.userId,
    agencyId: input.agencyId,
    tenantId: input.tenantId,
    sessionTokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + 60_000),
    lastSeenAt: new Date(),
  });

  return `noxivo_session=${encodeURIComponent(token)}`;
}

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

describe('agency management routes on workflow-engine', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-workflow-engine-agency-routes-tests' });
    await Promise.all([
      AgencyModel.init(),
      TenantModel.init(),
      UserModel.init(),
      AuthSessionModel.init(),
      AgencyInvitationModel.init(),
      CustomDomainReservationModel.init(),
    ]);
  });

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('supports agency and tenant administration endpoints', async () => {
    const platform = await seedAgencyUser({
      role: 'platform_admin',
      agencyName: 'Platform Home',
      agencySlug: 'platform-home',
      email: 'platform@example.com',
    });

    const cookie = await createSessionCookie(platform);
    const server = await buildServer({ logger: false });

    try {
      const createAgencyResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/agencies',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Acme Agency',
          slug: 'acme-agency',
          plan: 'reseller_pro',
          ownerEmail: 'owner@acme.test',
          ownerFullName: 'Acme Owner',
        },
      });

      expect(createAgencyResponse.statusCode).toBe(201);
      const createdAgencyPayload = createAgencyResponse.json() as {
        agency: { id: string; slug: string };
        ownerInvitation: { email: string; signupUrl: string } | null;
      };
      expect(createdAgencyPayload.agency.slug).toBe('acme-agency');
      expect(createdAgencyPayload.ownerInvitation?.email).toBe('owner@acme.test');

      const listAgenciesResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/agencies',
        headers: { cookie },
      });
      expect(listAgenciesResponse.statusCode).toBe(200);

      const updateAgencyResponse = await server.inject({
        method: 'PATCH',
        url: `/api/v1/agencies/${createdAgencyPayload.agency.id}`,
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Acme Agency Updated',
          supportEmail: 'ops@acme.test',
        },
      });
      expect(updateAgencyResponse.statusCode).toBe(200);

      const agencyDetailResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/agencies/${createdAgencyPayload.agency.id}`,
        headers: { cookie },
      });
      expect(agencyDetailResponse.statusCode).toBe(200);

      const createTenantResponse = await server.inject({
        method: 'POST',
        url: `/api/v1/agencies/${createdAgencyPayload.agency.id}/tenants`,
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Northwind Client',
          slug: 'northwind-client',
          region: 'eu-west-1',
          billingMode: 'tenant_pays',
        },
      });
      expect(createTenantResponse.statusCode).toBe(201);

      const createdTenantPayload = createTenantResponse.json() as { id: string; agencyId: string; slug: string };
      expect(createdTenantPayload.agencyId).toBe(createdAgencyPayload.agency.id);

      const listTenantsResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/agencies/${createdAgencyPayload.agency.id}/tenants`,
        headers: { cookie },
      });
      expect(listTenantsResponse.statusCode).toBe(200);

      const tenantDetailResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/agencies/${createdAgencyPayload.agency.id}/tenants/${createdTenantPayload.id}`,
        headers: { cookie },
      });
      expect(tenantDetailResponse.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });

  it('supports team member and invitation administration endpoints', async () => {
    const owner = await seedAgencyUser({
      role: 'agency_owner',
      agencyName: 'Acme Agency',
      agencySlug: 'acme-agency',
      email: 'owner@acme.test',
    });
    const member = await seedAgencyUser({
      role: 'agency_member',
      agencyName: 'Acme Team',
      agencySlug: 'acme-team',
      email: 'member@acme.test',
    });
    await UserModel.updateOne({ _id: member.userId }, { $set: { agencyId: owner.agencyId, tenantIds: [owner.tenantId], defaultTenantId: owner.tenantId } }).exec();

    const cookie = await createSessionCookie(owner);
    const server = await buildServer({ logger: false });

    try {
      const listTeamResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/agencies/${owner.agencyId.toString()}/team`,
        headers: { cookie },
      });
      expect(listTeamResponse.statusCode).toBe(200);

      const inviteResponse = await server.inject({
        method: 'POST',
        url: `/api/v1/agencies/${owner.agencyId.toString()}/invitations`,
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          email: 'operator@acme.test',
          fullName: 'Operator User',
          role: 'agency_member',
          tenantIds: [owner.tenantId.toString()],
        },
      });
      expect(inviteResponse.statusCode).toBe(201);

      const invitePayload = inviteResponse.json() as { invitation: { id: string; email: string } };
      expect(invitePayload.invitation.email).toBe('operator@acme.test');

      const listInvitationsResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/agencies/${owner.agencyId.toString()}/invitations`,
        headers: { cookie },
      });
      expect(listInvitationsResponse.statusCode).toBe(200);

      const updateInvitationResponse = await server.inject({
        method: 'PATCH',
        url: `/api/v1/agencies/${owner.agencyId.toString()}/invitations/${invitePayload.invitation.id}`,
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          email: 'operator-updated@acme.test',
          fullName: 'Operator Updated',
          role: 'agency_member',
          tenantIds: [owner.tenantId.toString()],
        },
      });
      expect(updateInvitationResponse.statusCode).toBe(200);

      const updateMemberResponse = await server.inject({
        method: 'PATCH',
        url: `/api/v1/agencies/${owner.agencyId.toString()}/team/${member.userId.toString()}`,
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          role: 'agency_admin',
        },
      });
      expect(updateMemberResponse.statusCode).toBe(200);

      const removeMemberResponse = await server.inject({
        method: 'DELETE',
        url: `/api/v1/agencies/${owner.agencyId.toString()}/team/${member.userId.toString()}`,
        headers: { cookie },
      });
      expect(removeMemberResponse.statusCode).toBe(200);

      const revokeInvitationResponse = await server.inject({
        method: 'DELETE',
        url: `/api/v1/agencies/${owner.agencyId.toString()}/invitations/${invitePayload.invitation.id}`,
        headers: { cookie },
      });
      expect(revokeInvitationResponse.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });

  it('rejects agency administration endpoints without a session cookie', async () => {
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/agencies',
      });

      expect(response.statusCode).toBe(401);
    } finally {
      await server.close();
    }
  });

  it('prevents agency admins from creating sibling agencies', async () => {
    const actor = await seedAgencyUser({
      role: 'agency_admin',
      agencyName: 'Acme Agency',
      agencySlug: 'acme-agency',
      email: 'admin@acme.test',
    });

    const cookie = await createSessionCookie(actor);
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/agencies',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Blocked Agency',
          slug: 'blocked-agency',
          plan: 'reseller_basic',
        },
      });

      expect(response.statusCode).toBe(403);
    } finally {
      await server.close();
    }
  });
});
