import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as uploadCatalog } from '../app/api/catalog/upload/route.js';
import { GET as listCatalogItems, POST as createCatalogItem } from '../app/api/catalog/route.js';
import { GET as getCatalogItem, PATCH as patchCatalogItem, DELETE as deleteCatalogItem } from '../app/api/catalog/[id]/route.js';
import { GET as getCatalogSettings, POST as postCatalogSettings } from '../app/api/catalog/settings/route.js';
import { POST as publishCatalog } from '../app/api/catalog/publish/route.js';
import { POST as catalogAiHelp } from '../app/api/catalog/ai-help/route.js';
import { GET as listWorkflows, POST as createWorkflow } from '../app/api/workflows/route.js';
import { POST as cloneWorkflowTemplate } from '../app/api/workflows/clone/route.js';
import {
  GET as getWorkflow,
  PATCH as patchWorkflow,
  DELETE as deleteWorkflow,
} from '../app/api/workflows/[workflowId]/route.js';
import { POST as toggleWorkflow } from '../app/api/workflows/[workflowId]/toggle/route.js';
import { GET as listWorkflowRuns } from '../app/api/workflows/[workflowId]/runs/route.js';
import { GET as getWorkflowAnalytics } from '../app/api/workflows/[workflowId]/analytics/route.js';
import { GET as streamWorkflowEvents } from '../app/api/workflows/[workflowId]/execution-events/route.js';
import { GET as listTeamInbox } from '../app/api/team-inbox/route.js';
import { GET as streamTeamInboxEvents } from '../app/api/team-inbox/events/route.js';
import { GET as listTeamInboxLeads } from '../app/api/team-inbox/leads/route.js';
import { GET as getTeamInboxStats } from '../app/api/team-inbox/stats/route.js';
import { GET as listTeamInboxPlugins, POST as upsertTeamInboxPlugin } from '../app/api/team-inbox/plugins/route.js';
import { GET as getTeamInboxBilling } from '../app/api/team-inbox/billing/route.js';
import { POST as assignTeamInboxConversation } from '../app/api/team-inbox/[conversationId]/assign/route.js';
import { POST as postTeamInboxConversationAction } from '../app/api/team-inbox/[conversationId]/actions/route.js';
import { GET as getTeamInboxConversationCrm, PATCH as patchTeamInboxConversationCrm } from '../app/api/team-inbox/[conversationId]/crm/route.js';
import { GET as getTeamInboxDeliveryHistory } from '../app/api/team-inbox/[conversationId]/delivery-history/route.js';
import {
  GET as getTeamInboxLead,
  POST as saveTeamInboxLead,
  DELETE as deleteTeamInboxLead,
} from '../app/api/team-inbox/[conversationId]/lead/route.js';
import {
  GET as listTeamInboxMessages,
  POST as sendTeamInboxMessage,
} from '../app/api/team-inbox/[conversationId]/messages/route.js';
import { POST as resendTeamInboxMessage } from '../app/api/team-inbox/[conversationId]/messages/[messageId]/route.js';
import { POST as postTeamInboxMessageAction } from '../app/api/team-inbox/[conversationId]/messages/[messageId]/actions/route.js';
import { POST as readTeamInboxConversation } from '../app/api/team-inbox/[conversationId]/read/route.js';
import { POST as suggestTeamInboxReply } from '../app/api/team-inbox/[conversationId]/suggest-reply/route.js';
import { POST as unhandoffTeamInboxConversation } from '../app/api/team-inbox/[conversationId]/unhandoff/route.js';
import { GET as listSettingsCredentials, POST as upsertSettingsCredential } from '../app/api/settings/credentials/route.js';
import {
  GET as getDeveloperApiKey,
  POST as createDeveloperApiKey,
  DELETE as revokeDeveloperApiKey,
} from '../app/api/settings/developer-api/route.js';
import { GET as getShopSettings, POST as postShopSettings } from '../app/api/settings/shop/route.js';
import {
  GET as getQrSettings,
  POST as postQrSettings,
  DELETE as deleteQrSettings,
} from '../app/api/settings/qr/route.js';
import { GET as getStorageSettings, PUT as putStorageSettings } from '../app/api/settings/storage/route.js';
import { GET as getWhatsAppCheck } from '../app/api/settings/whatsapp-check/route.js';
import {
  GET as getWebhookInboxActivation,
  POST as postWebhookInboxActivation,
  DELETE as deleteWebhookInboxActivation,
} from '../app/api/settings/webhook-inbox-activation/route.js';
import {
  GET as listWebhookInboxSources,
  POST as createWebhookInboxSource,
} from '../app/api/settings/webhook-inbox-sources/route.js';
import { PATCH as patchWebhookInboxSource } from '../app/api/settings/webhook-inbox-sources/[sourceId]/route.js';

