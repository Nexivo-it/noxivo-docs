import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getShopSettings, POST as updateShopSettings } from '../app/api/settings/shop/route.js';

const { mockGetCurrentSession } = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn(),
}));

vi.mock('../lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession,
}));

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('settings shop route proxy behavior', () => {
  beforeEach(() => {
    process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL = 'http://workflow-engine.internal';
    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: 'user-1',
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        email: 'owner@example.com',
        fullName: 'Owner',
        role: 'agency_owner',
        status: 'active',
      },
      expiresAt: new Date(Date.now() + 60_000),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL;
  });

  it('forwards GET /api/settings/shop to workflow-engine', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ providers: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await getShopSettings(new Request('http://localhost/api/settings/shop'));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://workflow-engine.internal/api/v1/settings/shop');
    expect(init.method).toBe('GET');
  });

  it('forwards POST /api/settings/shop payload to workflow-engine', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await updateShopSettings(
      new Request('http://localhost/api/settings/shop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'shopify', enabled: true }),
      })
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://workflow-engine.internal/api/v1/settings/shop');
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('content-type')).toContain('application/json');
  });
});
