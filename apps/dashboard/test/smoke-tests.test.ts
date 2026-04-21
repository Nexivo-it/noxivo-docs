import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as listPlugins } from '../app/api/team-inbox/plugins/route.js';
import { GET as getInboxStats } from '../app/api/team-inbox/stats/route.js';
import { GET as getInboxBilling } from '../app/api/team-inbox/billing/route.js';
import { GET as getDeliveryHistory } from '../app/api/team-inbox/[conversationId]/delivery-history/route.js';
import { POST as unhandoffConversation } from '../app/api/team-inbox/[conversationId]/unhandoff/route.js';

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

describe('dashboard proxy smoke tests', () => {
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

  it('forwards plugin/stats/billing endpoints to workflow-engine', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await listPlugins(new Request('http://localhost/api/team-inbox/plugins'));
    await getInboxStats(new Request('http://localhost/api/team-inbox/stats'));
    await getInboxBilling(new Request('http://localhost/api/team-inbox/billing'));

    const calledUrls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(calledUrls).toEqual([
      'http://workflow-engine.internal/api/v1/team-inbox/plugins',
      'http://workflow-engine.internal/api/v1/team-inbox/stats',
      'http://workflow-engine.internal/api/v1/team-inbox/billing',
    ]);
  });

  it('forwards delivery-history and unhandoff conversation actions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await getDeliveryHistory(new Request('http://localhost/api/team-inbox/cv-22/delivery-history'), {
      params: Promise.resolve({ conversationId: 'cv-22' }),
    });
    await unhandoffConversation(
      new Request('http://localhost/api/team-inbox/cv-22/unhandoff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'manual takeover' }),
      }),
      { params: Promise.resolve({ conversationId: 'cv-22' }) }
    );

    const calledUrls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(calledUrls).toEqual([
      'http://workflow-engine.internal/api/v1/team-inbox/cv-22/delivery-history',
      'http://workflow-engine.internal/api/v1/team-inbox/cv-22/unhandoff',
    ]);
    const methods = fetchMock.mock.calls.map((call) => (call[1] as RequestInit).method);
    expect(methods).toEqual(['GET', 'POST']);
  });
});