const { mockGetCurrentSession } = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn(),
}));

vi.mock('../lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession,
}));

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('phase 7 dashboard routes proxy to workflow-engine', () => {
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

  it('forwards catalog route tree with methods/query/body intact', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await listCatalogItems(new Request('http://localhost/api/catalog?search=haircut&page=2'));
    await createCatalogItem(
      new Request('http://localhost/api/catalog', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: 'noxivo_session=sess-1' },
        body: JSON.stringify({ payload: { name: 'Haircut' } }),
      })
    );
    await getCatalogItem(new Request('http://localhost/api/catalog/item-1'), {
      params: Promise.resolve({ id: 'item-1' }),
    });
    await patchCatalogItem(
      new Request('http://localhost/api/catalog/item-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      }),
      { params: Promise.resolve({ id: 'item-1' }) }
    );
    await deleteCatalogItem(new Request('http://localhost/api/catalog/item-1', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'item-1' }),
    });
    await getCatalogSettings(new Request('http://localhost/api/catalog/settings'));
    await postCatalogSettings(
      new Request('http://localhost/api/catalog/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessName: 'Acme' }),
      })
    );
    await publishCatalog(
      new Request('http://localhost/api/catalog/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destination: { type: 'webhook', url: 'https://example.com' } }),
      })
    );
    await catalogAiHelp(
      new Request('http://localhost/api/catalog/ai-help', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ context: { name: 'Haircut' }, mode: 'seo-only' }),
      })
    );

    const calledUrls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(calledUrls).toEqual([
      'http://workflow-engine.internal/api/v1/catalog?search=haircut&page=2',
      'http://workflow-engine.internal/api/v1/catalog',
      'http://workflow-engine.internal/api/v1/catalog/item-1',
      'http://workflow-engine.internal/api/v1/catalog/item-1',
      'http://workflow-engine.internal/api/v1/catalog/item-1',
      'http://workflow-engine.internal/api/v1/catalog/settings',
      'http://workflow-engine.internal/api/v1/catalog/settings',
      'http://workflow-engine.internal/api/v1/catalog/publish',
      'http://workflow-engine.internal/api/v1/catalog/ai-help',
    ]);

    const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(secondInit.method).toBe('POST');
    const headers = new Headers(secondInit.headers);
    expect(headers.get('cookie')).toBe('noxivo_session=sess-1');
  });

  it('preserves multipart upload forwarding for /api/catalog/upload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ url: '/uploads/file.png' }));
    vi.stubGlobal('fetch', fetchMock);

    const formData = new FormData();
    formData.set('file', new File([new Uint8Array([1, 2, 3])], 'catalog.png', { type: 'image/png' }));

    await uploadCatalog(
      new Request('http://localhost/api/catalog/upload', {
        method: 'POST',
        body: formData,
      }) as unknown as import('next/server').NextRequest
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://workflow-engine.internal/api/v1/catalog/upload');
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('content-type')?.toLowerCase()).toContain('multipart/form-data');
    expect(init.body).toBeDefined();
  });

  it('forwards workflows routes, including SSE event streaming', async () => {
    const sseUpstream = new Response('data: {"type":"connected"}\n\n', {
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ workflows: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'wf-1' }, 201))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ workflow: { id: 'wf-1' } }))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ runs: [], events: [] }))
      .mockResolvedValueOnce(jsonResponse({ analytics: {} }))
      .mockResolvedValueOnce(sseUpstream);
    vi.stubGlobal('fetch', fetchMock);

    await listWorkflows(new Request('http://localhost/api/workflows?status=active'));
    await createWorkflow(
      new Request('http://localhost/api/workflows', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Welcome Flow' }),
      })
    );
    await cloneWorkflowTemplate(
      new Request('http://localhost/api/workflows/clone', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ templateId: 'template-1' }),
      })
    );

    await getWorkflow(new Request('http://localhost/api/workflows/wf-1'), {
      params: Promise.resolve({ workflowId: 'wf-1' }),
    });
    await patchWorkflow(
      new Request('http://localhost/api/workflows/wf-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      }),
      { params: Promise.resolve({ workflowId: 'wf-1' }) }
    );
    await deleteWorkflow(new Request('http://localhost/api/workflows/wf-1', { method: 'DELETE' }), {
      params: Promise.resolve({ workflowId: 'wf-1' }),
    });
    await toggleWorkflow(new Request('http://localhost/api/workflows/wf-1/toggle', { method: 'POST' }), {
      params: Promise.resolve({ workflowId: 'wf-1' }),
    });
    await listWorkflowRuns(new Request('http://localhost/api/workflows/wf-1/runs'), {
      params: Promise.resolve({ workflowId: 'wf-1' }),
    });
    await getWorkflowAnalytics(new Request('http://localhost/api/workflows/wf-1/analytics?window=7d'), {
      params: Promise.resolve({ workflowId: 'wf-1' }),
    });
    const streamResponse = await streamWorkflowEvents(
      new Request('http://localhost/api/workflows/wf-1/execution-events?cursor=10'),
      { params: Promise.resolve({ workflowId: 'wf-1' }) }
    );

    expect(streamResponse.status).toBe(200);
    expect(streamResponse.headers.get('content-type')).toContain('text/event-stream');
    const streamBody = await streamResponse.text();
    expect(streamBody).toContain('"type":"connected"');

    const calledUrls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(calledUrls).toEqual([
      'http://workflow-engine.internal/api/v1/workflows?status=active',
      'http://workflow-engine.internal/api/v1/workflows',
      'http://workflow-engine.internal/api/v1/workflows/clone',
      'http://workflow-engine.internal/api/v1/workflows/wf-1',
      'http://workflow-engine.internal/api/v1/workflows/wf-1',
      'http://workflow-engine.internal/api/v1/workflows/wf-1',
      'http://workflow-engine.internal/api/v1/workflows/wf-1/toggle',
      'http://workflow-engine.internal/api/v1/workflows/wf-1/runs',
      'http://workflow-engine.internal/api/v1/workflows/wf-1/analytics?window=7d',
      'http://workflow-engine.internal/api/v1/workflows/wf-1/execution-events?cursor=10',
    ]);
  });

  it('forwards team-inbox/settings route trees with status propagation and team-inbox SSE passthrough', async () => {
    const teamInboxEventsUpstream = new Response('data: {"type":"connected"}\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
    });

    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/v1/team-inbox/events')) {
        return Promise.resolve(teamInboxEventsUpstream);
      }
      if (url.endsWith('/api/v1/settings/storage') && (init?.method ?? 'GET') === 'PUT') {
        return Promise.resolve(jsonResponse({ persisted: true }, 201));
      }

      return Promise.resolve(
        jsonResponse({ ok: true, method: init?.method ?? 'GET', url }, 200)
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await listTeamInbox(new Request('http://localhost/api/team-inbox?query=vip&page=2'));
    const teamInboxEventsResponse = await streamTeamInboxEvents(
      new Request('http://localhost/api/team-inbox/events?cursor=123')
    );
    await listTeamInboxLeads(new Request('http://localhost/api/team-inbox/leads?query=lead'));
    await getTeamInboxStats(new Request('http://localhost/api/team-inbox/stats'));
    await listTeamInboxPlugins(new Request('http://localhost/api/team-inbox/plugins?pluginId=shop'));
    await upsertTeamInboxPlugin(
      new Request('http://localhost/api/team-inbox/plugins', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: 'noxivo_session=sess-1' },
        body: JSON.stringify({ pluginId: 'shop', pluginVersion: '1.0.0', enabled: true }),
      })
    );
    await getTeamInboxBilling(new Request('http://localhost/api/team-inbox/billing'));
    await assignTeamInboxConversation(
      new Request('http://localhost/api/team-inbox/c-1/assign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assignedTo: 'user-2' }),
      }),
      { params: Promise.resolve({ conversationId: 'c-1' }) }
    );
    await postTeamInboxConversationAction(
      new Request('http://localhost/api/team-inbox/c-1/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'archive' }),
      }),
      { params: Promise.resolve({ conversationId: 'c-1' }) }
    );
    await getTeamInboxConversationCrm(new Request('http://localhost/api/team-inbox/c-1/crm'), {
      params: Promise.resolve({ conversationId: 'c-1' }),
    });
    await patchTeamInboxConversationCrm(
      new Request('http://localhost/api/team-inbox/c-1/crm', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'add_note', note: { body: 'priority' } }),
      }),
      { params: Promise.resolve({ conversationId: 'c-1' }) }
    );
    await getTeamInboxDeliveryHistory(
      new Request('http://localhost/api/team-inbox/c-1/delivery-history'),
      { params: Promise.resolve({ conversationId: 'c-1' }) }
    );
    await getTeamInboxLead(new Request('http://localhost/api/team-inbox/c-1/lead'), {
      params: Promise.resolve({ conversationId: 'c-1' }),
    });
    await saveTeamInboxLead(new Request('http://localhost/api/team-inbox/c-1/lead', { method: 'POST' }), {
      params: Promise.resolve({ conversationId: 'c-1' }),
    });
    await deleteTeamInboxLead(new Request('http://localhost/api/team-inbox/c-1/lead', { method: 'DELETE' }), {
      params: Promise.resolve({ conversationId: 'c-1' }),
    });
    await listTeamInboxMessages(new Request('http://localhost/api/team-inbox/c-1/messages?limit=25'), {
      params: Promise.resolve({ conversationId: 'c-1' }),
    });
    await sendTeamInboxMessage(
      new Request('http://localhost/api/team-inbox/c-1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'hello' }),
      }),
      { params: Promise.resolve({ conversationId: 'c-1' }) }
    );
    await resendTeamInboxMessage(
      new Request('http://localhost/api/team-inbox/c-1/messages/m-1', { method: 'POST' }),
      { params: Promise.resolve({ conversationId: 'c-1', messageId: 'm-1' }) }
    );
    await postTeamInboxMessageAction(
      new Request('http://localhost/api/team-inbox/c-1/messages/m-1/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'star' }),
      }),
      { params: Promise.resolve({ conversationId: 'c-1', messageId: 'm-1' }) }
    );
    await readTeamInboxConversation(new Request('http://localhost/api/team-inbox/c-1/read', { method: 'POST' }), {
      params: Promise.resolve({ conversationId: 'c-1' }),
    });
    await suggestTeamInboxReply(
      new Request('http://localhost/api/team-inbox/c-1/suggest-reply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'assist' }),
      }),
      { params: Promise.resolve({ conversationId: 'c-1' }) }
    );
    await unhandoffTeamInboxConversation(
      new Request('http://localhost/api/team-inbox/c-1/unhandoff', { method: 'POST' }),
      { params: Promise.resolve({ conversationId: 'c-1' }) }
    );

    await listSettingsCredentials(new Request('http://localhost/api/settings/credentials'));
    await upsertSettingsCredential(
      new Request('http://localhost/api/settings/credentials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'shopify', secret: { accessToken: 'token' }, config: { storeUrl: 'https://shop' } }),
      })
    );
    await getDeveloperApiKey(new Request('http://localhost/api/settings/developer-api'));
    await createDeveloperApiKey(new Request('http://localhost/api/settings/developer-api', { method: 'POST' }));
    await revokeDeveloperApiKey(new Request('http://localhost/api/settings/developer-api', { method: 'DELETE' }));
    await getShopSettings(new Request('http://localhost/api/settings/shop'));
    await postShopSettings(
      new Request('http://localhost/api/settings/shop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'shopify', enabled: true }),
      })
    );
    await getQrSettings(new Request('http://localhost/api/settings/qr'));
    await postQrSettings(
      new Request('http://localhost/api/settings/qr', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate' }),
      })
    );
    await deleteQrSettings(new Request('http://localhost/api/settings/qr', { method: 'DELETE' }));
    await getStorageSettings(new Request('http://localhost/api/settings/storage'));
    const putStorageResponse = await putStorageSettings(
      new Request('http://localhost/api/settings/storage', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 's3', isActive: true }),
      })
    );
    await getWhatsAppCheck(new Request('http://localhost/api/settings/whatsapp-check'));
    await getWebhookInboxActivation(new Request('http://localhost/api/settings/webhook-inbox-activation'));
    await postWebhookInboxActivation(new Request('http://localhost/api/settings/webhook-inbox-activation', { method: 'POST' }));
    await deleteWebhookInboxActivation(new Request('http://localhost/api/settings/webhook-inbox-activation', { method: 'DELETE' }));
    await listWebhookInboxSources(new Request('http://localhost/api/settings/webhook-inbox-sources'));
    await createWebhookInboxSource(
      new Request('http://localhost/api/settings/webhook-inbox-sources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Inbound', inboundSecret: 'secret', outboundUrl: 'https://example.com' }),
      })
    );
    await patchWebhookInboxSource(
      new Request('http://localhost/api/settings/webhook-inbox-sources/src-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'disabled' }),
      }),
      { params: Promise.resolve({ sourceId: 'src-1' }) }
    );

    expect(teamInboxEventsResponse.status).toBe(200);
    expect(teamInboxEventsResponse.headers.get('content-type')).toContain('text/event-stream');
    expect(await teamInboxEventsResponse.text()).toContain('"type":"connected"');

    expect(putStorageResponse.status).toBe(201);
    await expect(putStorageResponse.json()).resolves.toEqual({ persisted: true });

    const calledUrls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(calledUrls).toContain('http://workflow-engine.internal/api/v1/team-inbox/events?cursor=123');
    expect(calledUrls).toContain('http://workflow-engine.internal/api/v1/settings/webhook-inbox-sources/src-1');

    const pluginPostCall = fetchMock.mock.calls.find(
      (call) => call[0] === 'http://workflow-engine.internal/api/v1/team-inbox/plugins' && (call[1] as RequestInit).method === 'POST'
    );
    expect(pluginPostCall).toBeDefined();
    const pluginPostHeaders = new Headers((pluginPostCall?.[1] as RequestInit).headers);
    expect(pluginPostHeaders.get('cookie')).toBe('noxivo_session=sess-1');
  });
});
