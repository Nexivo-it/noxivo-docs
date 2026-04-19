import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { GET as getWhatsAppCheck } from '../app/api/settings/whatsapp-check/route.js';
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

describe('settings whatsapp-check route', () => {
  beforeAll(async () => {
    await connectDashboardTestDb({ dbName: 'noxivo-dashboard-settings-whatsapp-check-tests' });
  });

  beforeEach(() => {
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
    delete process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL;
    delete process.env.WORKFLOW_ENGINE_INTERNAL_PSK;
    await resetDashboardTestDb();
  });

  afterAll(async () => {
    await disconnectDashboardTestDb();
  });

  it('returns unavailable snapshot when binding is missing on passive check', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

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

      if (url.endsWith('/sessions/by-tenant?agencyId=' + agencyId + '&tenantId=' + tenantId)) {
        if (!fetchMock.mock.calls.some(([calledUrl]) => typeof calledUrl === 'string' && calledUrl.endsWith('/sessions/bootstrap'))) {
          return new Response(JSON.stringify({ error: 'Session not found' }), {
            status: 404,
            headers: { 'content-type': 'application/json' }
          });
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

    const response = await getWhatsAppCheck();
    const payload = await response.json() as {
      agencyId: string;
      tenantId: string;
      status: string;
      qr: string | null;
      provisioning: boolean;
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      agencyId,
      tenantId,
      status: 'unavailable',
      qr: null,
      provisioning: false
    });
  });

  it('uses tenantIds fallback when actor.tenantId is blank', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const fallbackTenantId = new mongoose.Types.ObjectId().toString();

    process.env.ENGINE_API_URL = 'http://engine.local/api/v1';
    process.env.ENGINE_API_KEY = 'engine-key';

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

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/sessions/by-tenant?agencyId=' + agencyId + '&tenantId=' + fallbackTenantId)) {
        return new Response(JSON.stringify({ id: 'binding-id', name: 'owner-example-whatsapp' }), {
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

    const response = await getWhatsAppCheck();
    const payload = await response.json() as { tenantId: string; status: string; qr: string | null };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      tenantId: fallbackTenantId,
      status: 'available',
      qr: 'engine-qr-token'
    });
  });

  it('returns 409 when no tenant scope is available for whatsapp-check', async () => {
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

    const response = await getWhatsAppCheck();
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(409);
    expect(payload.error).toBe('No tenant workspace available for this agency context');
  });
});
