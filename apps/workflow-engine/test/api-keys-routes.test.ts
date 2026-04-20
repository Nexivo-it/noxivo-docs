import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { AgencyModel, ApiKeyModel, MessagingClusterModel, MessagingSessionBindingModel, TenantModel } from '@noxivo/database';
import { buildServer } from '../src/server.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('api keys routes', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-api-keys-route-tests' });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.ENGINE_API_KEY;
    delete process.env.MESSAGING_PROVIDER_PROXY_BASE_URL;
    delete process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN;
    delete process.env.MESSAGING_PROVIDER_BASE_URL;
    delete process.env.MESSAGING_PROVIDER_API_KEY;
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  async function seedAgencyTenantAndCluster() {
    const agency = await AgencyModel.create({
      name: 'API Key Agency',
      slug: 'api-key-agency',
      plan: 'reseller_pro',
      status: 'active',
      billingOwnerUserId: new mongoose.Types.ObjectId(),
      usageLimits: {
        activeSessions: 10,
        tenants: 10
      },
      whiteLabelDefaults: {
        customDomain: null,
        logoUrl: null,
        primaryColor: '#000000',
        supportEmail: 'ops@api-key.test',
        hidePlatformBranding: false
      }
    });

    const tenant = await TenantModel.create({
      agencyId: agency._id,
      name: 'API Key Tenant',
      slug: 'api-key-tenant',
      region: 'us-east-1',
      status: 'active',
      billingMode: 'agency_pays'
    });

    await MessagingClusterModel.create({
      name: 'Primary MessagingProvider Cluster',
      region: 'us-east-1',
      baseUrl: 'http://messaging.test',
      dashboardUrl: 'http://messaging.test/dashboard',
      swaggerUrl: 'http://messaging.test/docs',
      capacity: 10,
      activeSessionCount: 0,
      status: 'active',
      secretRefs: { webhookSecretVersion: 'v1' }
    });

    return {
      agencyId: agency._id.toString(),
      tenantId: tenant._id.toString()
    };
  }

  it('bootstraps a missing binding and returns an active scoped API key even when proxy env points to the engine', async () => {
    const { agencyId, tenantId } = await seedAgencyTenantAndCluster();
    process.env.ENGINE_API_KEY = 'engine-key';
    process.env.MESSAGING_PROVIDER_PROXY_BASE_URL = 'https://api-workflow-engine.noxivo.app';
    process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'messaging-token';

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === 'http://messaging.test/api/sessions/api-key-agency-whatsapp' && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ message: 'Session not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url === 'http://messaging.test/api/sessions' && init?.method === 'POST') {
        return new Response(JSON.stringify({ name: 'api-key-agency-whatsapp' }), {
          status: 201,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url === 'http://messaging.test/api/api-key-agency-whatsapp/profile') {
        return new Response(JSON.stringify({
          id: '15550001111@c.us',
          name: 'API Key Session',
          picture: null
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/api-keys/me',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'engine-key'
        },
        payload: {
          agencyId,
          tenantId
        }
      });

      expect(response.statusCode).toBe(201);
      const payload = response.json() as { key: string; status: string };
      expect(payload.key.startsWith('nx_')).toBe(true);
      expect(payload.status).toBe('active');

      const binding = await MessagingSessionBindingModel.findOne({ agencyId, tenantId }).lean();
      expect(binding?.messagingSessionName).toBe('api-key-agency-whatsapp');
      expect(String(fetchMock.mock.calls[0]?.[0] ?? '')).toContain('http://messaging.test/api/sessions/api-key-agency-whatsapp');
      expect(await ApiKeyModel.countDocuments({ agencyId, tenantId, status: 'active' })).toBe(1);
    } finally {
      await server.close();
    }
  });

  it('falls back to an existing binding when tenant record is missing during scoped api key generation', async () => {
    const { agencyId, tenantId } = await seedAgencyTenantAndCluster();
    process.env.ENGINE_API_KEY = 'engine-key';
    process.env.MESSAGING_PROVIDER_PROXY_BASE_URL = 'https://api-workflow-engine.noxivo.app';
    process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'messaging-token';

    await MessagingSessionBindingModel.create({
      agencyId,
      tenantId,
      clusterId: (await MessagingClusterModel.findOne({ name: 'Primary MessagingProvider Cluster' }).lean())?._id,
      sessionName: 'api-key-agency-whatsapp',
      messagingSessionName: 'api-key-agency-whatsapp',
      status: 'active'
    });
    await TenantModel.deleteOne({ _id: tenantId }).exec();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === 'http://messaging.test/api/api-key-agency-whatsapp/profile') {
        return new Response(JSON.stringify({
          id: '15550001111@c.us',
          name: 'API Key Session',
          picture: null
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const postResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/api-keys/me',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'engine-key'
        },
        payload: {
          agencyId,
          tenantId
        }
      });

      expect(postResponse.statusCode).toBe(201);
      const createdPayload = postResponse.json() as { key: string; status: string };
      expect(createdPayload.key.startsWith('nx_')).toBe(true);
      expect(createdPayload.status).toBe('active');

      const getResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/api-keys/me?agencyId=${agencyId}&tenantId=${tenantId}`,
        headers: {
          'x-api-key': 'engine-key'
        }
      });

      expect(getResponse.statusCode).toBe(200);
      const fetchedPayload = getResponse.json() as { key: string | null; status: string };
      expect(fetchedPayload.key).toBe(createdPayload.key);
      expect(fetchedPayload.status).toBe('active');
    } finally {
      await server.close();
    }
  });

  it('recovers api key generation from a live MessagingProvider session when tenant bootstrap lookup fails', async () => {
    process.env.ENGINE_API_KEY = 'engine-key';
    process.env.MESSAGING_PROVIDER_PROXY_BASE_URL = 'https://api-workflow-engine.noxivo.app';
    process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'messaging-token';

    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();
    const clusterId = new mongoose.Types.ObjectId();

    await MessagingClusterModel.create({
      _id: clusterId,
      name: 'Recovered MessagingProvider Cluster',
      region: 'us-east-1',
      baseUrl: 'http://messaging.test',
      dashboardUrl: 'http://messaging.test/dashboard',
      swaggerUrl: 'http://messaging.test/docs',
      capacity: 10,
      activeSessionCount: 1,
      status: 'active',
      secretRefs: { webhookSecretVersion: 'v1' }
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === 'https://api-workflow-engine.noxivo.app/api/sessions?all=true') {
        return new Response(JSON.stringify([
          {
            name: 'recovered-live-session',
            status: 'WORKING',
            config: {
              metadata: {
                agencyId,
                tenantId,
                clusterId: clusterId.toString(),
                sessionBindingId: ''
              }
            }
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url === 'http://messaging.test/api/recovered-live-session/profile') {
        return new Response(JSON.stringify({
          id: '15550001111@c.us',
          name: 'Recovered Session',
          picture: null
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/api-keys/me',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'engine-key'
        },
        payload: {
          agencyId,
          tenantId
        }
      });

      expect(response.statusCode).toBe(201);
      const payload = response.json() as { key: string; status: string };
      expect(payload.key.startsWith('nx_')).toBe(true);
      expect(payload.status).toBe('active');

      const binding = await MessagingSessionBindingModel.findOne({ agencyId, tenantId }).lean();
      expect(binding?.messagingSessionName).toBe('recovered-live-session');
      expect(binding?.clusterId.toString()).toBe(clusterId.toString());
    } finally {
      await server.close();
    }
  });
});
