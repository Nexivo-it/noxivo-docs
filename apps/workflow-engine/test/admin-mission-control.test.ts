import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  AgencyModel,
  AuthSessionModel,
  TenantModel,
  UserModel,
  MessagingSessionBindingModel,
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

async function createAgencyAndTenant(seed: { agencyName: string; agencySlug: string; tenantName: string; tenantSlug: string }) {
  const agency = await AgencyModel.create({
    name: seed.agencyName,
    slug: seed.agencySlug,
    plan: 'reseller_pro',
    billingOwnerUserId: new mongoose.Types.ObjectId(),
    whiteLabelDefaults: {
      customDomain: null,
      logoUrl: null,
      primaryColor: '#6366f1',
      supportEmail: 'ops@test.local',
      hidePlatformBranding: false,
    },
    usageLimits: {
      tenants: 10,
      activeSessions: 50,
    },
    status: 'active',
  });

  const tenant = await TenantModel.create({
    agencyId: agency._id,
    slug: seed.tenantSlug,
    name: seed.tenantName,
    region: 'us-east-1',
    status: 'active',
    billingMode: 'agency_pays',
  });

  return { agency, tenant };
}

async function createAuthCookie(input: {
  role: 'platform_admin' | 'client_admin';
  agencyId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
}) {
  const user = await UserModel.create({
    email: `${randomUUID()}@test.local`,
    fullName: 'Test User',
    passwordHash: 'hashed-password',
    role: input.role,
    agencyId: input.agencyId,
    defaultTenantId: input.tenantId,
    tenantIds: [input.tenantId],
    status: 'active',
  });

  const rawSessionToken = randomUUID();
  await AuthSessionModel.create({
    userId: user._id,
    agencyId: input.agencyId,
    tenantId: input.tenantId,
    sessionTokenHash: hashSessionToken(rawSessionToken),
    expiresAt: new Date(Date.now() + 60_000),
    lastSeenAt: new Date(),
  });

  return `noxivo_session=${rawSessionToken}`;
}

