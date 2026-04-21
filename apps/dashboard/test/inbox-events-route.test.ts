import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getInboxEvents } from '../app/api/team-inbox/events/route.js';

const { mockGetCurrentSession } = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn(),
}));

vi.mock('../lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession,
}));

describe('team inbox events route proxy behavior', () => {
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

  it('forwards SSE stream requests to workflow-engine and preserves stream headers', async () => {
    const upstream = new Response('data: {"type":"connected"}\n\n', {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(upstream);
    vi.stubGlobal('fetch', fetchMock);

    const response = await getInboxEvents(new Request('http://localhost/api/team-inbox/events?cursor=17'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://workflow-engine.internal/api/v1/team-inbox/events?cursor=17');
    expect(init.method).toBe('GET');
  });

  it('returns 401 and does not call fetch when there is no active session', async () => {
    mockGetCurrentSession.mockResolvedValueOnce(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await getInboxEvents(new Request('http://localhost/api/team-inbox/events'));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
