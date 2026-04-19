import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { AgencyModel, TenantModel, MessagingClusterModel, MessagingSessionBindingModel } from '@noxivo/database';
import { connectWorkflowEngineTestDb, disconnectWorkflowEngineTestDb, resetWorkflowEngineTestDb } from './helpers/mongo-memory.js';
import { MessagingSessionService } from '../src/lib/messaging-session.service.js';

describe('MessagingSessionService', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-messaging-session-tests' });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  async function seedTestData() {
    const agency = await AgencyModel.create({
      name: 'Test Agency',
      slug: 'test-agency',
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
        supportEmail: 'support@test.agency',
        hidePlatformBranding: false
      }
    });

    const tenant = await TenantModel.create({
      agencyId: agency._id,
      name: 'Default Tenant',
      slug: 'default-tenant',
      region: 'us-east-1',
      status: 'active',
      billingMode: 'agency_pays'
    });

    return {
      agencyId: agency._id.toString(),
      tenantId: tenant._id.toString()
    };
  }

  it('bootstraps a new session by allocating a cluster and creating a binding', async () => {
    const { agencyId, tenantId } = await seedTestData();
    process.env.MESSAGING_PROVIDER_PROXY_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'test-token';

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ name: 'test-agency-whatsapp' }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new MessagingSessionService();
    const result = await service.bootstrap(agencyId, tenantId);

    expect(result.sessionName).toBe('test-agency-whatsapp');
    expect(result.status).toBe('SCAN_QR_CODE');

    const binding = await MessagingSessionBindingModel.findOne({ agencyId, tenantId }).lean();
    expect(binding).toBeTruthy();
    expect(binding?.status).toBe('pending');
    expect(binding?.messagingSessionName).toBe('test-agency-whatsapp');

    const cluster = await MessagingClusterModel.findOne({ region: 'us-east-1' }).lean();
    expect(cluster).toBeTruthy();
    expect(cluster?.activeSessionCount).toBe(1);
  });

  it('reuses an existing active binding if present', async () => {
    const { agencyId, tenantId } = await seedTestData();
    
    await MessagingSessionBindingModel.create({
      agencyId,
      tenantId,
      clusterId: new mongoose.Types.ObjectId(),
      sessionName: 'existing-session',
      messagingSessionName: 'existing-session',
      status: 'active'
    });

    const service = new MessagingSessionService();
    const result = await service.bootstrap(agencyId, tenantId);

    expect(result.sessionName).toBe('existing-session');
    expect(result.status).toBe('WORKING');
  });

  it('re-provisions an existing pending binding and supports MESSAGING_PROVIDER_BASE_URL fallback', async () => {
    const { agencyId, tenantId } = await seedTestData();
    const cluster = await MessagingClusterModel.create({
      name: 'pending-cluster',
      region: 'us-east-1',
      baseUrl: 'https://messaging.test',
      dashboardUrl: 'https://messaging.test/dashboard',
      swaggerUrl: 'https://messaging.test/swagger',
      capacity: 10,
      activeSessionCount: 1,
      status: 'active',
      secretRefs: {
        webhookSecretVersion: 'v1'
      }
    });

    await MessagingSessionBindingModel.create({
      agencyId,
      tenantId,
      clusterId: cluster._id,
      sessionName: 'existing-session',
      messagingSessionName: 'existing-session',
      status: 'pending'
    });

    delete process.env.MESSAGING_PROVIDER_PROXY_BASE_URL;
    delete process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN;
    process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_API_KEY = 'base-token';

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/sessions/existing-session') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ message: 'Session not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/api/sessions') && init?.method === 'POST') {
        return new Response(JSON.stringify({ name: 'existing-session' }), {
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

    const service = new MessagingSessionService();
    const result = await service.bootstrap(agencyId, tenantId);

    expect(result).toEqual({
      sessionName: 'existing-session',
      status: 'SCAN_QR_CODE'
    });
    expect(fetchMock).toHaveBeenCalled();

    const createCall = fetchMock.mock.calls.find(([calledUrl]) => {
      const url = typeof calledUrl === 'string' ? calledUrl : calledUrl.toString();
      return url.endsWith('/api/sessions');
    });
    expect(createCall).toBeTruthy();

    const headers = new Headers(createCall?.[1]?.headers);
    expect(headers.get('x-api-key')).toBe('base-token');

    const updatedCluster = await MessagingClusterModel.findById(cluster._id).lean();
    expect(updatedCluster?.activeSessionCount).toBe(1);
  });

  it('gets QR code from MessagingProvider', async () => {
    process.env.MESSAGING_PROVIDER_PROXY_BASE_URL = 'https://messaging.test';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ value: 'qr-code-data' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new MessagingSessionService();
    const result = await service.getQr('some-session');

    expect(result.qr).toBe('qr-code-data');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/some-session/auth/qr?format=raw'),
      expect.any(Object)
    );
  });

  it('prefers the bound cluster base url over proxy env when fetching QR codes', async () => {
    const { agencyId, tenantId } = await seedTestData();
    const cluster = await MessagingClusterModel.create({
      name: 'qr-cluster',
      region: 'us-east-1',
      baseUrl: 'http://messaging.test',
      dashboardUrl: 'http://messaging.test/dashboard',
      swaggerUrl: 'http://messaging.test/swagger',
      capacity: 10,
      activeSessionCount: 1,
      status: 'active',
      secretRefs: {
        webhookSecretVersion: 'v1'
      }
    });

    await MessagingSessionBindingModel.create({
      agencyId,
      tenantId,
      clusterId: cluster._id,
      sessionName: 'tenant-main',
      messagingSessionName: 'tenant-main',
      status: 'active'
    });

    process.env.MESSAGING_PROVIDER_PROXY_BASE_URL = 'https://api-workflow-engine.khelifi-salmen.com';

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ value: 'qr-code-data' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new MessagingSessionService();
    const result = await service.getQr('tenant-main');

    expect(result.qr).toBe('qr-code-data');
    expect(String(fetchMock.mock.calls[0]?.[0] ?? '')).toContain('http://messaging.test/api/tenant-main/auth/qr?format=raw');
  });

  it('gets profile from MessagingProvider', async () => {
    process.env.MESSAGING_PROVIDER_PROXY_BASE_URL = 'https://messaging.test';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      me: { id: '123@c.us', pushName: 'Test User', profilePicUrl: 'http://pic.url' }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new MessagingSessionService();
    const profile = await service.getProfile('some-session');

    expect(profile).toEqual({
      id: '123@c.us',
      pushName: 'Test User',
      profilePicUrl: 'http://pic.url'
    });
  });

  it('returns null profile if MessagingProvider returns error', async () => {
    process.env.MESSAGING_PROVIDER_PROXY_BASE_URL = 'https://messaging.test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Not Found', { status: 404 })));

    const service = new MessagingSessionService();
    const profile = await service.getProfile('some-session');

    expect(profile).toBeNull();
  });
});
