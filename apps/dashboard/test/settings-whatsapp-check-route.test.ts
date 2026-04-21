import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getWhatsAppCheck } from '../app/api/settings/whatsapp-check/route.js';

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

describe('settings whatsapp-check route proxy behavior', () => {
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

  it('forwards whatsapp status checks to workflow-engine', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ connected: true }));
    vi.stubGlobal('fetch', fetchMock);

    await getWhatsAppCheck(new Request('http://localhost/api/settings/whatsapp-check'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://workflow-engine.internal/api/v1/settings/whatsapp-check');
    expect(init.method).toBe('GET');
  });
});
