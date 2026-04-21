import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GET as getSettingsQr,
  POST as postSettingsQr,
  DELETE as deleteSettingsQr,
} from '../app/api/settings/qr/route.js';

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

describe('settings qr route proxy behavior', () => {
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

  it('forwards GET/POST/DELETE qr requests to workflow-engine', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ state: 'unlinked' }))
      .mockResolvedValueOnce(createJsonResponse({ state: 'qr_ready' }))
      .mockResolvedValueOnce(createJsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await getSettingsQr(new Request('http://localhost/api/settings/qr?action=status'));
    await postSettingsQr(
      new Request('http://localhost/api/settings/qr', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate' }),
      })
    );
    await deleteSettingsQr(new Request('http://localhost/api/settings/qr', { method: 'DELETE' }));

    const calledUrls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(calledUrls).toEqual([
      'http://workflow-engine.internal/api/v1/settings/qr?action=status',
      'http://workflow-engine.internal/api/v1/settings/qr',
      'http://workflow-engine.internal/api/v1/settings/qr',
    ]);

    const methods = fetchMock.mock.calls.map((call) => (call[1] as RequestInit).method);
    expect(methods).toEqual(['GET', 'POST', 'DELETE']);
  });
});
