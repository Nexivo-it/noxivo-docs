import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import {
  AgencyModel,
  ContactProfileModel,
  ConversationModel,
  MessageModel,
  TenantModel,
  WebhookInboxSourceModel,
  WorkflowDefinitionModel
} from '@noxivo/database';
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
  mockGetCurrentSession: vi.fn()
}));

const { mockBroadcastInboxEvent } = vi.hoisted(() => ({
  mockBroadcastInboxEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession
}));

vi.mock('../lib/inbox-events', () => ({
  broadcastInboxEvent: mockBroadcastInboxEvent,
  subscribeToInboxEvents: vi.fn()
}));
import {
  connectDashboardTestDb,
  disconnectDashboardTestDb,
  resetDashboardTestDb
} from './helpers/mongo-memory.js';

describe('team inbox routes', () => {
  let agencyId: mongoose.Types.ObjectId;
  let tenantId: mongoose.Types.ObjectId;
  let conversationId: mongoose.Types.ObjectId;
  let userId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    process.env.ENGINE_API_KEY = 'test-key';
    await connectDashboardTestDb({ dbName: 'noxivo-dashboard-team-inbox-tests' });
  });

  afterEach(async () => {
    // Wait for any floating promises from sparse backfills to flush to the microtask queue
    await new Promise((resolve) => setTimeout(resolve, 50));
    mockGetCurrentSession.mockReset();
    mockBroadcastInboxEvent.mockClear();
    vi.unstubAllGlobals();
    delete process.env.LLM_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_API_URL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
    delete process.env.ANTHROPIC_API_URL;
    delete process.env.MessagingProvider_BASE_URL;
    delete process.env.MessagingProvider_API_KEY;
    delete process.env.MessagingProvider_PROXY_BASE_URL;
    delete process.env.MessagingProvider_PROXY_AUTH_TOKEN;
    delete process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL;
    delete process.env.WORKFLOW_ENGINE_INTERNAL_PSK;
    await resetDashboardTestDb();
  });

  afterAll(async () => {
    await disconnectDashboardTestDb();
  });

  async function seedInbox() {
    agencyId = new mongoose.Types.ObjectId();
    tenantId = new mongoose.Types.ObjectId();
    conversationId = new mongoose.Types.ObjectId();
    userId = new mongoose.Types.ObjectId();

    await AgencyModel.create({
      _id: agencyId,
      name: 'Acme Agency',
      slug: 'acme-agency',
      plan: 'enterprise',
      billingStripeCustomerId: null,
      billingStripeSubscriptionId: null,
      billingOwnerUserId: new mongoose.Types.ObjectId(),
      whiteLabelDefaults: {
        customDomain: null,
        logoUrl: null,
        primaryColor: '#6366F1',
        supportEmail: 'ops@acme.test',
        hidePlatformBranding: false
      },
      usageLimits: { tenants: 5, activeSessions: 20 },
      status: 'active'
    });

    await TenantModel.create({
      _id: tenantId,
      agencyId,
      slug: 'acme-main',
      name: 'Acme Main',
      region: 'us-east-1',
      status: 'active',
      billingMode: 'agency_pays',
      whiteLabelOverrides: {},
      effectiveBrandingCache: {}
    });

    await ConversationModel.create({
      _id: conversationId,
      agencyId,
      tenantId,
      contactId: '15550001111',
      contactName: 'Alice Smith',
      contactPhone: '+1 555-000-1111',
      status: 'open',
      lastMessageContent: 'Hello from customer',
      lastMessageAt: new Date(),
      unreadCount: 2
    });

    await MessageModel.create({
      conversationId,
      role: 'user',
      content: 'Hello from customer'
    });

    await WorkflowDefinitionModel.create({
      name: 'Welcome Flow',
      agencyId,
      tenantId,
      key: 'welcome-flow',
      version: 'v1',
      channel: 'whatsapp',
      editorGraph: {
        nodes: [{ id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} }],
        edges: []
      },
      compiledDag: {
        entryNodeId: 'trigger-1',
        topologicalOrder: ['trigger-1'],
        nodes: [{ id: 'trigger-1', type: 'trigger', next: [], input: {} }],
        metadata: { compiledAt: new Date().toISOString(), version: 'v1', nodeCount: 1 }
      },
      isActive: true
    });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: userId.toString(),
        agencyId: agencyId.toString(),
        tenantId: tenantId.toString(),
        email: 'owner@example.com',
        fullName: 'Owner User',
        role: 'agency_owner',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60000)
    });
  }

  it('lists conversations with authenticated tenant scoping and supports search', async () => {
    await seedInbox();

    const response = await listConversations(new Request('http://localhost/api/team-inbox?query=alice'));
    const payload = await response.json() as Array<{
      contactName: string | null;
      contactProfile: {
        totalMessages: number;
        inboundMessages: number;
        outboundMessages: number;
        firstSeenAt: string | null;
        lastInboundAt: string | null;
        lastOutboundAt: string | null;
      };
    }>;

    expect(response.status).toBe(200);
    expect(payload).toHaveLength(1);
    expect(payload[0]?.contactName).toBe('Alice Smith');
    expect(payload[0]?.contactProfile.totalMessages).toBe(1);
    expect(payload[0]?.contactProfile.inboundMessages).toBe(1);
    expect(payload[0]?.contactProfile.outboundMessages).toBe(0);
    expect(payload[0]?.contactProfile.firstSeenAt).toBeTruthy();
    expect(payload[0]?.contactProfile.lastInboundAt).toBeTruthy();
    expect(payload[0]?.contactProfile.lastOutboundAt).toBeNull();
  }, 60000);

  it('supports source-aware inbox filters and excludes archived conversations by default', async () => {
    await seedInbox();

    const webhookSourceId = new mongoose.Types.ObjectId();
    const webhookConversationId = new mongoose.Types.ObjectId();
    const archivedConversationId = new mongoose.Types.ObjectId();

    await WebhookInboxSourceModel.create({
      _id: webhookSourceId,
      agencyId,
      tenantId,
      name: 'Website Chat',
      status: 'active',
      inboundPath: 'website-chat',
      inboundSecretHash: 'hashed-secret',
      outboundUrl: 'https://example.com/outbound',
      outboundHeaders: {}
    });

    await ConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          metadata: {
            messagingChatId: '15550001111@c.us'
          }
        }
      }
    ).exec();

    await ConversationModel.create([
      {
        _id: webhookConversationId,
        agencyId,
        tenantId,
        contactId: 'webhook-contact-123',
        contactName: 'Website Visitor',
        contactPhone: null,
        status: 'open',
        unreadCount: 1,
        lastMessageContent: 'Need help from the website',
        lastMessageAt: new Date('2026-04-19T12:00:00.000Z'),
        metadata: {
          webhookInboxSourceId: webhookSourceId.toString(),
          webhookContactId: 'webhook-contact-123'
        }
      },
      {
        _id: archivedConversationId,
        agencyId,
        tenantId,
        contactId: '15550009999@c.us',
        contactName: 'Archived Customer',
        contactPhone: '+1 555-000-9999',
        status: 'open',
        unreadCount: 0,
        lastMessageContent: 'Older archived thread',
        lastMessageAt: new Date('2026-04-19T11:00:00.000Z'),
        metadata: {
          messagingChatId: '15550009999@c.us',
          isArchived: true
        }
      }
    ]);

    await MessageModel.create([
      {
        conversationId,
        role: 'assistant',
        content: 'Reply from operator',
        metadata: { source: 'dashboard.internal-inbox' },
        timestamp: new Date('2026-04-19T09:00:00.000Z')
      },
      {
        conversationId: webhookConversationId,
        role: 'user',
        content: 'Need help from the website',
        metadata: { source: 'webhook.inbound' },
        timestamp: new Date('2026-04-19T12:00:00.000Z')
      },
      {
        conversationId: archivedConversationId,
        role: 'user',
        content: 'Older archived thread',
        metadata: { source: 'messaging.webhook' },
        timestamp: new Date('2026-04-19T11:00:00.000Z')
      }
    ]);

    const defaultResponse = await listConversations(new Request('http://localhost/api/team-inbox'));
    const defaultPayload = await defaultResponse.json() as Array<{
      _id: string;
      channel?: string;
      isArchived?: boolean;
      sourceName?: string | null;
    }>;

    expect(defaultResponse.status).toBe(200);
    expect(defaultPayload.map((conversation) => conversation._id)).toEqual([
      webhookConversationId.toString(),
      conversationId.toString()
    ]);
    expect(defaultPayload.find((conversation) => conversation._id === conversationId.toString())?.channel).toBe('whatsapp');
    expect(defaultPayload.find((conversation) => conversation._id === webhookConversationId.toString())?.channel).toBe('webhook');
    expect(defaultPayload.find((conversation) => conversation._id === webhookConversationId.toString())?.sourceName).toBe('Website Chat');
    expect(defaultPayload.some((conversation) => conversation.isArchived)).toBe(false);

    const whatsappResponse = await listConversations(
      new Request('http://localhost/api/team-inbox?source=whatsapp&status=active')
    );
    const whatsappPayload = await whatsappResponse.json() as Array<{ _id: string }>;
    expect(whatsappPayload.map((conversation) => conversation._id)).toEqual([conversationId.toString()]);

    const webhookResponse = await listConversations(
      new Request('http://localhost/api/team-inbox?source=webhook&status=active')
    );
    const webhookPayload = await webhookResponse.json() as Array<{ _id: string; sourceName?: string | null }>;
    expect(webhookPayload.map((conversation) => conversation._id)).toEqual([webhookConversationId.toString()]);
    expect(webhookPayload[0]?.sourceName).toBe('Website Chat');

    const archivedResponse = await listConversations(
      new Request('http://localhost/api/team-inbox?status=archived')
    );
    const archivedPayload = await archivedResponse.json() as Array<{ _id: string; isArchived?: boolean }>;
    expect(archivedPayload.map((conversation) => conversation._id)).toEqual([archivedConversationId.toString()]);
    expect(archivedPayload[0]?.isArchived).toBe(true);
  }, 60000);

  it('archives and unarchives webhook conversations using local dashboard state only', async () => {
    await seedInbox();

    const webhookSourceId = new mongoose.Types.ObjectId();
    await WebhookInboxSourceModel.create({
      _id: webhookSourceId,
      agencyId,
      tenantId,
      name: 'Website Chat',
      status: 'active',
      inboundPath: 'website-chat-local',
      inboundSecretHash: 'hashed-secret',
      outboundUrl: 'https://example.com/outbound',
      outboundHeaders: {}
    });

    await ConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          contactId: 'webhook-contact-123',
          contactName: 'Website Visitor',
          contactPhone: null,
          metadata: {
            webhookInboxSourceId: webhookSourceId.toString(),
            webhookContactId: 'webhook-contact-123'
          }
        }
      }
    ).exec();

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'unexpected remote call' }), { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const archiveResponse = await runConversationAction(
      new Request('http://localhost/api/team-inbox/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'archive' })
      }),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );
    const archivePayload = await archiveResponse.json() as { success: boolean; isArchived?: boolean };

    const archivedConversation = await ConversationModel.findById(conversationId).lean().exec() as {
      metadata?: { isArchived?: boolean };
    } | null;

    expect(archiveResponse.status).toBe(200);
    expect(archivePayload.success).toBe(true);
    expect(archivePayload.isArchived).toBe(true);
    expect(archivedConversation?.metadata?.isArchived).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    const defaultResponse = await listConversations(new Request('http://localhost/api/team-inbox'));
    const defaultPayload = await defaultResponse.json() as Array<{ _id: string }>;
    expect(defaultPayload).toHaveLength(0);

    const unarchiveResponse = await runConversationAction(
      new Request('http://localhost/api/team-inbox/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'unarchive' })
      }),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );
    const unarchivePayload = await unarchiveResponse.json() as { success: boolean; isArchived?: boolean };

    const unarchivedConversation = await ConversationModel.findById(conversationId).lean().exec() as {
      metadata?: { isArchived?: boolean };
    } | null;

    expect(unarchiveResponse.status).toBe(200);
    expect(unarchivePayload.success).toBe(true);
    expect(unarchivePayload.isArchived).toBe(false);
    expect(unarchivedConversation?.metadata?.isArchived).toBe(false);

    const restoredResponse = await listConversations(new Request('http://localhost/api/team-inbox'));
    const restoredPayload = await restoredResponse.json() as Array<{ _id: string }>;
    expect(restoredPayload.map((conversation) => conversation._id)).toEqual([conversationId.toString()]);
  }, 60000);

  it('keeps WhatsApp archive actions proxied while persisting local archive state', async () => {
    await seedInbox();

    await ConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          metadata: {
            messagingChatId: '15550001111@c.us'
          }
        }
      }
    ).exec();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/v1/sessions/by-tenant?')) {
        return new Response(JSON.stringify({
          id: '67ab1234567890abcdef9999',
          name: 'tenant-main'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/api/v1/tenant-main/chats/15550001111%40c.us/archive')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unhandled request: ${url}` }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await runConversationAction(
      new Request('http://localhost/api/team-inbox/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'archive' })
      }),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );
    const payload = await response.json() as { success: boolean; isArchived?: boolean };

    const archivedConversation = await ConversationModel.findById(conversationId).lean().exec() as {
      metadata?: { isArchived?: boolean };
    } | null;

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.isArchived).toBe(true);
    expect(archivedConversation?.metadata?.isArchived).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/api/v1/tenant-main/chats/15550001111%40c.us/archive'))
    ).toBe(true);
  }, 60000);

  it('filters conversations by source channel using latest message metadata', async () => {
    await seedInbox();

    const webhookConversationId = new mongoose.Types.ObjectId();
    await ConversationModel.create({
      _id: webhookConversationId,
      agencyId,
      tenantId,
      contactId: 'webhook:order-1001',
      contactName: 'Webhook Buyer',
      contactPhone: null,
      status: 'open',
      lastMessageContent: 'Order created from landing page',
      lastMessageAt: new Date(),
      unreadCount: 1,
      metadata: { webhookInboxSourceId: 'source_123' }
    });

    await MessageModel.create({
      conversationId: webhookConversationId,
      role: 'user',
      content: 'Order created from landing page',
      metadata: { source: 'webhook.inbox-source.orders' }
    });

    const webhookResponse = await listConversations(new Request('http://localhost/api/team-inbox?source=webhook'));
    const webhookPayload = await webhookResponse.json() as Array<{ _id: string; channel?: string }>;

    expect(webhookResponse.status).toBe(200);
    expect(webhookPayload).toHaveLength(1);
    expect(webhookPayload[0]?._id).toBe(webhookConversationId.toString());
    expect(webhookPayload[0]?.channel).toBe('webhook');

    const whatsappResponse = await listConversations(new Request('http://localhost/api/team-inbox?source=whatsapp'));
    const whatsappPayload = await whatsappResponse.json() as Array<{ _id: string; channel?: string }>;
    expect(whatsappResponse.status).toBe(200);
    expect(whatsappPayload.some((conversation) => conversation._id === conversationId.toString())).toBe(true);
    expect(whatsappPayload.some((conversation) => conversation._id === webhookConversationId.toString())).toBe(false);
  });

  it('treats archived filter as closed/deleted and excludes archived by default', async () => {
    await seedInbox();

    const archivedConversationId = new mongoose.Types.ObjectId();
    await ConversationModel.create({
      _id: archivedConversationId,
      agencyId,
      tenantId,
      contactId: '15550002222',
      contactName: 'Archived Contact',
      contactPhone: '+1 555-000-2222',
      status: 'closed',
      lastMessageContent: 'Archived thread',
      lastMessageAt: new Date(),
      unreadCount: 0
    });

    const defaultResponse = await listConversations(new Request('http://localhost/api/team-inbox'));
    const defaultPayload = await defaultResponse.json() as Array<{ _id: string }>;
    expect(defaultResponse.status).toBe(200);
    expect(defaultPayload.some((conversation) => conversation._id === archivedConversationId.toString())).toBe(false);

    const archivedResponse = await listConversations(new Request('http://localhost/api/team-inbox?status=archived'));
    const archivedPayload = await archivedResponse.json() as Array<{ _id: string; status: string }>;
    expect(archivedResponse.status).toBe(200);
    expect(archivedPayload).toHaveLength(1);
    expect(archivedPayload[0]?._id).toBe(archivedConversationId.toString());
    expect(archivedPayload[0]?.status).toBe('closed');
  });

  it('archives non-whatsapp conversations locally without requiring messaging session', async () => {
    await seedInbox();

    const webhookConversationId = new mongoose.Types.ObjectId();
    await ConversationModel.create({
      _id: webhookConversationId,
      agencyId,
      tenantId,
      contactId: 'webhook:event-1002',
      contactName: 'Webhook Contact',
      contactPhone: null,
      status: 'open',
      unreadCount: 0,
      metadata: { webhookInboxSourceId: 'source_abc' }
    });

    const response = await runConversationAction(
      new Request(`http://localhost/api/team-inbox/${webhookConversationId.toString()}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'archive' })
      }),
      { params: Promise.resolve({ conversationId: webhookConversationId.toString() }) }
    );
    const payload = await response.json() as { success: boolean; status?: string };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.status).toBe('closed');

    const archived = await ConversationModel.findById(webhookConversationId).lean();
    expect(archived?.status).toBe('closed');
  });

  it('saves a conversation contact as lead and exposes lead state in inbox summaries', async () => {
    await seedInbox();

    const saveResponse = await saveLead(
      new Request('http://localhost/api/team-inbox/1/lead', { method: 'POST' }),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );
    expect(saveResponse.status).toBe(200);

    const leadStateResponse = await getLeadState(
      new Request('http://localhost/api/team-inbox/1/lead'),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );
    expect(leadStateResponse.status).toBe(200);
    const leadStatePayload = await leadStateResponse.json() as { success: boolean; leadSaved: boolean };
    expect(leadStatePayload.success).toBe(true);
    expect(leadStatePayload.leadSaved).toBe(true);

    const listResponse = await listConversations(new Request('http://localhost/api/team-inbox'));
    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json() as Array<{ _id: string; leadSaved?: boolean }>;
    const updatedConversation = listPayload.find((conversation) => conversation._id === conversationId.toString());
    expect(updatedConversation?.leadSaved).toBe(true);
  });

  it('lists saved leads and removes lead tag via lead endpoint', async () => {
    await seedInbox();

    await saveLead(
      new Request('http://localhost/api/team-inbox/1/lead', { method: 'POST' }),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    const leadsResponse = await listLeads(new Request('http://localhost/api/team-inbox/leads'));
    expect(leadsResponse.status).toBe(200);
    const leadsPayload = await leadsResponse.json() as Array<{ contactId: string }>;
    expect(leadsPayload.some((lead) => lead.contactId === '15550001111')).toBe(true);

    const deleteResponse = await deleteLead(
      new Request('http://localhost/api/team-inbox/1/lead', { method: 'DELETE' }),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );
    expect(deleteResponse.status).toBe(200);

    const leadsAfterDeleteResponse = await listLeads(new Request('http://localhost/api/team-inbox/leads'));
    expect(leadsAfterDeleteResponse.status).toBe(200);
    const leadsAfterDeletePayload = await leadsAfterDeleteResponse.json() as Array<{ contactId: string }>;
    expect(leadsAfterDeletePayload.some((lead) => lead.contactId === '15550001111')).toBe(false);
  });

  it('uses workflow-engine proxy for MessagingProvider chat fallback and never calls MessagingProvider directly', async () => {
    await seedInbox();
    await ConversationModel.deleteMany({ agencyId, tenantId }).exec();

    process.env.MessagingProvider_BASE_URL = 'http://messaging.test';
    process.env.MessagingProvider_API_KEY = 'messaging-test-key';

    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/v1/internal/inbox/sync')) {
        return new Response(JSON.stringify({
          syncedConversations: 0,
          syncedMessages: 0,
          sessionName: 'dev-agency-whatsapp'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/api/v1/chats?')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/v1/inbox/chats?')) {
        return new Response(JSON.stringify({ error: 'sync unavailable' }), {
          status: 500,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/api/v1/sessions/by-tenant?')) {
        return new Response(JSON.stringify({
          id: '67ab1234567890abcdef9999',
          name: 'dev-agency-whatsapp'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/api/v1/dev-agency-whatsapp/chats/overview?limit=100')) {
        return new Response(JSON.stringify([
          {
            id: '15550001111@c.us',
            name: 'Alice Smith',
            picture: 'https://cdn.example.com/alice.jpg',
            lastMessage: {
              body: 'hello from messaging',
              timestamp: 1713027600,
              fromMe: false
            },
            _chat: { unreadCount: 1 }
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Unhandled request in test' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const response = await listConversations(new Request('http://localhost/api/team-inbox'));
    const payload = await response.json() as Array<{ contactId: string; avatarUrl: string | null }>;

    expect(response.status).toBe(200);
    expect(payload[0]?.contactId).toBe('15550001111@c.us');
    expect(payload[0]?.avatarUrl).toBe('https://cdn.example.com/alice.jpg');
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).startsWith('http://messaging.test/'))
    ).toBe(false);
  }, 60000);

  it('returns avatarUrl from conversation metadata when available', async () => {
    await seedInbox();

    await ConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          metadata: {
            contactPicture: 'https://cdn.example.com/alice.jpg'
          }
        }
      }
    ).exec();

    const response = await listConversations(new Request('http://localhost/api/team-inbox'));
    const payload = await response.json() as Array<{
      _id: string;
      avatarUrl: string | null;
    }>;

    expect(response.status).toBe(200);
    expect(payload[0]?._id).toBe(conversationId.toString());
    expect(payload[0]?.avatarUrl).toBe('https://cdn.example.com/alice.jpg');
  }, 60000);

  it('keeps distinct split-lid inbox summaries separate when they are different chat identities', async () => {
    await seedInbox();

    await ConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          contactId: '50805738631354@lid',
          contactName: 'Alice Smith',
          contactPhone: '50805738631354'
        }
      }
    ).exec();

    await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '92681787166746@lid',
      contactName: 'Alice Smith',
      contactPhone: '92681787166746',
      status: 'open',
      unreadCount: 0,
      lastMessageContent: 'Hello from customer',
      lastMessageAt: new Date(),
      metadata: { engineConversationId: '92681787166746@lid' }
    });

    const response = await listConversations(new Request('http://localhost/api/team-inbox'));
    const payload = await response.json() as Array<{
      _id: string;
      contactName: string | null;
    }>;

    expect(response.status).toBe(200);
    expect(payload).toHaveLength(2);
    expect(payload.some((summary) => summary._id === conversationId.toString())).toBe(true);
    expect(payload.every((summary) => summary.contactName === 'Alice Smith')).toBe(true);
  }, 60000);

  it('merges sibling inbox summaries when latest provider message id matches across identities', async () => {
    await seedInbox();

    const siblingConversationId = new mongoose.Types.ObjectId();

    await ConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          contactId: '189026510352459@lid',
          contactName: 'Mohamed',
          contactPhone: '189026510352459',
          lastMessageContent: 'ok',
          lastMessageAt: new Date('2026-04-18T09:11:27.000Z')
        }
      }
    ).exec();

    await ConversationModel.create({
      _id: siblingConversationId,
      agencyId,
      tenantId,
      contactId: '84387922680@c.us',
      contactName: null,
      contactPhone: '84387922680',
      status: 'open',
      unreadCount: 0,
      lastMessageContent: 'ok',
      lastMessageAt: new Date('2026-04-18T09:11:27.000Z')
    });

    await MessageModel.deleteMany({ conversationId: { $in: [conversationId, siblingConversationId] } }).exec();
    await MessageModel.create([
      {
        conversationId,
        role: 'user',
        content: 'ok',
        providerMessageId: 'true_189026510352459@lid_2A1567FAE210A629F2CE',
        timestamp: new Date('2026-04-18T09:11:27.000Z')
      },
      {
        conversationId: siblingConversationId,
        role: 'user',
        content: 'ok',
        providerMessageId: 'true_189026510352459@lid_2A1567FAE210A629F2CE',
        timestamp: new Date('2026-04-18T09:11:27.000Z')
      }
    ]);

    const response = await listConversations(new Request('http://localhost/api/team-inbox'));
    const payload = await response.json() as Array<{
      contactId: string;
      lastMessage: { content: string; createdAt: string } | null;
    }>;

    expect(response.status).toBe(200);
    expect(payload).toHaveLength(1);
    expect(payload[0]?.lastMessage?.content).toBe('ok');
  }, 60000);

  it('uses tenantIds fallback when actor.tenantId is blank', async () => {
    await seedInbox();

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: userId.toString(),
        agencyId: agencyId.toString(),
        tenantId: '',
        tenantIds: [tenantId.toString()],
        email: 'owner@example.com',
        fullName: 'Owner User',
        role: 'agency_owner',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60000)
    });

    const response = await listConversations(new Request('http://localhost/api/team-inbox'));
    const payload = await response.json() as Array<{ _id: string }>;

    expect(response.status).toBe(200);
    expect(payload).toHaveLength(1);
    expect(payload[0]?._id).toBe(conversationId.toString());
  }, 60000);

  it('merges duplicate contact rows using canonical identity metadata and prefers the known contact name', async () => {
    await seedInbox();

    const siblingConversationId = new mongoose.Types.ObjectId();

    await ConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          contactId: '84961566302@c.us',
          contactName: 'Unknown',
          contactPhone: '84961566302',
          metadata: {
            messagingCanonicalContactId: '84961566302@c.us',
            messagingAliases: ['84961566302@c.us', '50805738631354@lid'],
            messagingChatId: '84961566302@c.us'
          }
        }
      }
    ).exec();

    await ConversationModel.create({
      _id: siblingConversationId,
      agencyId,
      tenantId,
      contactId: '50805738631354@lid',
      contactName: 'Salmen Khelifi',
      contactPhone: '84961566302',
      status: 'open',
      unreadCount: 0,
      lastMessageContent: 'from lid',
      lastMessageAt: new Date('2026-04-19T12:00:00.000Z'),
      metadata: {
        messagingCanonicalContactId: '84961566302@c.us',
        messagingAliases: ['84961566302@c.us', '50805738631354@lid'],
        messagingChatId: '50805738631354@lid'
      }
    });

    const response = await listConversations(new Request('http://localhost/api/team-inbox'));
    const payload = await response.json() as Array<{ contactId: string; contactName: string | null }>;

    expect(response.status).toBe(200);
    expect(payload).toHaveLength(1);
    expect(payload[0]?.contactId).toBe('84961566302@c.us');
    expect(payload[0]?.contactName).toBe('Salmen Khelifi');
  }, 60000);

  it('resolves slug tenant context to canonical tenant id for inbox queries', async () => {
    await seedInbox();

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: userId.toString(),
        agencyId: agencyId.toString(),
        tenantId: 'acme-main',
        tenantIds: [],
        email: 'owner@example.com',
        fullName: 'Owner User',
        role: 'agency_owner',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60000)
    });

    const response = await listConversations(new Request('http://localhost/api/team-inbox'));
    const payload = await response.json() as Array<{ _id: string }>;

    expect(response.status).toBe(200);
    expect(payload).toHaveLength(1);
    expect(payload[0]?._id).toBe(conversationId.toString());
  }, 60000);

  it('triggers a best-effort inbox sync before listing conversations when workflow-engine is configured', async () => {
    await seedInbox();

    process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL = 'http://workflow-engine.internal';
    process.env.WORKFLOW_ENGINE_INTERNAL_PSK = 'internal-psk';

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      syncedConversations: 1,
      syncedMessages: 0,
      sessionName: 'tenant-main'
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await listConversations(new Request('http://localhost/api/team-inbox'));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://workflow-engine.internal/v1/internal/inbox/sync',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-nexus-internal-psk': 'internal-psk'
        })
      })
    );
  }, 60000);

  it('refreshes existing conversation summaries from workflow-engine inbox chats when local rows are stale', async () => {
    await seedInbox();

    await ConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          lastMessageContent: 'Old local summary',
          lastMessageAt: new Date('2026-04-12T09:00:00.000Z'),
          unreadCount: 0
        }
      }
    ).exec();

    process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL = 'http://workflow-engine.internal';
    process.env.WORKFLOW_ENGINE_INTERNAL_PSK = 'internal-psk';

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/v1/internal/inbox/sync')) {
        return new Response(JSON.stringify({
          syncedConversations: 1,
          syncedMessages: 1,
          sessionName: 'tenant-main'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/api/v1/chats?')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/v1/inbox/chats?')) {
        return new Response(JSON.stringify({
          chats: [
            {
              id: '15550001111',
              name: 'Alice Smith',
              picture: null,
              lastMessage: {
                id: 'remote-inbound-1',
                body: 'New inbound from engine',
                timestamp: 1712916000,
                fromMe: false
              },
              unreadCount: 3
            }
          ],
          total: 1,
          hasMore: false
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unhandled request: ${url}` }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const response = await listConversations(new Request('http://localhost/api/team-inbox'));
    const payload = await response.json() as Array<{
      _id: string;
      unreadCount: number;
      lastMessage: { content: string; createdAt: string } | null;
    }>;

    const persistedConversation = await ConversationModel.findById(conversationId).lean().exec();

    expect(response.status).toBe(200);
    expect(payload[0]?.lastMessage?.content).toBe('New inbound from engine');
    expect(payload[0]?.unreadCount).toBe(3);
    expect(persistedConversation?.lastMessageContent).toBe('New inbound from engine');
    expect(persistedConversation?.unreadCount).toBe(3);
  }, 60000);

  it('prefers persisted contact profiles before falling back to message aggregation', async () => {
    await seedInbox();

    await ContactProfileModel.create({
      agencyId,
      tenantId,
      contactId: '15550001111',
      contactName: 'Alice Smith',
      contactPhone: '+1 555-000-1111',
      firstSeenAt: new Date('2026-04-10T10:00:00.000Z'),
      lastInboundAt: new Date('2026-04-11T10:00:00.000Z'),
      lastOutboundAt: new Date('2026-04-11T11:00:00.000Z'),
      totalMessages: 9,
      inboundMessages: 6,
      outboundMessages: 3
    });

    const response = await listConversations(new Request('http://localhost/api/team-inbox'));
    const payload = await response.json() as Array<{
      contactProfile: {
        totalMessages: number;
        inboundMessages: number;
        outboundMessages: number;
        firstSeenAt: string | null;
      };
    }>;

    expect(response.status).toBe(200);
    expect(payload[0]?.contactProfile.totalMessages).toBe(9);
    expect(payload[0]?.contactProfile.inboundMessages).toBe(6);
    expect(payload[0]?.contactProfile.outboundMessages).toBe(3);
    expect(payload[0]?.contactProfile.firstSeenAt).toBe('2026-04-10T10:00:00.000Z');
  }, 60000);

  it('sends messages, assigns conversations, marks them read, and loads message history', async () => {
    await seedInbox();

    process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL = 'http://workflow-engine.internal';
    process.env.WORKFLOW_ENGINE_INTERNAL_PSK = 'internal-psk';

    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/v1/messages/send')) {
        return new Response(JSON.stringify({
          id: 'wamid-123',
          status: 'sent',
          timestamp: new Date('2026-04-12T10:00:00.000Z').toISOString()
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (url.endsWith('/v1/internal/inbox/sync')) {
        return new Response(JSON.stringify({
          syncedConversations: 1,
          syncedMessages: 1,
          sessionName: 'tenant-main'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (url.endsWith('/assign')) {
        return new Response(JSON.stringify({
          _id: conversationId.toString(),
          assignedTo: userId.toString(),
          status: 'handoff'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const sendResponse = await sendMessage(
      new Request('http://localhost/api/team-inbox/1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'We are on it.' })
      }),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    expect(sendResponse.status).toBe(200);
    expect(await MessageModel.countDocuments({ conversationId })).toBe(1);

    const firstCall = fetchMock.mock.calls.find(call => call[0].toString().includes('/sendText') || call[0].toString().includes('/messages'));
    expect(firstCall).toBeTruthy();
    if (!firstCall) {
      throw new Error('Expected workflow-engine fetch call');
    }

    const [rawUrl, rawInit] = firstCall as unknown as [unknown, unknown];
    const url = String(rawUrl);
    const init = (rawInit ?? {}) as RequestInit;
    const headers = new Headers(init.headers);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(url).toBe('http://localhost:4000/api/v1/messages/send');
    expect(headers.get('x-api-key')).toBe('test-key');
    expect(body).toMatchObject({
      to: '15550001111',
      text: 'We are on it.',
      agencyId: agencyId.toString(),
      tenantId: tenantId.toString()
    });

    const assignResponse = await assignConversation(
      new Request('http://localhost/api/team-inbox/1/assign', { method: 'POST' }),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    expect(assignResponse.status).toBe(200);
    const assignPayload = await assignResponse.json() as { status: string };
    expect(assignPayload.status).toBe('handoff');

    const readResponse = await markConversationRead(
      new Request('http://localhost/api/team-inbox/1/read', { method: 'POST' }),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    expect(readResponse.status).toBe(200);

    const messagesResponse = await listMessages(
      new Request('http://localhost/api/team-inbox/1/messages'),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );
    const messages = await messagesResponse.json() as Array<{ role: string; content: string }>;

    expect(messagesResponse.status).toBe(200);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('Hello from customer');

    const conversation = await ConversationModel.findById(conversationId).lean();
    expect(conversation?.assignedTo?.toString()).toBe(userId.toString());
    expect(conversation?.status).toBe('handoff');
    expect(conversation?.unreadCount).toBe(0);
  }, 60000);

  it('resolves @lid recipient to canonical MessagingProvider contact id before sending', async () => {
    await seedInbox();

    await ConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          contactId: '15550001111@lid',
          metadata: { messagingChatId: '15550001111@lid' }
        }
      }
    ).exec();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/v1/sessions/by-tenant?')) {
        return new Response(JSON.stringify({
          id: '67ab1234567890abcdef9999',
          name: 'dev-agency-whatsapp'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/api/v1/dev-agency-whatsapp/contacts/15550001111%40lid')) {
        return new Response(JSON.stringify({
          id: '15550001111@c.us',
          number: '15550001111',
          name: 'Alice Smith',
          profilePicUrl: 'https://cdn.example.com/alice-lid.jpg'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/api/v1/messages/send')) {
        return new Response(JSON.stringify({
          id: 'wamid-resolved-1',
          status: 'sent',
          timestamp: new Date('2026-04-12T10:00:00.000Z').toISOString()
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/v1/internal/inbox/sync')) {
        return new Response(JSON.stringify({
          syncedConversations: 1,
          syncedMessages: 1,
          sessionName: 'tenant-main'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Unhandled request in test' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const sendResponse = await sendMessage(
      new Request('http://localhost/api/team-inbox/1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'resolved send test' })
      }),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    expect(sendResponse.status).toBe(200);

    const sendCall = fetchMock.mock.calls.find((call) =>
      String(call?.[0] ?? '').includes('/api/v1/messages/send')
    );
    expect(sendCall).toBeTruthy();
    if (!sendCall) {
      throw new Error('Expected /messages/send call');
    }

    const [, sendInit] = sendCall as unknown as [RequestInfo | URL, RequestInit | undefined];
    const sendBody = JSON.parse(String(sendInit?.body ?? '{}')) as { to?: string };
    expect(sendBody.to).toBe('15550001111@c.us');

    const updatedConversation = await ConversationModel.findById(conversationId).lean();
    const updatedMetadata = updatedConversation?.metadata as Record<string, unknown> | undefined;
    expect(updatedMetadata?.messagingChatId).toBe('15550001111@c.us');
    expect(updatedMetadata?.contactPicture).toBe('https://cdn.example.com/alice-lid.jpg');
  }, 60000);

  it('triggers a best-effort conversation sync before listing message history when workflow-engine is configured', async () => {
    await seedInbox();

    process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL = 'http://workflow-engine.internal';
    process.env.WORKFLOW_ENGINE_INTERNAL_PSK = 'internal-psk';

    const fetchMock = vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      syncedConversations: 1,
      syncedMessages: 2,
      sessionName: 'tenant-main'
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await listMessages(
      new Request('http://localhost/api/team-inbox/1/messages'),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://workflow-engine.internal/v1/internal/inbox/sync',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-nexus-internal-psk': 'internal-psk'
        })
      })
    );
  }, 60000);

  it('supports cursor pagination when loading older message history', async () => {
    await seedInbox();
    await MessageModel.deleteMany({ conversationId });

    await MessageModel.create([
      {
        conversationId,
        role: 'user',
        content: 'Oldest',
        timestamp: new Date('2026-04-10T08:00:00.000Z')
      },
      {
        conversationId,
        role: 'assistant',
        content: 'Middle',
        timestamp: new Date('2026-04-10T09:00:00.000Z')
      },
      {
        conversationId,
        role: 'user',
        content: 'Newest',
        timestamp: new Date('2026-04-10T10:00:00.000Z')
      }
    ]);

    const firstPageResponse = await listMessages(
      new Request('http://localhost/api/team-inbox/1/messages?paginated=1&limit=2'),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );
    const firstPage = await firstPageResponse.json() as {
      messages: Array<{ content: string }>;
      hasMore: boolean;
      nextCursor: string | null;
    };

    expect(firstPageResponse.status).toBe(200);
    expect(firstPage.messages.map((message) => message.content)).toEqual(['Middle', 'Newest']);
    expect(firstPage.hasMore).toBe(true);
    expect(typeof firstPage.nextCursor).toBe('string');

    const secondPageResponse = await listMessages(
      new Request(`http://localhost/api/team-inbox/1/messages?paginated=1&limit=2&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );
    const secondPage = await secondPageResponse.json() as {
      messages: Array<{ content: string }>;
      hasMore: boolean;
      nextCursor: string | null;
    };

    expect(secondPageResponse.status).toBe(200);
    expect(secondPage.messages.map((message) => message.content)).toEqual(['Oldest']);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toBeNull();
  }, 60000);

  it('deduplicates paginated history rows that share the same provider message id across merged sibling conversations', async () => {
    await seedInbox();

    const siblingConversationId = new mongoose.Types.ObjectId();

    await ConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          contactId: '15550001111@lid',
          contactPhone: '15550001111',
          metadata: { messagingChatId: '15550001111@lid' }
        }
      }
    ).exec();

    await ConversationModel.create({
      _id: siblingConversationId,
      agencyId,
      tenantId,
      contactId: '15550001111@c.us',
      contactName: 'Alice Smith',
      contactPhone: '15550001111',
      status: 'open',
      unreadCount: 0,
      lastMessageContent: 'Duplicate source',
      lastMessageAt: new Date('2026-04-12T12:00:02.000Z'),
      metadata: { messagingChatId: '15550001111@c.us' }
    });

    await MessageModel.deleteMany({
      conversationId: { $in: [conversationId, siblingConversationId] }
    }).exec();

    await MessageModel.create([
      {
        conversationId,
        role: 'user',
        content: 'Duplicate source',
        providerMessageId: 'dup-provider-1',
        timestamp: new Date('2026-04-12T12:00:01.000Z')
      },
      {
        conversationId: siblingConversationId,
        role: 'user',
        content: 'Duplicate source',
        providerMessageId: 'dup-provider-1',
        timestamp: new Date('2026-04-12T12:00:02.000Z')
      }
    ]);

    const response = await listMessages(
      new Request('http://localhost/api/team-inbox/1/messages?paginated=1&limit=20&syncPages=1'),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );
    const payload = await response.json() as {
      messages: Array<{ _id: string; providerMessageId: string | null }>;
      hasMore: boolean;
      nextCursor: string | null;
    };

    expect(response.status).toBe(200);
    const duplicatedProviderRows = payload.messages.filter((message) => message.providerMessageId === 'dup-provider-1');
    expect(duplicatedProviderRows).toHaveLength(1);
  }, 60000);

  it('recovers newest inbound messages from workflow-engine when paginated local history is already dense', async () => {
    await seedInbox();

    await MessageModel.deleteMany({ conversationId }).exec();
    await MessageModel.create(
      Array.from({ length: 20 }, (_, index) => ({
        conversationId,
        role: 'user' as const,
        content: `Local message ${index + 1}`,
        providerMessageId: `local-provider-${index + 1}`,
        timestamp: new Date(Date.UTC(2026, 3, 12, 9, index + 1, 0))
      }))
    );

    await ConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          lastMessageContent: 'Remote inbound newest',
          lastMessageAt: new Date('2026-04-12T10:41:00.000Z'),
          metadata: {
            engineConversationId: 'engine-chat-1',
            messagingChatId: '15550001111@c.us',
            workflowEngineSummaryUpdatedAt: '2026-04-12T10:41:00.000Z'
          }
        }
      }
    ).exec();

    process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL = 'http://workflow-engine.internal';
    process.env.WORKFLOW_ENGINE_INTERNAL_PSK = 'internal-psk';

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/v1/internal/inbox/sync')) {
        return new Response(JSON.stringify({
          syncedConversations: 1,
          syncedMessages: 1,
          sessionName: 'tenant-main'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/v1/inbox/conversations/engine-chat-1/messages?')) {
        return new Response(JSON.stringify({
          messages: [
            {
              id: 'remote-inbound-1',
              fromMe: false,
              body: 'Remote inbound newest',
              timestamp: 1775990460,
              ack: 2,
              ackName: 'DEVICE',
              hasMedia: false,
              media: null
            }
          ],
          hasMore: false
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unhandled request: ${url}` }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const response = await listMessages(
      new Request('http://localhost/api/team-inbox/1/messages?paginated=1&limit=20&syncPages=4'),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );
    const payload = await response.json() as {
      messages: Array<{ content: string }>;
      hasMore: boolean;
      nextCursor: string | null;
    };

    expect(response.status).toBe(200);
    expect(payload.messages.some((message) => message.content === 'Remote inbound newest')).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/v1/inbox/conversations/engine-chat-1/messages?'))
    ).toBe(true);
  }, 60000);

  it('does not merge sibling @lid history when chats only match by display name', async () => {
    await seedInbox();

    const siblingConversationId = new mongoose.Types.ObjectId();

    await ConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          contactId: '50805738631354@lid',
          contactName: 'Salmen Khelifi',
          contactPhone: '50805738631354'
        }
      }
    ).exec();

    await ConversationModel.create({
      _id: siblingConversationId,
      agencyId,
      tenantId,
      contactId: '92681787166746@lid',
      contactName: 'Salmen Khelifi',
      contactPhone: '92681787166746',
      status: 'open',
      unreadCount: 0,
      lastMessageContent: 'older message from sibling lid',
      lastMessageAt: new Date('2026-04-12T12:00:00.000Z')
    });

    await MessageModel.create({
      conversationId: siblingConversationId,
      role: 'user',
      content: 'older message from sibling lid',
      timestamp: new Date('2026-04-12T12:00:00.000Z')
    });

    const response = await listMessages(
      new Request('http://localhost/api/team-inbox/1/messages?paginated=1&limit=50&syncPages=1'),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    const payload = await response.json() as {
      messages: Array<{ content: string }>;
    };
    expect(response.status).toBe(200);
    expect(payload.messages.some((message) => message.content === 'older message from sibling lid')).toBe(false);
  }, 60000);

  it('recovers and merges old messages across MessagingProvider @lid and @c.us chat identities', async () => {
    await seedInbox();

    // Guardrail: dashboard must not call MessagingProvider directly; all MessagingProvider access should be via workflow-engine.
    process.env.MessagingProvider_BASE_URL = 'http://messaging.test';
    process.env.MessagingProvider_API_KEY = 'messaging-test-key';

    await ConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          contactId: '15550001111@lid',
          metadata: { messagingChatId: '15550001111@lid' }
        }
      }
    ).exec();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/v1/sessions/by-tenant?')) {
        return new Response(JSON.stringify({
          id: '67ab1234567890abcdef9999',
          name: 'dev-agency-whatsapp'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/api/v1/chats?')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/v1/inbox/chats?')) {
        return new Response(JSON.stringify({
          chats: [],
          total: 0,
          hasMore: false
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/chats/15550001111%40lid/messages')) {
        return new Response(JSON.stringify([
          {
            id: 'msg-lid-latest',
            fromMe: false,
            body: 'Latest from lid',
            messageTimestamp: 1713027600,
            ack: 2,
            ackName: 'DEVICE',
            hasMedia: false
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/contacts/15550001111%40lid')) {
        return new Response(JSON.stringify({
          id: '15550001111@c.us',
          number: '15550001111'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/chats/15550001111%40c.us/messages')) {
        return new Response(JSON.stringify([
          {
            id: 'msg-cus-older',
            fromMe: false,
            body: 'Older from c.us',
            messageTimestamp: 1713006000,
            ack: 3,
            ackName: 'READ',
            hasMedia: false
          },
          {
            id: 'msg-lid-latest',
            fromMe: false,
            body: 'Latest from lid',
            messageTimestamp: 1713027600,
            ack: 2,
            ackName: 'DEVICE',
            hasMedia: false
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Unhandled request in test' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const response1 = await listMessages(
      new Request('http://localhost/api/team-inbox/1/messages?paginated=1&limit=50&syncPages=4'),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );
    expect(response1.status).toBe(200);

    // Backfill fires asynchronously when the thread is sparse; wait and poll again to see the recovered messages
    await new Promise((resolve) => setTimeout(resolve, 50));

    const response = await listMessages(
      new Request('http://localhost/api/team-inbox/1/messages?paginated=1&limit=50&syncPages=4'),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    const payload = await response.json() as {
      messages: Array<{ content: string }>;
      hasMore: boolean;
      nextCursor: string | null;
    };

    expect(response.status).toBe(200);
    expect(payload.messages.some((message) => message.content === 'Older from c.us')).toBe(true);
    expect(payload.messages.some((message) => message.content === 'Latest from lid')).toBe(true);
    expect(payload.messages.length).toBeGreaterThan(1);
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).startsWith('http://messaging.test/'))
    ).toBe(false);
  }, 60000);

  it('does not fail when recovered media messages are missing mimetype metadata', async () => {
    await seedInbox();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/v1/chats?')) {
        return new Response(JSON.stringify([
          {
            id: 'engine-chat-1',
            contactId: '15550001111',
            contactName: 'Alice Smith',
            lastMessage: 'remote media message',
            updatedAt: '2026-04-17T12:00:00.000Z'
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/v1/inbox/conversations/engine-chat-1/messages?')) {
        return new Response(JSON.stringify({
          messages: [
            {
              id: 'remote-media-1',
              fromMe: false,
              body: 'remote media message',
              timestamp: 1713355200,
              ack: 2,
              ackName: 'DEVICE',
              hasMedia: true,
              media: {
                url: 'https://cdn.example.com/photo.jpg',
                filename: 'photo.jpg'
              }
            }
          ],
          hasMore: false
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/v1/internal/inbox/sync')) {
        return new Response(JSON.stringify({
          syncedConversations: 1,
          syncedMessages: 1,
          sessionName: 'tenant-main'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Unhandled request in test' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const response = await listMessages(
      new Request('http://localhost/api/team-inbox/1/messages?paginated=1&limit=20&syncPages=4'),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      messages: Array<{ content: string }>;
    };
    expect(payload.messages.some((message) => message.content === 'remote media message')).toBe(true);
  }, 60000);

  it('does not hydrate history from sibling @lid MessagingProvider chat ids when only display name matches', async () => {
    await seedInbox();

    const siblingConversationId = new mongoose.Types.ObjectId();

    await ConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          contactId: '50805738631354@lid',
          contactName: 'Salmen Khelifi',
          contactPhone: '50805738631354'
        }
      }
    ).exec();

    await ConversationModel.create({
      _id: siblingConversationId,
      agencyId,
      tenantId,
      contactId: '92681787166746@lid',
      contactName: 'Salmen Khelifi',
      contactPhone: '92681787166746',
      status: 'open',
      unreadCount: 0,
      lastMessageContent: 'older sibling preview',
      lastMessageAt: new Date('2026-04-12T12:00:00.000Z')
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/v1/sessions/by-tenant?')) {
        return new Response(JSON.stringify({
          id: '67ab1234567890abcdef9999',
          name: 'dev-agency-whatsapp'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/api/v1/chats?')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/v1/inbox/chats?')) {
        return new Response(JSON.stringify({
          chats: [],
          total: 0,
          hasMore: false
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/chats/50805738631354%40lid/messages')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/contacts/50805738631354%40lid')) {
        return new Response(JSON.stringify({
          id: '50805738631354@lid',
          number: '50805738631354'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/chats/92681787166746%40lid/messages')) {
        return new Response(JSON.stringify([
          {
            id: 'msg-sibling-lid-older',
            fromMe: false,
            body: 'older from sibling lid chat',
            messageTimestamp: 1713006000,
            ack: 3,
            ackName: 'READ',
            hasMedia: false
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Unhandled request in test' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const response1 = await listMessages(
      new Request('http://localhost/api/team-inbox/1/messages?paginated=1&limit=50&syncPages=4'),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );
    expect(response1.status).toBe(200);

    // Backfill fires asynchronously when the thread is sparse; wait and poll again to see the recovered messages
    await new Promise((resolve) => setTimeout(resolve, 50));

    const response = await listMessages(
      new Request('http://localhost/api/team-inbox/1/messages?paginated=1&limit=50&syncPages=4'),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    const payload = await response.json() as {
      messages: Array<{ content: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.messages.some((message) => message.content === 'older from sibling lid chat')).toBe(false);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/chats/92681787166746%40lid/messages')
      )
    ).toBe(false);
  }, 60000);

  it('hydrates selected chat history from direct MessagingProvider when engine inbox route is sparse', async () => {
    await seedInbox();

    await ConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          contactId: '50805738631354@lid',
          contactName: 'Salmen Khelifi',
          contactPhone: '50805738631354',
          metadata: { engineConversationId: '69e203df7ad948c8ddbeddfa' }
        }
      }
    ).exec();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/v1/sessions/by-tenant?')) {
        return new Response(JSON.stringify({ id: 'dev-agency-whatsapp' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/v1/inbox/conversations/69e203df7ad948c8ddbeddfa/messages?')) {
        return new Response(JSON.stringify({
          messages: [
            {
              id: 'true_50805738631354@lid_existing_hi',
              fromMe: true,
              body: 'hi',
              timestamp: 1776431861,
              ack: 0,
              ackName: 'PENDING',
              hasMedia: false,
              media: null
            }
          ],
          hasMore: false
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/api/v1/dev-agency-whatsapp/chats/50805738631354%40lid/messages?')) {
        return new Response(JSON.stringify([
          {
            id: 'true_50805738631354@lid_existing_hi',
            fromMe: true,
            body: 'hi',
            messageTimestamp: 1776431861,
            ack: 2,
            ackName: 'DEVICE',
            hasMedia: false
          },
          {
            id: 'false_50805738631354@lid_old_test',
            fromMe: false,
            body: 'Test',
            messageTimestamp: 1776419843,
            ack: 1,
            ackName: 'SERVER',
            hasMedia: false
          },
          {
            id: 'false_50805738631354@lid_old_hi',
            fromMe: false,
            body: 'Hi',
            messageTimestamp: 1776419821,
            ack: 1,
            ackName: 'SERVER',
            hasMedia: false
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/api/v1/messages?session=dev-agency-whatsapp&chatId=50805738631354%40lid')) {
        return new Response(JSON.stringify([
          {
            id: 'true_50805738631354@lid_existing_hi',
            fromMe: true,
            body: 'hi',
            messageTimestamp: 1776431861,
            ack: 2,
            ackName: 'DEVICE',
            hasMedia: false
          },
          {
            id: 'false_50805738631354@lid_old_test',
            fromMe: false,
            body: 'Test',
            messageTimestamp: 1776419843,
            ack: 1,
            ackName: 'SERVER',
            hasMedia: false
          },
          {
            id: 'false_50805738631354@lid_old_hi',
            fromMe: false,
            body: 'Hi',
            messageTimestamp: 1776419821,
            ack: 1,
            ackName: 'SERVER',
            hasMedia: false
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Unhandled request in test' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const response = await listMessages(
      new Request('http://localhost/api/team-inbox/1/messages?paginated=1&limit=50&syncPages=4'),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    const payload = await response.json() as {
      messages: Array<{ content: string }>;
    };

    expect(response.status).toBe(200);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/v1/inbox/conversations/69e203df7ad948c8ddbeddfa/messages?')
      )
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/api/v1/dev-agency-whatsapp/chats/50805738631354%40lid/messages?')
      )
    ).toBe(true);
    expect(payload.messages.some((message) => message.content === 'Test')).toBe(true);
    expect(payload.messages.some((message) => message.content === 'Hi')).toBe(true);
  }, 60000);

  it('loads older pages from direct MessagingProvider history so cursor pagination can continue past the latest 20 messages', async () => {
    await seedInbox();

    await ConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          contactId: '50805738631354@lid',
          contactName: 'Salmen Khelifi',
          contactPhone: '50805738631354',
          metadata: { engineConversationId: '69e203df7ad948c8ddbeddfa' }
        }
      }
    ).exec();

    const buildDirectPage = (prefix: 'latest' | 'older', start: number, count: number, baseTimestamp: number) =>
      Array.from({ length: count }, (_, index) => {
        const position = start + index;
        return {
          id: `${prefix}-${position}`,
          fromMe: false,
          body: prefix === 'latest' ? `Latest ${position}` : `Older ${position}`,
          messageTimestamp: baseTimestamp - index,
          ack: 2,
          ackName: 'DEVICE',
          hasMedia: false
        };
      });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/v1/sessions/by-tenant?')) {
        return new Response(JSON.stringify({ id: 'dev-agency-whatsapp' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/v1/inbox/conversations/69e203df7ad948c8ddbeddfa/messages?')) {
        return new Response(JSON.stringify({
          messages: [
            {
              id: 'engine-latest-only',
              fromMe: true,
              body: 'Latest from engine only',
              timestamp: 1776431900,
              ack: 0,
              ackName: 'PENDING',
              hasMedia: false,
              media: null
            }
          ],
          hasMore: false
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/api/v1/dev-agency-whatsapp/chats/50805738631354%40lid/messages?')) {
        const parsedUrl = new URL(url);
        const offset = Number(parsedUrl.searchParams.get('offset') ?? '0');

        if (offset === 0) {
          return new Response(JSON.stringify({
            messages: buildDirectPage('latest', 1, 20, 1776431860)
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (offset === 20) {
          return new Response(JSON.stringify({
            messages: buildDirectPage('older', 21, 20, 1776431800)
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/api/v1/messages?session=dev-agency-whatsapp&chatId=50805738631354%40lid')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Unhandled request in test' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const firstResponse = await listMessages(
      new Request('http://localhost/api/team-inbox/1/messages?paginated=1&limit=20&syncPages=4'),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    expect(firstResponse.status).toBe(200);
    const firstPayload = await firstResponse.json() as {
      messages: Array<{ content: string }>;
      hasMore: boolean;
      nextCursor: string | null;
    };

    expect(firstPayload.messages).toHaveLength(20);
    expect(firstPayload.hasMore).toBe(true);
    expect(firstPayload.nextCursor).toBeTruthy();

    const secondResponse = await listMessages(
      new Request(`http://localhost/api/team-inbox/1/messages?paginated=1&limit=20&cursor=${encodeURIComponent(firstPayload.nextCursor ?? '')}&syncPages=4`),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    expect(secondResponse.status).toBe(200);
    const secondPayload = await secondResponse.json() as {
      messages: Array<{ content: string }>;
      hasMore: boolean;
      nextCursor: string | null;
    };
    expect(secondPayload.messages.some((message) => message.content === 'Older 21')).toBe(true);

    expect(
      fetchMock.mock.calls.some(([input]) => {
        const value = String(input);
        return value.includes('/api/v1/dev-agency-whatsapp/chats/50805738631354%40lid/messages?')
          && value.includes('offset=20');
      })
    ).toBe(true);
  }, 60000);

  it('recovers sparse cursor pages from direct MessagingProvider history when older local pages are incomplete', async () => {
    await seedInbox();

    await ConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          contactId: '50805738631354@lid',
          contactName: 'Salmen Khelifi',
          contactPhone: '50805738631354',
          metadata: { engineConversationId: '69e203df7ad948c8ddbeddfa' }
        }
      }
    ).exec();

    await MessageModel.deleteMany({ conversationId }).exec();

    const baseTimestamp = 1776431860 * 1000;
    await MessageModel.create([
      ...Array.from({ length: 20 }, (_, index) => ({
        conversationId,
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `Persisted latest ${index + 1}`,
        providerMessageId: `latest-${index + 1}`,
        timestamp: new Date(baseTimestamp - index * 1_000)
      })),
      {
        conversationId,
        role: 'user',
        content: 'Persisted sparse oldest',
        providerMessageId: 'persisted-oldest-1',
        timestamp: new Date(baseTimestamp - 25 * 1_000)
      }
    ]);

    const buildDirectPage = (prefix: 'latest' | 'older', start: number, count: number, pageTimestamp: number) =>
      Array.from({ length: count }, (_, index) => {
        const position = start + index;
        return {
          id: `${prefix}-${position}`,
          fromMe: false,
          body: prefix === 'latest' ? `Latest ${position}` : `Recovered older ${position}`,
          messageTimestamp: pageTimestamp - index,
          ack: 2,
          ackName: 'DEVICE',
          hasMedia: false
        };
      });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/v1/sessions/by-tenant?')) {
        return new Response(JSON.stringify({ id: 'dev-agency-whatsapp' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/v1/inbox/conversations/69e203df7ad948c8ddbeddfa/messages?')) {
        return new Response(JSON.stringify({
          messages: [
            {
              id: 'engine-latest-only',
              fromMe: true,
              body: 'Latest from engine only',
              timestamp: 1776431900,
              ack: 0,
              ackName: 'PENDING',
              hasMedia: false,
              media: null
            }
          ],
          hasMore: false
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/api/v1/dev-agency-whatsapp/chats/50805738631354%40lid/messages?')) {
        const parsedUrl = new URL(url);
        const offset = Number(parsedUrl.searchParams.get('offset') ?? '0');

        if (offset === 0) {
          return new Response(JSON.stringify({
            messages: buildDirectPage('latest', 1, 20, 1776431860)
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (offset === 20) {
          return new Response(JSON.stringify({
            messages: buildDirectPage('older', 21, 20, 1776431800)
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/api/v1/messages?session=dev-agency-whatsapp&chatId=50805738631354%40lid')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Unhandled request in test' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const firstResponse = await listMessages(
      new Request('http://localhost/api/team-inbox/1/messages?paginated=1&limit=20&syncPages=4'),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    expect(firstResponse.status).toBe(200);
    const firstPayload = await firstResponse.json() as {
      messages: Array<{ content: string }>;
      hasMore: boolean;
      nextCursor: string | null;
    };

    expect(firstPayload.messages).toHaveLength(20);
    expect(firstPayload.hasMore).toBe(true);
    expect(firstPayload.nextCursor).toBeTruthy();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('offset=20'))).toBe(false);

    const secondResponse = await listMessages(
      new Request(`http://localhost/api/team-inbox/1/messages?paginated=1&limit=20&cursor=${encodeURIComponent(firstPayload.nextCursor ?? '')}&syncPages=4`),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    expect(secondResponse.status).toBe(200);
    const secondPayload = await secondResponse.json() as {
      messages: Array<{ content: string }>;
      hasMore: boolean;
      nextCursor: string | null;
    };

    expect(secondPayload.messages.some((message) => message.content === 'Recovered older 21')).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const value = String(input);
        return value.includes('/api/v1/dev-agency-whatsapp/chats/50805738631354%40lid/messages?')
          && value.includes('offset=20');
      })
    ).toBe(true);
  }, 60000);

  it('delegates image attachment sends to workflow-engine without local message persistence', async () => {
    await seedInbox();

    process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL = 'http://workflow-engine.internal';
    process.env.WORKFLOW_ENGINE_INTERNAL_PSK = 'internal-psk';

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      _id: 'workflow-message-image-1',
      conversationId: conversationId.toString(),
      role: 'assistant',
      content: 'Look at this',
      createdAt: new Date('2026-04-12T10:00:00.000Z').toISOString(),
      messagingMessageId: 'wamid-image-1',
      deliveryStatus: 'sent',
      attachments: [
        {
          kind: 'image',
          url: 'https://cdn.example.com/photo.jpg',
          mimeType: 'image/jpeg',
          fileName: 'photo.jpg',
          caption: 'Look at this'
        }
      ]
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));

    vi.stubGlobal('fetch', fetchMock);

    const sendResponse = await sendMessage(
      new Request('http://localhost/api/team-inbox/1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: 'Look at this',
          attachments: [
            {
              kind: 'image',
              url: 'https://cdn.example.com/photo.jpg',
              mimeType: 'image/jpeg',
              fileName: 'photo.jpg',
              caption: 'Look at this'
            }
          ]
        })
      }),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    expect(sendResponse.status).toBe(200);
    expect(await MessageModel.countDocuments({ conversationId })).toBe(1);

    const firstCall = (fetchMock.mock.calls as any[]).find((call) =>
      String(call?.[0] ?? '').includes('/internal/inbox/conversations')
    );
    expect(firstCall).toBeTruthy();
    if (!firstCall) {
      throw new Error('Expected workflow-engine fetch call');
    }
    const [firstCallInput, firstCallInit] = firstCall as unknown as [RequestInfo | URL, RequestInit | undefined];
    const firstCallUrl = String(firstCallInput ?? '');
    expect(firstCallUrl).toContain('/internal/inbox/conversations');
    const init = (firstCallInit ?? {}) as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;

    expect(body).toMatchObject({
      agencyId: agencyId.toString(),
      tenantId: tenantId.toString(),
      operatorUserId: userId.toString(),
      content: 'Look at this',
      attachments: [
        {
          kind: 'image',
          url: 'https://cdn.example.com/photo.jpg',
          mimeType: 'image/jpeg',
          fileName: 'photo.jpg',
          caption: 'Look at this'
        }
      ]
    });
  }, 60000);

  it('handles empty successful MessagingProvider action responses without JSON parse errors', async () => {
    await seedInbox();

    const existingMessage = await MessageModel.findOne({ conversationId }).lean();
    if (!existingMessage) {
      throw new Error('Expected seeded message');
    }

    await MessageModel.updateOne(
      { _id: existingMessage._id },
      { $set: { providerMessageId: 'wamid-seeded-1' } }
    ).exec();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/v1/sessions/by-tenant?')) {
        return new Response(JSON.stringify({
          id: '67ab1234567890abcdef9999',
          name: 'dev-agency-whatsapp'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/api/v1/star')) {
        return new Response('', { status: 200 });
      }

      return new Response(JSON.stringify({ error: 'Unhandled request in test' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const response = await runMessageAction(
      new Request(`http://localhost/api/team-inbox/${conversationId.toString()}/messages/${existingMessage._id.toString()}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'star' })
      }),
      {
        params: Promise.resolve({
          conversationId: conversationId.toString(),
          messageId: existingMessage._id.toString()
        })
      }
    );

    const payload = await response.json() as { success: boolean; error?: { message: string } };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
  }, 60000);

  it('returns 404 when assigning a missing conversation', async () => {
    await seedInbox();

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Conversation not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    })));

    const response = await assignConversation(
      new Request('http://localhost/api/team-inbox/missing/assign', { method: 'POST' }),
      { params: Promise.resolve({ conversationId: new mongoose.Types.ObjectId().toString() }) }
    );

    expect(response.status).toBe(404);
  }, 60000);

  it('builds an entitlement-gated AI suggestion for a conversation', async () => {
    await seedInbox();

    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.OPENAI_MODEL = 'gpt-test-mini';

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/ai/inbox-context')) {
        return new Response(JSON.stringify({
          systemPrompt: 'Acme Main prompt',
          messages: [{ role: 'user', content: 'hello' }],
          metadata: { tenantId: 'tenant-1', workflowId: 'wf-1', conversationId: 'conv-1' },
          memoryFacts: []
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: 'Hi Alice Smith, this reply came from the provider.'
            }
          }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }));

    const response = await suggestReply(
      new Request('http://localhost/api/team-inbox/1/suggest-reply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'assist' })
      }),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    const payload = await response.json() as { suggestedReply: string; systemPrompt: string };

    expect(response.status).toBe(200);
    expect(payload.suggestedReply).toContain('Alice Smith');
    expect(payload.systemPrompt).toContain('helpful assistant');
  }, 60000);

  it('supports Anthropic provider selection for inbox replies', async () => {
    await seedInbox();

    process.env.LLM_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    process.env.ANTHROPIC_MODEL = 'claude-test-sonnet';

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/ai/inbox-context')) {
        return new Response(JSON.stringify({
          systemPrompt: 'Acme Main prompt',
          messages: [{ role: 'user', content: 'hello' }],
          metadata: { tenantId: 'tenant-1', workflowId: 'wf-1', conversationId: 'conv-1' },
          memoryFacts: []
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        content: [
          {
            type: 'text',
            text: 'Anthropic drafted this reply for Alice Smith.'
          }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const response = await suggestReply(
      new Request('http://localhost/api/team-inbox/1/suggest-reply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'assist' })
      }),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    const payload = await response.json() as { suggestedReply: string };

    expect(response.status).toBe(200);
    expect(payload.suggestedReply).toContain('Anthropic drafted this reply');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }, 60000);
});
