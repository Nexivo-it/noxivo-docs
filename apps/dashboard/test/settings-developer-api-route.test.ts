import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GET as getDeveloperApiKey,
  POST as createDeveloperApiKey,
  DELETE as revokeDeveloperApiKey,
} from '../app/api/settings/developer-api/route.js';

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

describe('settings developer-api route proxy behavior', () => {
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

  it('forwards GET/POST/DELETE developer-api requests to workflow-engine', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ tokenPreview: 'abc...' }))
      .mockResolvedValueOnce(createJsonResponse({ token: 'secret-token' }, 201))
      .mockResolvedValueOnce(createJsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await getDeveloperApiKey(new Request('http://localhost/api/settings/developer-api'));
    await createDeveloperApiKey(
      new Request('http://localhost/api/settings/developer-api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rotate: true }),
      })
    );
    await revokeDeveloperApiKey(new Request('http://localhost/api/settings/developer-api', { method: 'DELETE' }));

    const calledUrls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(calledUrls).toEqual([
      'http://workflow-engine.internal/api/v1/settings/developer-api',
      'http://workflow-engine.internal/api/v1/settings/developer-api',
      'http://workflow-engine.internal/api/v1/settings/developer-api',
    ]);

    const methods = fetchMock.mock.calls.map((call) => (call[1] as RequestInit).method);
    expect(methods).toEqual(['GET', 'POST', 'DELETE']);
  });
});
