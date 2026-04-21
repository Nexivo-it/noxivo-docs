import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as listConversations } from '../app/api/team-inbox/route.js';
import { GET as listMessages, POST as sendMessage } from '../app/api/team-inbox/[conversationId]/messages/route.js';
import { POST as runConversationAction } from '../app/api/team-inbox/[conversationId]/actions/route.js';
import { GET as listLeads } from '../app/api/team-inbox/leads/route.js';
import { POST as runMessageAction } from '../app/api/team-inbox/[conversationId]/messages/[messageId]/actions/route.js';
import { GET as getLeadState, POST as saveLead, DELETE as deleteLead } from '../app/api/team-inbox/[conversationId]/lead/route.js';
import { POST as assignConversation } from '../app/api/team-inbox/[conversationId]/assign/route.js';
import { POST as markConversationRead } from '../app/api/team-inbox/[conversationId]/read/route.js';
import { POST as suggestReply } from '../app/api/team-inbox/[conversationId]/suggest-reply/route.js';

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

describe('team inbox routes proxy to workflow-engine', () => {
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

  it('forwards list + leads routes with query params', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse([{ id: 'conversation-1' }]))
      .mockResolvedValueOnce(createJsonResponse([{ id: 'lead-1' }]));
    vi.stubGlobal('fetch', fetchMock);

    await listConversations(new Request('http://localhost/api/team-inbox?source=whatsapp&status=active'));
    await listLeads(new Request('http://localhost/api/team-inbox/leads?query=alice'));

    const calledUrls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(calledUrls).toEqual([
      'http://workflow-engine.internal/api/v1/team-inbox?source=whatsapp&status=active',
      'http://workflow-engine.internal/api/v1/team-inbox/leads?query=alice',
    ]);
  });

  it('forwards team-inbox conversation and message subtree methods', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await assignConversation(
      new Request('http://localhost/api/team-inbox/cv-1/assign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assigneeUserId: 'user-2' }),
      }),
      { params: Promise.resolve({ conversationId: 'cv-1' }) }
    );
    await runConversationAction(
      new Request('http://localhost/api/team-inbox/cv-1/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'archive' }),
      }),
      { params: Promise.resolve({ conversationId: 'cv-1' }) }
    );
    await listMessages(new Request('http://localhost/api/team-inbox/cv-1/messages?cursor=10'), {
      params: Promise.resolve({ conversationId: 'cv-1' }),
    });
    await sendMessage(
      new Request('http://localhost/api/team-inbox/cv-1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'Hello there' }),
      }),
      { params: Promise.resolve({ conversationId: 'cv-1' }) }
    );
    await runMessageAction(
      new Request('http://localhost/api/team-inbox/cv-1/messages/msg-1/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      }),
      { params: Promise.resolve({ conversationId: 'cv-1', messageId: 'msg-1' }) }
    );

    const calledUrls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(calledUrls).toEqual([
      'http://workflow-engine.internal/api/v1/team-inbox/cv-1/assign',
      'http://workflow-engine.internal/api/v1/team-inbox/cv-1/actions',
      'http://workflow-engine.internal/api/v1/team-inbox/cv-1/messages?cursor=10',
      'http://workflow-engine.internal/api/v1/team-inbox/cv-1/messages',
      'http://workflow-engine.internal/api/v1/team-inbox/cv-1/messages/msg-1/actions',
    ]);
  });

  it('encodes dynamic params before proxying nested team-inbox routes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const rawConversationId = 'contact:+1 555/000';
    const rawMessageId = 'wamid.abc/123==';

    await getLeadState(new Request('http://localhost/api/team-inbox/lead'), {
      params: Promise.resolve({ conversationId: rawConversationId }),
    });
    await saveLead(
      new Request('http://localhost/api/team-inbox/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tags: ['vip'] }),
      }),
      { params: Promise.resolve({ conversationId: rawConversationId }) }
    );
    await deleteLead(new Request('http://localhost/api/team-inbox/lead', { method: 'DELETE' }), {
      params: Promise.resolve({ conversationId: rawConversationId }),
    });
    await markConversationRead(new Request('http://localhost/api/team-inbox/read', { method: 'POST' }), {
      params: Promise.resolve({ conversationId: rawConversationId }),
    });
    await suggestReply(
      new Request('http://localhost/api/team-inbox/suggest-reply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tone: 'professional' }),
      }),
      { params: Promise.resolve({ conversationId: rawConversationId }) }
    );
    await runMessageAction(
      new Request('http://localhost/api/team-inbox/message-actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      }),
      { params: Promise.resolve({ conversationId: rawConversationId, messageId: rawMessageId }) }
    );

    const encodedConversationId = encodeURIComponent(rawConversationId);
    const encodedMessageId = encodeURIComponent(rawMessageId);
    const calledUrls = fetchMock.mock.calls.map((call) => call[0] as string);

    expect(calledUrls).toEqual([
      `http://workflow-engine.internal/api/v1/team-inbox/${encodedConversationId}/lead`,
      `http://workflow-engine.internal/api/v1/team-inbox/${encodedConversationId}/lead`,
      `http://workflow-engine.internal/api/v1/team-inbox/${encodedConversationId}/lead`,
      `http://workflow-engine.internal/api/v1/team-inbox/${encodedConversationId}/read`,
      `http://workflow-engine.internal/api/v1/team-inbox/${encodedConversationId}/suggest-reply`,
      `http://workflow-engine.internal/api/v1/team-inbox/${encodedConversationId}/messages/${encodedMessageId}/actions`,
    ]);
  });
});
