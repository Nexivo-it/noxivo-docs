import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { AgencyModel, TenantModel, MessagingSessionBindingModel } from '@noxivo/database';
import { buildServer } from '../src/server.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('public session bootstrap route', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-sessions-bootstrap-tests' });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.ENGINE_API_KEY;
    delete process.env.MESSAGING_PROVIDER_PROXY_BASE_URL;
    delete process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN;
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('bootstraps a session for a tenant through the public engine API', async () => {
    process.env.ENGINE_API_KEY = 'engine-key';
    process.env.MESSAGING_PROVIDER_PROXY_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'test-token';

    const agency = await AgencyModel.create({
      name: 'Bootstrap Agency',
      slug: 'bootstrap-agency',
      plan: 'reseller_pro',
      billingOwnerUserId: new mongoose.Types.ObjectId(),
      whiteLabelDefaults: {
        customDomain: null,
        logoUrl: null,
        primaryColor: '#2563eb',
        supportEmail: 'ops@bootstrap.test',
        hidePlatformBranding: false
      },
      usageLimits: {
        tenants: 10,
        activeSessions: 50
      },
      status: 'active'
    });

    const tenant = await TenantModel.create({
      agencyId: agency._id,
      slug: 'bootstrap-tenant',
      name: 'Bootstrap Tenant',
      region: 'us-east-1',
      status: 'active',
      billingMode: 'agency_pays'
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/sessions/bootstrap-agency-whatsapp') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ message: 'Session not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/api/sessions') && init?.method === 'POST') {
        return new Response(JSON.stringify({ name: 'bootstrap-agency-whatsapp' }), {
          status: 201,
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
        url: '/api/v1/sessions/bootstrap',
        headers: {
          'x-api-key': 'engine-key'
        },
        payload: {
          agencyId: agency._id.toString(),
          tenantId: tenant._id.toString(),
          accountName: 'Bootstrap Agency'
        }
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json() as { sessionName: string; status: string };

      expect(payload).toEqual({
        sessionName: 'bootstrap-agency-whatsapp',
        status: 'SCAN_QR_CODE'
      });

      const binding = await MessagingSessionBindingModel.findOne({ agencyId: agency._id, tenantId: tenant._id }).lean();
      expect(binding).toBeTruthy();
      expect(binding?.messagingSessionName).toBe('bootstrap-agency-whatsapp');
      expect(binding?.status).toBe('pending');
    } finally {
      await server.close();
    }
  });
});
