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

  it('returns 503 when session lookup fails before whatsapp status resolution starts', async () => {
    mockGetCurrentSession.mockRejectedValue(new Error('MongoDB connection timed out after 10s'));

    const response = await getWhatsAppCheck();
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(503);
    expect(payload.error).toBe('Dashboard session store unavailable. Please verify MONGODB_URI.');
  });

  it('returns unlinked bootstrap-required snapshot when binding is missing on passive check', async () => {
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

    const response = await getWhatsAppCheck();
    const payload = await response.json() as {
      agencyId: string;
      tenantId: string;
      state: string;
      reason: string | null;
      poll: boolean;
      qrValue: string | null;
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      agencyId,
      tenantId,
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
    const payload = await response.json() as {
      tenantId: string;
      state: string;
      reason: string | null;
      poll: boolean;
      qrValue: string | null;
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      tenantId: fallbackTenantId,
      state: 'qr_ready',
      reason: null,
      poll: true,
      qrValue: 'engine-qr-token'
    });
  });

  it('returns preparing state for recoverable startup status without QR', async () => {
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
        return new Response(JSON.stringify({ id: 'binding-id', name: 'owner-example-whatsapp' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/sessions/binding-id/status')) {
        return new Response(JSON.stringify({ status: 'STARTING', me: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/sessions/binding-id/qr')) {
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

    const response = await getWhatsAppCheck();
    const payload = await response.json() as {
      state: string;
      reason: string | null;
      poll: boolean;
      qrValue: string | null;
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      state: 'preparing',
      reason: 'startup_in_progress',
      poll: true,
      qrValue: null
    });
  });

  it('returns preparing with qr fetch failure reason on transient QR endpoint failure', async () => {
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
        return new Response(JSON.stringify({ id: 'binding-id', name: 'owner-example-whatsapp' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/sessions/binding-id/status')) {
        return new Response(JSON.stringify({ status: 'STARTING', me: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/sessions/binding-id/qr')) {
        return new Response(JSON.stringify({ error: 'temporary upstream issue' }), {
          status: 503,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const response = await getWhatsAppCheck();
    const payload = await response.json() as {
      state: string;
      reason: string | null;
      poll: boolean;
      qrValue: string | null;
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      state: 'preparing',
      reason: 'qr_fetch_recoverable_error',
      poll: true,
      qrValue: null
    });
  });

  it('returns connected state passive and non-polling when session is connected without QR', async () => {
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
        return new Response(JSON.stringify({ id: 'binding-id', name: 'owner-example-whatsapp' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/sessions/binding-id/status')) {
        // WORKING status means connected - should NOT poll and should NOT show QR
        return new Response(JSON.stringify({ status: 'WORKING', me: { id: '+1234567890', phone: '+1234567890' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/sessions/binding-id/qr')) {
        // QR endpoint returns null - this must not be rendered for connected session
        return new Response(JSON.stringify({ qr: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/sessions/binding-id/profile')) {
        return new Response(JSON.stringify({ id: '+1234567890', name: 'Owner', picture: null }), {
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

    const response = await getWhatsAppCheck();
    const payload = await response.json() as {
      state: string;
      reason: string | null;
      poll: boolean;
      qrValue: string | null;
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      state: 'connected',
      reason: null,
      poll: false,
      qrValue: null
    });

    // Verify QR endpoint was NOT called for connected session (no need to fetch QR)
    const qrCall = fetchMock.mock.calls.find(([calledUrl]) => (
      typeof calledUrl === 'string' && calledUrl.includes('/binding-id/qr')
    ));
    expect(qrCall).toBeFalsy();
  });

  it('returns connected state when me identity exists but no QR endpoint returns empty', async () => {
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
        return new Response(JSON.stringify({ id: 'binding-id', name: 'owner-example-whatsapp' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/sessions/binding-id/status')) {
        // Connected via me identity but no explicit WORKING status
        return new Response(JSON.stringify({ status: 'CONNECTED', me: { id: '+9876543210', phone: '+9876543210' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/sessions/binding-id/qr')) {
        // Empty QR response even for connected session
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

    const response = await getWhatsAppCheck();
    const payload = await response.json() as {
      state: string;
      reason: string | null;
      poll: boolean;
      qrValue: string | null;
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      state: 'connected',
      reason: null,
      poll: false,
      qrValue: null
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
