import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { TenantModel, MessagingClusterModel, MessagingSessionBindingModel } from '@noxivo/database';
import { GET as getSettingsQr } from '../app/api/settings/qr/route.js';
import { POST as postSettingsQr } from '../app/api/settings/qr/route.js';
import { DELETE as deleteSettingsQr } from '../app/api/settings/qr/route.js';
import {
  connectDashboardTestDb,
  disconnectDashboardTestDb,
  resetDashboardTestDb
} from './helpers/mongo-memory.js';

const { mockGetCurrentSession } = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn()
}));

vi.mock('../lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession
}));

function makeRequest(): Request {
  return new Request('http://localhost/api/settings/qr');
}

function makePostRequest(): Request {
  return new Request('http://localhost/api/settings/qr', { method: 'POST' });
}

function makeDeleteRequest(): Request {
  return new Request('http://localhost/api/settings/qr', { method: 'DELETE' });
}

async function createTenantAndCluster(agencyId: mongoose.Types.ObjectId, tenantId: mongoose.Types.ObjectId) {
  await TenantModel.create({
    _id: tenantId,
    agencyId,
    slug: 'tenant-one',
    name: 'Tenant One',
    region: 'us-east-1',
    status: 'active',
    billingMode: 'agency_pays'
  });

  return MessagingClusterModel.create({
    name: 'us-cluster-1',
    region: 'us-east-1',
    baseUrl: 'http://messaging.test',
    dashboardUrl: 'http://messaging.test/dashboard',
    swaggerUrl: 'http://messaging.test/swagger',
    capacity: 10,
    activeSessionCount: 0,
    status: 'active',
    secretRefs: {
      webhookSecretVersion: 'v1'
    }
  });
}

