import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AgencyInvitationModel,
  AgencyModel,
  AuthSessionModel,
  TenantModel,
  UserModel,
  hashPassword,
} from '@noxivo/database';
import { buildServer } from '../src/server.js';
import { mapDashboardAuthError } from '../src/modules/dashboard-auth/routes/index.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb,
} from './helpers/mongo-memory.js';

function readCookieHeader(setCookieHeader: string | string[] | undefined): string {
  if (Array.isArray(setCookieHeader)) {
    return setCookieHeader[0] ?? '';
  }
  return setCookieHeader ?? '';
}

function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function seedLoginUser() {
  const agencyId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  await AgencyModel.create({
    _id: agencyId,
    name: 'Login Agency',
    slug: 'login-agency',
    plan: 'reseller_pro',
    billingStripeCustomerId: null,
    billingStripeSubscriptionId: null,
    billingOwnerUserId: userId,
    whiteLabelDefaults: {
      customDomain: null,
      logoUrl: null,
      primaryColor: '#4F46E5',
      supportEmail: 'login-agency@noxivo.test',
      hidePlatformBranding: false,
    },
    usageLimits: { tenants: 5, activeSessions: 25 },
    status: 'active',
  });

  await TenantModel.create({
    _id: tenantId,
    agencyId,
    slug: 'login-agency-main',
    name: 'Login Agency Workspace',
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
    email: 'owner@login-agency.test',
    fullName: 'Login Owner',
    passwordHash: await hashPassword('supersecret123'),
    role: 'agency_owner',
    status: 'active',
  });

  return { agencyId, tenantId, userId };
}

async function seedAgencyWithBranding(input: {
  name: string;
  slug: string;
  primaryColor: string | null;
  supportEmail: string | null;
}) {
  const agencyId = new mongoose.Types.ObjectId();
  const billingOwnerUserId = new mongoose.Types.ObjectId();

  await AgencyModel.create({
    _id: agencyId,
    name: input.name,
    slug: input.slug,
    plan: 'reseller_pro',
    billingStripeCustomerId: null,
    billingStripeSubscriptionId: null,
    billingOwnerUserId,
    whiteLabelDefaults: {
      customDomain: null,
      logoUrl: null,
      primaryColor: input.primaryColor,
      supportEmail: input.supportEmail,
      hidePlatformBranding: false,
    },
    usageLimits: { tenants: 5, activeSessions: 25 },
    status: 'active',
  });

  return agencyId;
}

