import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getConversationCrm, PATCH as patchConversationCrm } from '../app/api/team-inbox/[conversationId]/crm/route.js';

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

describe('team inbox CRM routes proxy behavior', () => {
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

  it('forwards CRM profile read and update to workflow-engine', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ contactProfile: { crmTags: [] } }))
      .mockResolvedValueOnce(createJsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await getConversationCrm(new Request('http://localhost/api/team-inbox/cv-1/crm'), {
      params: Promise.resolve({ conversationId: 'cv-1' }),
    });
    await patchConversationCrm(
      new Request('http://localhost/api/team-inbox/cv-1/crm', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: { body: 'Follow up' } }),
      }),
      { params: Promise.resolve({ conversationId: 'cv-1' }) }
    );

    const calledUrls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(calledUrls).toEqual([
      'http://workflow-engine.internal/api/v1/team-inbox/cv-1/crm',
      'http://workflow-engine.internal/api/v1/team-inbox/cv-1/crm',
    ]);

    const methods = fetchMock.mock.calls.map((call) => (call[1] as RequestInit).method);
    expect(methods).toEqual(['GET', 'PATCH']);
  });
});