describe('settings qr route', () => {
  beforeAll(async () => {
    await connectDashboardTestDb({ dbName: 'noxivo-dashboard-settings-qr-tests' });
  });

  beforeEach(() => {
    process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL = 'http://workflow-engine';
    process.env.WORKFLOW_ENGINE_INTERNAL_PSK = 'test-psk';

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId: new mongoose.Types.ObjectId().toString(),
        tenantId: new mongoose.Types.ObjectId().toString(),
        tenantIds: [new mongoose.Types.ObjectId().toString()],
        email: 'owner@example.com',
        fullName: 'Owner User',
        role: 'agency_owner',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60000)
    });
  });

  afterEach(async () => {
    mockGetCurrentSession.mockReset();
    vi.unstubAllGlobals();
    delete process.env.ENGINE_API_URL;
    delete process.env.ENGINE_API_KEY;
    delete process.env.MessagingProvider_PROXY_BASE_URL;
    delete process.env.MessagingProvider_PROXY_AUTH_TOKEN;
    delete process.env.MessagingProvider_BASE_URL;
    delete process.env.MessagingProvider_API_KEY;
    delete process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL;
    delete process.env.WORKFLOW_ENGINE_INTERNAL_PSK;
    await resetDashboardTestDb();
  });

  afterAll(async () => {
    await disconnectDashboardTestDb();
  });

  it('returns 401 when the request is unauthenticated', async () => {
    mockGetCurrentSession.mockResolvedValue(null);

    const response = await getSettingsQr(makeRequest());
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Unauthorized');
  });

  it('returns 503 when session lookup fails before qr resolution starts', async () => {
    mockGetCurrentSession.mockRejectedValue(new Error('MongoDB connection timed out after 10s'));

    const response = await getSettingsQr(makeRequest());
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(503);
    expect(payload.error).toBe('Dashboard session store unavailable. Please verify MONGODB_URI.');
  });

  it('returns 403 when the actor cannot manage settings', async () => {
    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId: new mongoose.Types.ObjectId().toString(),
        tenantId: new mongoose.Types.ObjectId().toString(),
        tenantIds: [new mongoose.Types.ObjectId().toString()],
        email: 'member@example.com',
        fullName: 'Member User',
        role: 'agency_member',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60000)
    });

    const response = await getSettingsQr(makeRequest());
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
  });

  it('falls back to the first scoped tenant when actor.tenantId is blank', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const fallbackTenantId = new mongoose.Types.ObjectId().toString();

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId,
        tenantId: '',
        tenantIds: [fallbackTenantId],
        email: 'owner@example.com',
        fullName: 'Owner User',
        role: 'agency_owner',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60000)
    });

    const backendResponse = {
      status: 'available',
      qr: 'test-qr-value',
      sessionName: 'test-session'
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(backendResponse), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await getSettingsQr(makeRequest());
    expect(response.status).toBe(200);

    const calledUrl = fetchMock.mock.calls[0]?.[0]?.toString();
    expect(typeof calledUrl).toBe('string');
    expect(calledUrl).toContain(`agencyId=${agencyId}`);
    expect(calledUrl).toContain(`tenantId=${fallbackTenantId}`);
  });

  it('returns 409 when no tenant scope is available for the agency context', async () => {
    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId: new mongoose.Types.ObjectId().toString(),
        tenantId: '',
        tenantIds: [],
        email: 'owner@example.com',
        fullName: 'Owner User',
        role: 'agency_owner',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60000)
    });

    const response = await getSettingsQr(makeRequest());
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(409);
    expect(payload.error).toBe('No tenant workspace available for this agency context');
  });

  it('proxies the request to the workflow-engine with correct parameters and PSK', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();
    
    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId,
        tenantId,
        tenantIds: [tenantId],
        email: 'owner@example.com',
        fullName: 'Owner User',
        role: 'agency_owner',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60000)
    });

    const backendResponse = {
      status: 'available',
      qr: 'test-qr-value',
      sessionName: 'test-session'
    };

    const fetchMock = vi.fn(async () => new Response(JSON.stringify(backendResponse), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await getSettingsQr(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(backendResponse);
    
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`http://workflow-engine/v1/messaging/session/qr?agencyId=${agencyId}&tenantId=${tenantId}`),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-nexus-internal-psk': 'test-psk'
        })
      })
    );
  });

  it('returns 502 when the workflow-engine communication fails', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('Network error');
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await getSettingsQr(makeRequest());
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(502);
    expect(payload.error).toBe('Failed to communicate with backend: Network error');
  });

  it('returns unlinked bootstrap-required snapshot when binding is missing on passive GET', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    delete process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL;
    delete process.env.WORKFLOW_ENGINE_INTERNAL_PSK;
    process.env.ENGINE_API_URL = 'http://engine.local/api/v1';
    process.env.ENGINE_API_KEY = 'engine-key';

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId,
        tenantId,
        tenantIds: [tenantId],
        email: 'owner@example.com',
        fullName: 'Owner User',
        role: 'agency_owner',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60000)
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/sessions/by-tenant?')) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const response = await getSettingsQr(makeRequest());
    const payload = await response.json() as {
      state: string;
      reason: string | null;
      poll: boolean;
      qrValue: string | null;
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      state: 'unlinked',
      reason: 'bootstrap_required',
      poll: false,
      qrValue: null
    });

    const bootstrapCall = fetchMock.mock.calls.find(([calledUrl]) => (
      typeof calledUrl === 'string' && calledUrl.endsWith('/sessions/bootstrap')
    ));
    expect(bootstrapCall).toBeFalsy();
  });

  it('bootstraps session and returns QR on explicit POST action', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    delete process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL;
    delete process.env.WORKFLOW_ENGINE_INTERNAL_PSK;
    process.env.ENGINE_API_URL = 'http://engine.local/api/v1';
    process.env.ENGINE_API_KEY = 'engine-key';

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId,
        tenantId,
        tenantIds: [tenantId],
        email: 'owner@example.com',
        fullName: 'Owner User',
        role: 'agency_owner',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60000)
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/sessions/by-tenant?') && (!init?.method || init.method === 'GET')) {
        if (!fetchMock.mock.calls.some(([calledUrl]) => typeof calledUrl === 'string' && calledUrl.includes('/sessions/bootstrap'))) {
          return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
        }

        return new Response(JSON.stringify({ id: 'binding-id', name: 'owner-example-whatsapp' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/sessions/bootstrap')) {
        return new Response(JSON.stringify({ sessionName: 'owner-example-whatsapp', status: 'SCAN_QR_CODE' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/sessions/binding-id/status')) {
        return new Response(JSON.stringify({ status: 'SCAN_QR_CODE', me: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/sessions/binding-id/qr')) {
        return new Response(JSON.stringify({ value: 'engine-qr-token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/sessions/binding-id/profile')) {
        return new Response('Not Found', { status: 404 });
      }

      return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const response = await postSettingsQr(makePostRequest());
    const payload = await response.json() as {
      state: string;
      reason: string | null;
      poll: boolean;
      qrValue: string | null;
      sessionName: string;
      bootstrapped: boolean;
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      state: 'qr_ready',
      reason: null,
      poll: true,
      qrValue: 'engine-qr-token',
      sessionName: 'owner-example-whatsapp',
      bootstrapped: true
    });

    const bootstrapCall = fetchMock.mock.calls.find(([calledUrl]) => typeof calledUrl === 'string' && calledUrl.endsWith('/sessions/bootstrap'));
    expect(bootstrapCall).toBeTruthy();
    expect(bootstrapCall?.[1]?.method).toBe('POST');
    expect((bootstrapCall?.[1]?.headers as Headers | undefined)?.get('X-API-Key')).toBe('engine-key');
  });

  it('revokes session and returns unavailable snapshot on DELETE', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    delete process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL;
    delete process.env.WORKFLOW_ENGINE_INTERNAL_PSK;
    process.env.ENGINE_API_URL = 'http://engine.local/api/v1';
    process.env.ENGINE_API_KEY = 'engine-key';

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId,
        tenantId,
        tenantIds: [tenantId],
        email: 'owner@example.com',
        fullName: 'Owner User',
        role: 'agency_owner',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60000)
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/sessions/by-tenant?') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ id: 'binding-id', name: 'owner-example-whatsapp' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/sessions/logout') || url.endsWith('/sessions/stop')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/sessions/binding-id/status')) {
        return new Response(JSON.stringify({ status: 'STOPPED', me: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/sessions/binding-id/qr')) {
        return new Response(JSON.stringify({ qr: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/auth/qr')) {
        return new Response(JSON.stringify({ value: null }), {
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

    const response = await deleteSettingsQr(makeDeleteRequest());
    const payload = await response.json() as {
      ok: boolean;
      status: string;
      qr: string | null;
      qrValue: string | null;
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      status: 'unavailable',
      qr: null,
      qrValue: null
    });

    const logoutCall = fetchMock.mock.calls.find(([calledUrl]) => (
      typeof calledUrl === 'string' && calledUrl.endsWith('/sessions/logout')
    ));
    const stopCall = fetchMock.mock.calls.find(([calledUrl]) => (
      typeof calledUrl === 'string' && calledUrl.endsWith('/sessions/stop')
    ));

    expect(logoutCall).toBeTruthy();
    expect(stopCall).toBeTruthy();
    expect(logoutCall?.[1]?.method).toBe('POST');
    expect(stopCall?.[1]?.method).toBe('POST');
  });
});
