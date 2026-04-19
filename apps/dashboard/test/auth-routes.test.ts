import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { POST as signup } from '../app/api/auth/signup/route.js';
import { POST as login } from '../app/api/auth/login/route.js';
import { POST as logout } from '../app/api/auth/logout/route.js';
import { AgencyInvitationModel, AgencyModel, AuthSessionModel, TenantModel, UserModel } from '@noxivo/database';
import { hashInvitationToken } from '../lib/auth/invitations.js';
import {
  connectDashboardTestDb,
  disconnectDashboardTestDb,
  resetDashboardTestDb
} from './helpers/mongo-memory.js';

describe('dashboard auth routes', () => {
  beforeAll(async () => {
    await connectDashboardTestDb({ dbName: 'noxivo-dashboard-auth-tests' });
  });

  afterEach(async () => {
    await resetDashboardTestDb();
  });

  afterAll(async () => {
    await disconnectDashboardTestDb();
  });

  it('creates an agency owner session on signup', async () => {
    const response = await signup(new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'owner@example.com',
        password: 'StrongPass1!',
        fullName: 'Owner User',
        agencyName: 'Acme Agency'
      })
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('noxivo_session=');
    expect(await AgencyModel.countDocuments()).toBe(1);
    expect(await TenantModel.countDocuments()).toBe(1);
    expect(await UserModel.countDocuments()).toBe(1);
    expect(await AuthSessionModel.countDocuments()).toBe(1);
  }, 20000);

  it('rejects invalid credentials and allows a valid login afterwards', async () => {
    await signup(new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'member@example.com',
        password: 'StrongPass1!',
        fullName: 'Member User',
        agencyName: 'Member Agency'
      })
    }));

    const invalidResponse = await login(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'member@example.com',
        password: 'wrong-pass-123'
      })
    }));

    expect(invalidResponse.status).toBe(401);

    const validResponse = await login(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'member@example.com',
        password: 'StrongPass1!'
      })
    }));

    expect(validResponse.status).toBe(200);
    expect(validResponse.headers.get('set-cookie')).toContain('noxivo_session=');
  }, 20000);

  it('deletes the backing session and clears the cookie on logout', async () => {
    const signupResponse = await signup(new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'logout@example.com',
        password: 'StrongPass1!',
        fullName: 'Logout User',
        agencyName: 'Logout Agency'
      })
    }));

    const cookie = signupResponse.headers.get('set-cookie');
    expect(cookie).toBeTruthy();
    expect(await AuthSessionModel.countDocuments()).toBe(1);

    const response = await logout(new Request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: cookie ? { cookie } : {}
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970');
    expect(await AuthSessionModel.countDocuments()).toBe(0);
  }, 20000);

  it('accepts an agency invitation during signup without creating another agency', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const inviterId = new mongoose.Types.ObjectId();
    const invitationToken = 'team-invite-token';

    await AgencyModel.create({
      _id: agencyId,
      name: 'Invited Agency',
      slug: 'invited-agency',
      plan: 'reseller_pro',
      billingStripeCustomerId: null,
      billingStripeSubscriptionId: null,
      billingOwnerUserId: inviterId,
      whiteLabelDefaults: {
        customDomain: null,
        logoUrl: null,
        primaryColor: '#6366F1',
        supportEmail: 'ops@invited.test',
        hidePlatformBranding: false,
      },
      usageLimits: { tenants: 5, activeSessions: 25 },
      status: 'active',
    });

    await TenantModel.create({
      _id: tenantId,
      agencyId,
      slug: 'invited-agency-main',
      name: 'Invited Agency Main',
      region: 'us-east-1',
      status: 'active',
      billingMode: 'agency_pays',
      whiteLabelOverrides: {},
      effectiveBrandingCache: {},
    });

    await AgencyInvitationModel.create({
      agencyId,
      email: 'invitee@example.com',
      fullName: 'Invitee User',
      role: 'agency_admin',
      tenantIds: [tenantId],
      invitedByUserId: inviterId,
      tokenHash: hashInvitationToken(invitationToken),
      status: 'pending',
      expiresAt: new Date(Date.now() + 60000),
      lastSentAt: new Date(),
    });

    const response = await signup(new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'invitee@example.com',
        password: 'StrongPass1!',
        fullName: 'Invitee User',
        invitationToken,
      }),
    }));

    const payload = await response.json() as { user: { agencyId: string; role: string } };

    expect(response.status).toBe(200);
    expect(payload.user.agencyId).toBe(agencyId.toString());
    expect(payload.user.role).toBe('agency_admin');
    expect(await AgencyModel.countDocuments()).toBe(1);
    expect(await UserModel.countDocuments()).toBe(1);
    expect(await AgencyInvitationModel.countDocuments({ status: 'accepted' })).toBe(1);
  }, 20000);
});