describe('mission control admin auth and hierarchy routes', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-admin-mission-control-tests' });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.ENGINE_API_KEY;
    delete process.env.MESSAGING_PROVIDER_BASE_URL;
    delete process.env.MESSAGING_PROVIDER_API_KEY;
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('blocks anonymous access to /admin/', async () => {
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/admin/',
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/');
    } finally {
      await server.close();
    }
  });

  it('forbids non-owner users from admin sessions API', async () => {
    const { agency, tenant } = await createAgencyAndTenant({
      agencyName: 'Acme Agency',
      agencySlug: 'acme-agency',
      tenantName: 'Acme Client',
      tenantSlug: 'acme-client',
    });
    const authCookie = await createAuthCookie({
      role: 'client_admin',
      agencyId: agency._id,
      tenantId: tenant._id,
    });

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/admin/sessions',
        headers: {
          cookie: authCookie,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'Forbidden' });
    } finally {
      await server.close();
    }
  });

  it('returns Agency -> Client -> Sessions hierarchy for owner', async () => {
    process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';

    const { agency: alphaAgency, tenant: alphaClientA } = await createAgencyAndTenant({
      agencyName: 'Alpha Agency',
      agencySlug: 'alpha-agency',
      tenantName: 'Alpha Client A',
      tenantSlug: 'alpha-client-a',
    });
    const alphaClientB = await TenantModel.create({
      agencyId: alphaAgency._id,
      slug: 'alpha-client-b',
      name: 'Alpha Client B',
      region: 'us-east-1',
      status: 'active',
      billingMode: 'agency_pays',
    });
    const { agency: betaAgency, tenant: betaClientA } = await createAgencyAndTenant({
      agencyName: 'Beta Agency',
      agencySlug: 'beta-agency',
      tenantName: 'Beta Client A',
      tenantSlug: 'beta-client-a',
    });

    await MessagingSessionBindingModel.create([
      {
        agencyId: alphaAgency._id,
        tenantId: alphaClientA._id,
        clusterId: new mongoose.Types.ObjectId(),
        sessionName: 'alpha-a-1',
        messagingSessionName: 'alpha-a-1',
        status: 'active',
      },
      {
        agencyId: alphaAgency._id,
        tenantId: alphaClientB._id,
        clusterId: new mongoose.Types.ObjectId(),
        sessionName: 'alpha-b-1',
        messagingSessionName: 'alpha-b-1',
        status: 'pending',
      },
      {
        agencyId: betaAgency._id,
        tenantId: betaClientA._id,
        clusterId: new mongoose.Types.ObjectId(),
        sessionName: 'beta-a-1',
        messagingSessionName: 'beta-a-1',
        status: 'active',
      },
    ]);

    const ownerCookie = await createAuthCookie({
      role: 'platform_admin',
      agencyId: alphaAgency._id,
      tenantId: alphaClientA._id,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url.endsWith('/api/sessions?all=true')) {
          return new Response(
            JSON.stringify([
              { name: 'alpha-a-1', status: 'WORKING', me: { id: '15550000001@c.us', name: 'Alpha A' } },
              { name: 'alpha-b-1', status: 'SCAN_QR_CODE', me: null },
              { name: 'beta-a-1', status: 'WORKING', me: { id: '15550000003@c.us', name: 'Beta A' } },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/admin/sessions',
        headers: {
          cookie: ownerCookie,
        },
      });

      expect(response.statusCode).toBe(200);

      const payload = response.json() as Array<{
        agencyName: string;
        clients: Array<{
          tenantName: string;
          sessions: Array<{ name: string; status: string }>;
        }>;
      }>;

      expect(payload).toHaveLength(2);
      expect(payload[0]?.agencyName).toBe('Alpha Agency');
      expect(payload[0]?.clients).toHaveLength(2);
      expect(payload[0]?.clients[0]?.tenantName).toBe('Alpha Client A');
      expect(payload[0]?.clients[0]?.sessions[0]?.name).toBe('alpha-a-1');
      expect(payload[0]?.clients[0]?.sessions[0]?.status).toBe('WORKING');
      expect(payload[1]?.agencyName).toBe('Beta Agency');
      expect(payload[1]?.clients[0]?.sessions[0]?.name).toBe('beta-a-1');
    } finally {
      await server.close();
    }
  });

  it('allows owner session to start a binding from admin action endpoint', async () => {
    process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';

    const { agency, tenant } = await createAgencyAndTenant({
      agencyName: 'Start Agency',
      agencySlug: 'start-agency',
      tenantName: 'Start Client',
      tenantSlug: 'start-client',
    });

    const binding = await MessagingSessionBindingModel.create({
      agencyId: agency._id,
      tenantId: tenant._id,
      clusterId: new mongoose.Types.ObjectId(),
      sessionName: 'start-session',
      messagingSessionName: 'start-session',
      status: 'pending',
    });

    const ownerCookie = await createAuthCookie({
      role: 'platform_admin',
      agencyId: agency._id,
      tenantId: tenant._id,
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/sessions/start-session/start') && init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: `/api/v1/admin/sessions/${binding._id.toString()}/start`,
        headers: {
          cookie: ownerCookie,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
    } finally {
      await server.close();
    }
  });

  it('returns owner identity through /api/v1/admin/me', async () => {
    const { agency, tenant } = await createAgencyAndTenant({
      agencyName: 'Me Agency',
      agencySlug: 'me-agency',
      tenantName: 'Me Tenant',
      tenantSlug: 'me-tenant',
    });
    const ownerCookie = await createAuthCookie({
      role: 'platform_admin',
      agencyId: agency._id,
      tenantId: tenant._id,
    });

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/admin/me',
        headers: {
          cookie: ownerCookie,
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json() as {
        user: { email: string; role: string; name: string; id: string };
        session: { expiresAt: string };
      };
      expect(payload.user.email.endsWith('@test.local')).toBe(true);
      expect(payload.user.role).toBe('owner');
      expect(payload.user.name).toBe('Test User');
      expect(typeof payload.user.id).toBe('string');
      expect(typeof payload.session.expiresAt).toBe('string');
    } finally {
      await server.close();
    }
  });

  it('clears session via /api/v1/admin/logout', async () => {
    const { agency, tenant } = await createAgencyAndTenant({
      agencyName: 'Logout Agency',
      agencySlug: 'logout-agency',
      tenantName: 'Logout Tenant',
      tenantSlug: 'logout-tenant',
    });
    const ownerCookie = await createAuthCookie({
      role: 'platform_admin',
      agencyId: agency._id,
      tenantId: tenant._id,
    });
    const rawToken = ownerCookie.split('=')[1];
    expect(rawToken).toBeTruthy();

    const server = await buildServer({ logger: false });

    try {
      const logoutResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/admin/logout',
        headers: {
          cookie: ownerCookie,
        },
      });

      expect(logoutResponse.statusCode).toBe(200);
      expect(logoutResponse.json()).toEqual({ success: true });
      expect(logoutResponse.headers['set-cookie']).toContain('noxivo_session=');

      const postLogoutResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/admin/me',
        headers: {
          cookie: ownerCookie,
        },
      });
      expect(postLogoutResponse.statusCode).toBe(401);

      const remainingSessions = await AuthSessionModel.find({
        sessionTokenHash: hashSessionToken(String(rawToken))
      }).lean().exec();
      expect(remainingSessions).toHaveLength(0);
    } finally {
      await server.close();
    }
  });

  it('returns parsed MessagingProvider spec metadata for explorer', async () => {
    const { agency, tenant } = await createAgencyAndTenant({
      agencyName: 'Spec Agency',
      agencySlug: 'spec-agency',
      tenantName: 'Spec Tenant',
      tenantSlug: 'spec-tenant',
    });
    const ownerCookie = await createAuthCookie({
      role: 'platform_admin',
      agencyId: agency._id,
      tenantId: tenant._id,
    });
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/admin/messaging/spec',
        headers: {
          cookie: ownerCookie,
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json() as {
        tags: Array<{ name: string; endpoints: Array<{ method: string; pathTemplate: string }> }>;
        totalEndpoints: number;
      };
      expect(payload.totalEndpoints).toBeGreaterThan(0);
      expect(payload.tags.some((tag) => tag.name === '🖥️ Sessions')).toBe(true);
      expect(payload.tags.some((tag) =>
        tag.endpoints.some((endpoint) => endpoint.pathTemplate === '/api/sessions')
      )).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('proxies allowed MessagingProvider requests with normalized envelope', async () => {
    process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';

    const { agency, tenant } = await createAgencyAndTenant({
      agencyName: 'Proxy Agency',
      agencySlug: 'proxy-agency',
      tenantName: 'Proxy Tenant',
      tenantSlug: 'proxy-tenant',
    });
    const ownerCookie = await createAuthCookie({
      role: 'platform_admin',
      agencyId: agency._id,
      tenantId: tenant._id,
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'https://messaging.test/api/server/status?foo=bar' && init?.method === 'GET') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-upstream': 'messaging' },
        });
      }

      return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/admin/messaging/request',
        headers: {
          cookie: ownerCookie,
        },
        payload: {
          method: 'GET',
          path: '/api/server/status',
          query: { foo: 'bar' }
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(expect.objectContaining({
        origin: 'messaging_upstream',
        status: 200,
        body: { status: 'ok' },
      }));
    } finally {
      await server.close();
    }
  });

  it('rejects non-allowlisted MessagingProvider explorer paths', async () => {
    const { agency, tenant } = await createAgencyAndTenant({
      agencyName: 'Reject Agency',
      agencySlug: 'reject-agency',
      tenantName: 'Reject Tenant',
      tenantSlug: 'reject-tenant',
    });
    const ownerCookie = await createAuthCookie({
      role: 'platform_admin',
      agencyId: agency._id,
      tenantId: tenant._id,
    });
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/admin/messaging/request',
        headers: {
          cookie: ownerCookie,
        },
        payload: {
          method: 'GET',
          path: '/api/not-real-endpoint'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual(expect.objectContaining({
        origin: 'engine',
        status: 400,
      }));
    } finally {
      await server.close();
    }
  });
});