describe('dashboard auth routes on workflow-engine', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-workflow-engine-dashboard-auth-routes-tests' });
    await Promise.all([
      AgencyModel.init(),
      AgencyInvitationModel.init(),
      TenantModel.init(),
      UserModel.init(),
      AuthSessionModel.init(),
    ]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('supports signup, session read, and logout for dashboard browser auth', async () => {
    const server = await buildServer({ logger: false });

    try {
      const signupResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/dashboard-auth/signup',
        headers: { 'content-type': 'application/json' },
        payload: {
          email: 'owner@noxivo-auth.test',
          password: 'supersecret123',
          fullName: 'Noxivo Auth Owner',
          agencyName: 'Noxivo Auth Agency',
        },
      });

      expect(signupResponse.statusCode).toBe(200);
      expect(signupResponse.json()).toMatchObject({
        user: {
          email: 'owner@noxivo-auth.test',
          fullName: 'Noxivo Auth Owner',
          role: 'agency_owner',
          status: 'active',
        },
      });

      const signupCookie = readCookieHeader(signupResponse.headers['set-cookie']);
      expect(signupCookie).toContain('noxivo_session=');

      const sessionResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/dashboard-auth/session',
        headers: {
          cookie: signupCookie,
        },
      });

      expect(sessionResponse.statusCode).toBe(200);
      expect(sessionResponse.json()).toMatchObject({
        user: {
          email: 'owner@noxivo-auth.test',
          fullName: 'Noxivo Auth Owner',
          role: 'agency_owner',
          status: 'active',
        },
      });

      const logoutResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/dashboard-auth/logout',
        headers: { cookie: signupCookie },
      });

      expect(logoutResponse.statusCode).toBe(200);
      expect(logoutResponse.json()).toEqual({ ok: true });
      expect(readCookieHeader(logoutResponse.headers['set-cookie'])).toContain('noxivo_session=;');

      const sessionAfterLogout = await server.inject({
        method: 'GET',
        url: '/api/v1/dashboard-auth/session',
        headers: { cookie: signupCookie },
      });

      expect(sessionAfterLogout.statusCode).toBe(401);
      expect(sessionAfterLogout.json()).toEqual({ error: 'Unauthorized' });
    } finally {
      await server.close();
    }
  });

  it('supports login with existing credentials and sets browser session cookie', async () => {
    const server = await buildServer({ logger: false });

    try {
      await seedLoginUser();

      const loginResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/dashboard-auth/login',
        headers: { 'content-type': 'application/json' },
        payload: {
          email: 'owner@login-agency.test',
          password: 'supersecret123',
        },
      });

      expect(loginResponse.statusCode).toBe(200);
      expect(loginResponse.json()).toMatchObject({
        user: {
          email: 'owner@login-agency.test',
          fullName: 'Login Owner',
          role: 'agency_owner',
          status: 'active',
        },
      });
      expect(readCookieHeader(loginResponse.headers['set-cookie'])).toContain('noxivo_session=');
    } finally {
      await server.close();
    }
  });

  it('returns agency branding payload by slug without requiring auth', async () => {
    const server = await buildServer({ logger: false });

    try {
      await seedAgencyWithBranding({
        name: 'Branding Agency',
        slug: 'branding-agency',
        primaryColor: '#4F46E5',
        supportEmail: 'support@branding-agency.test',
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/dashboard-auth/branding/branding-agency',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        agencyId: expect.any(String),
        agencyName: 'Branding Agency',
        agencySlug: 'branding-agency',
        branding: {
          primaryColor: '#4F46E5',
          supportEmail: 'support@branding-agency.test',
          customDomain: null,
          logoUrl: null,
          hidePlatformBranding: false,
        },
      });
    } finally {
      await server.close();
    }
  });

  it('returns 404 when agency slug does not exist for branding lookup', async () => {
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/dashboard-auth/branding/missing-agency',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Not found' });
    } finally {
      await server.close();
    }
  });

  it('handles malformed membership agency resolution without runtime crash leakage', async () => {
    const server = await buildServer({ logger: false });

    try {
      const seeded = await seedLoginUser();
      await UserModel.updateOne(
        { _id: seeded.userId },
        {
          $unset: { agencyId: 1 },
          $set: {
            memberships: [
              {
                role: 'agency_owner',
                tenantIds: [seeded.tenantId],
                defaultTenantId: seeded.tenantId,
              },
            ],
          },
        },
      ).exec();

      const loginResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/dashboard-auth/login',
        headers: { 'content-type': 'application/json' },
        payload: {
          email: 'owner@login-agency.test',
          password: 'supersecret123',
        },
      });

      expect(loginResponse.statusCode).toBe(400);
      expect(loginResponse.json()).toEqual({ error: 'Invalid request' });
    } finally {
      await server.close();
    }
  });

  it('maps unknown auth errors to generic 500 responses', () => {
    const mapped = mapDashboardAuthError(new Error('database secret exploded'), 'login');

    expect(mapped).toEqual({ statusCode: 500, message: 'Internal server error' });
  });

  it('rolls back agency and tenant when user creation fails during non-invitation signup', async () => {
    vi.spyOn(UserModel, 'create').mockRejectedValueOnce(new Error('forced user creation failure'));
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/dashboard-auth/signup',
        headers: { 'content-type': 'application/json' },
        payload: {
          email: 'rollback-owner@noxivo-auth.test',
          password: 'supersecret123',
          fullName: 'Rollback Owner',
          agencyName: 'Rollback Agency',
        },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: 'Internal server error' });

      const createdAgency = await AgencyModel.findOne({ slug: 'rollback-agency' }).lean();
      const createdTenant = await TenantModel.findOne({ slug: 'rollback-agency-main' }).lean();
      const createdUser = await UserModel.findOne({ email: 'rollback-owner@noxivo-auth.test' }).lean();

      expect(createdAgency).toBeNull();
      expect(createdTenant).toBeNull();
      expect(createdUser).toBeNull();
    } finally {
      await server.close();
    }
  });

  it('rolls back created user when invitation acceptance save fails', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const inviterId = new mongoose.Types.ObjectId();
    const token = 'rollback-invitation-token';
    const tokenHash = hashInvitationToken(token);

    await AgencyModel.create({
      _id: agencyId,
      name: 'Invite Rollback Agency',
      slug: 'invite-rollback-agency',
      plan: 'reseller_pro',
      billingStripeCustomerId: null,
      billingStripeSubscriptionId: null,
      billingOwnerUserId: inviterId,
      whiteLabelDefaults: {
        customDomain: null,
        logoUrl: null,
        primaryColor: '#4F46E5',
        supportEmail: 'invite-rollback@noxivo.test',
        hidePlatformBranding: false,
      },
      usageLimits: { tenants: 5, activeSessions: 25 },
      status: 'active',
    });

    await TenantModel.create({
      _id: tenantId,
      agencyId,
      slug: 'invite-rollback-main',
      name: 'Invite Rollback Workspace',
      region: 'us-east-1',
      status: 'active',
      billingMode: 'agency_pays',
      whiteLabelOverrides: {},
      effectiveBrandingCache: {},
    });

    await AgencyInvitationModel.create({
      agencyId,
      email: 'invitee@noxivo-auth.test',
      fullName: 'Invited User',
      role: 'agency_member',
      tenantIds: [tenantId],
      invitedByUserId: inviterId,
      tokenHash,
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
    });

    vi.spyOn(AgencyInvitationModel.prototype, 'save').mockRejectedValueOnce(new Error('forced invitation save failure'));
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/dashboard-auth/signup',
        headers: { 'content-type': 'application/json' },
        payload: {
          email: 'invitee@noxivo-auth.test',
          password: 'supersecret123',
          fullName: 'Invited User',
          invitationToken: token,
        },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: 'Internal server error' });

      const createdUser = await UserModel.findOne({ email: 'invitee@noxivo-auth.test' }).lean();
      const invitation = await AgencyInvitationModel.findOne({ tokenHash }).lean();

      expect(createdUser).toBeNull();
      expect(invitation?.status).toBe('pending');
      expect(invitation?.acceptedAt ?? null).toBeNull();
    } finally {
      await server.close();
    }
  });

  it('returns unauthorized for session read without cookie', async () => {
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/dashboard-auth/session',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Unauthorized' });
    } finally {
      await server.close();
    }
  });
});
