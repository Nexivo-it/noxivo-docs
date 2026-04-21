import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AgencyModel,
  AuthSessionModel,
  ContactProfileModel,
  ConversationModel,
  MessageModel,
  MessageDeliveryEventModel,
  MessagingClusterModel,
  MessagingSessionBindingModel,
  PluginInstallationModel,
  TenantModel,
  UserModel,
  WorkflowRunModel,
} from '@noxivo/database';
import { buildServer } from '../src/server.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb,
} from './helpers/mongo-memory.js';

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function createSessionCookie(input: {
  userId: mongoose.Types.ObjectId;
  agencyId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
}): Promise<string> {
  const token = `session-${new mongoose.Types.ObjectId().toString()}`;
  await AuthSessionModel.create({
    userId: input.userId,
    agencyId: input.agencyId,
    tenantId: input.tenantId,
    sessionTokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + 120_000),
    lastSeenAt: new Date(),
  });

  return `noxivo_session=${encodeURIComponent(token)}`;
}

async function seedInboxActor() {
  const agencyId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const clusterId = new mongoose.Types.ObjectId();
  const conversationId = new mongoose.Types.ObjectId();

  await AgencyModel.create({
    _id: agencyId,
    name: 'Inbox Agency',
    slug: `inbox-${agencyId.toString().slice(-6)}`,
    plan: 'enterprise',
    billingStripeCustomerId: null,
    billingStripeSubscriptionId: null,
    billingOwnerUserId: userId,
    whiteLabelDefaults: {
      customDomain: null,
      logoUrl: null,
      primaryColor: '#6366F1',
      supportEmail: 'ops@inbox.test',
      hidePlatformBranding: false,
    },
    usageLimits: { tenants: 5, activeSessions: 20 },
    status: 'active',
  });

  await TenantModel.create({
    _id: tenantId,
    agencyId,
    slug: `tenant-${tenantId.toString().slice(-6)}`,
    name: 'Inbox Tenant',
    region: 'us-east-1',
    status: 'active',
    billingMode: 'agency_pays',
    whiteLabelOverrides: {},
    effectiveBrandingCache: {},
  });

  await UserModel.create({
    _id: userId,
    agencyId,
    defaultTenantId: tenantId,
    tenantIds: [tenantId],
    email: 'operator@inbox.test',
    fullName: 'Inbox Operator',
    passwordHash: 'hash',
    role: 'agency_admin',
    status: 'active',
  });

  await MessagingClusterModel.create({
    _id: clusterId,
    name: 'Primary Messaging Cluster',
    region: 'eu-west-1',
    baseUrl: 'https://messaging.test',
    dashboardUrl: 'https://messaging.test/dashboard',
    swaggerUrl: 'https://messaging.test/docs',
    capacity: 10,
    activeSessionCount: 1,
    status: 'active',
    secretRefs: { webhookSecretVersion: 'v1' },
  });

  await MessagingSessionBindingModel.create({
    agencyId,
    tenantId,
    clusterId,
    sessionName: 'tenant-main',
    messagingSessionName: 'tenant-main',
    status: 'active',
    routingMetadata: {},
  });

  await ConversationModel.create({
    _id: conversationId,
    agencyId,
    tenantId,
    contactId: '15550001111@c.us',
    contactName: 'Alice Smith',
    contactPhone: '+15550001111',
    status: 'open',
    unreadCount: 2,
    lastMessageContent: 'Hello from customer',
    lastMessageAt: new Date('2026-01-01T10:00:00.000Z'),
    metadata: {
      messagingChatId: '15550001111@c.us',
    },
  });

  await MessageModel.create({
    conversationId,
    role: 'user',
    content: 'Hello from customer',
    timestamp: new Date('2026-01-01T10:00:00.000Z'),
    metadata: { source: 'messaging.webhook' },
  });

  return {
    agencyId,
    tenantId,
    userId,
    conversationId,
  };
}

describe('team inbox module routes on workflow-engine', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-workflow-engine-team-inbox-routes-tests' });
    await Promise.all([
      AgencyModel.init(),
      TenantModel.init(),
      UserModel.init(),
      AuthSessionModel.init(),
      ConversationModel.init(),
      MessageModel.init(),
      ContactProfileModel.init(),
      MessageDeliveryEventModel.init(),
      PluginInstallationModel.init(),
      WorkflowRunModel.init(),
    ]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.MESSAGING_PROVIDER_API_KEY;
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('supports listing, assignment/read/archive actions, lead state, and messages routes from workflow-engine ownership', async () => {
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';
    const seeded = await seedInboxActor();
    const cookie = await createSessionCookie({
      userId: seeded.userId,
      agencyId: seeded.agencyId,
      tenantId: seeded.tenantId,
    });

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'wamid-send-1' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const listResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/team-inbox?query=alice',
        headers: { cookie },
      });

      expect(listResponse.statusCode).toBe(200);
      const listPayload = listResponse.json() as Array<{ _id: string; contactName: string | null }>;
      expect(listPayload).toHaveLength(1);
      expect(listPayload[0]).toEqual(
        expect.objectContaining({
          _id: seeded.conversationId.toString(),
          contactName: 'Alice Smith',
        }),
      );

      const assignResponse = await server.inject({
        method: 'POST',
        url: `/api/v1/team-inbox/${seeded.conversationId.toString()}/assign`,
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: { assignedTo: seeded.userId.toString() },
      });
      expect(assignResponse.statusCode).toBe(200);

      const readResponse = await server.inject({
        method: 'POST',
        url: `/api/v1/team-inbox/${seeded.conversationId.toString()}/read`,
        headers: { cookie },
      });
      expect(readResponse.statusCode).toBe(200);

      const archiveResponse = await server.inject({
        method: 'POST',
        url: `/api/v1/team-inbox/${seeded.conversationId.toString()}/actions`,
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: { action: 'archive' },
      });
      expect(archiveResponse.statusCode).toBe(200);
      expect(archiveResponse.json()).toEqual(expect.objectContaining({ success: true, isArchived: true }));

      const archivedListResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/team-inbox?status=archived',
        headers: { cookie },
      });
      expect(archivedListResponse.statusCode).toBe(200);
      const archivedPayload = archivedListResponse.json() as Array<{ _id: string }>;
      expect(archivedPayload.map((item) => item._id)).toEqual([seeded.conversationId.toString()]);

      const createLeadResponse = await server.inject({
        method: 'POST',
        url: `/api/v1/team-inbox/${seeded.conversationId.toString()}/lead`,
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: { note: 'Hot lead' },
      });
      expect(createLeadResponse.statusCode).toBe(200);

      const leadStateResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/team-inbox/${seeded.conversationId.toString()}/lead`,
        headers: { cookie },
      });
      expect(leadStateResponse.statusCode).toBe(200);
      expect(leadStateResponse.json()).toEqual(expect.objectContaining({ leadSaved: true }));

      const leadsResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/team-inbox/leads',
        headers: { cookie },
      });
      expect(leadsResponse.statusCode).toBe(200);
      const leadsPayload = leadsResponse.json() as Array<{ conversationId: string }>;
      expect(leadsPayload.some((lead) => lead.conversationId === seeded.conversationId.toString())).toBe(true);

      const listMessagesResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/team-inbox/${seeded.conversationId.toString()}/messages`,
        headers: { cookie },
      });
      expect(listMessagesResponse.statusCode).toBe(200);
      const messagesPayload = listMessagesResponse.json() as { messages: Array<{ content: string }>; hasMore: boolean };
      expect(messagesPayload.messages.map((message) => message.content)).toContain('Hello from customer');
      expect(messagesPayload.hasMore).toBe(false);

      const sendMessageResponse = await server.inject({
        method: 'POST',
        url: `/api/v1/team-inbox/${seeded.conversationId.toString()}/messages`,
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          content: 'Operator reply from workflow-engine',
          attachments: [],
        },
      });
      expect(sendMessageResponse.statusCode).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const firstMessage = await MessageModel.findOne({ conversationId: seeded.conversationId }).sort({ timestamp: 1, _id: 1 }).lean();
      expect(firstMessage).toBeTruthy();
      if (!firstMessage) {
        throw new Error('Expected seeded message');
      }

      const messageActionResponse = await server.inject({
        method: 'POST',
        url: `/api/v1/team-inbox/${seeded.conversationId.toString()}/messages/${firstMessage._id.toString()}/actions`,
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          action: 'delete',
        },
      });
      expect(messageActionResponse.statusCode).toBe(200);

      const deletedMessage = await MessageModel.findById(firstMessage._id).lean().exec();
      expect(deletedMessage?.deliveryStatus).toBe('revoked');
    } finally {
      await server.close();
    }
  });

  it('serves team inbox event stream endpoint from workflow-engine', async () => {
    const seeded = await seedInboxActor();
    const cookie = await createSessionCookie({
      userId: seeded.userId,
      agencyId: seeded.agencyId,
      tenantId: seeded.tenantId,
    });
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/team-inbox/events',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.body).toContain('connected');
    } finally {
      await server.close();
    }
  });

  it('supports remaining parity routes (stats/plugins/billing/unhandoff/suggest-reply/message-single/delivery-history/crm)', async () => {
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';
    const seeded = await seedInboxActor();
    const cookie = await createSessionCookie({
      userId: seeded.userId,
      agencyId: seeded.agencyId,
      tenantId: seeded.tenantId,
    });

    const handoffConversationId = new mongoose.Types.ObjectId();
    const handoffMessageId = new mongoose.Types.ObjectId();
    await ConversationModel.create({
      _id: handoffConversationId,
      agencyId: seeded.agencyId,
      tenantId: seeded.tenantId,
      contactId: '15550007777@c.us',
      contactName: 'Escalated Contact',
      contactPhone: '+15550007777',
      status: 'handoff',
      unreadCount: 0,
      lastMessageContent: 'Need an agent',
      lastMessageAt: new Date('2026-01-01T10:03:00.000Z'),
    });
    await MessageModel.create({
      _id: handoffMessageId,
      conversationId: handoffConversationId,
      role: 'assistant',
      content: 'We can help with that',
      timestamp: new Date('2026-01-01T10:03:00.000Z'),
      attachments: [],
    });

    await WorkflowRunModel.create({
      workflowRunId: `run-${new mongoose.Types.ObjectId().toString()}`,
      workflowDefinitionId: new mongoose.Types.ObjectId().toString(),
      conversationId: seeded.conversationId.toString(),
      agencyId: seeded.agencyId.toString(),
      tenantId: seeded.tenantId.toString(),
      status: 'running',
      currentNodeId: 'node-1',
      contextPatch: {},
      startedAt: new Date('2026-01-01T10:00:00.000Z'),
    });

    await PluginInstallationModel.create({
      agencyId: seeded.agencyId,
      tenantId: seeded.tenantId,
      pluginId: 'crm-hubspot',
      pluginVersion: '1.0.0',
      enabled: true,
      config: { provider: 'hubspot' },
    });

    const seededConversationMessage = await MessageModel.findOne({ conversationId: seeded.conversationId }).lean().exec();
    expect(seededConversationMessage).toBeTruthy();
    if (!seededConversationMessage) {
      throw new Error('Expected seeded message for delivery history route');
    }

    await MessageDeliveryEventModel.create({
      agencyId: seeded.agencyId,
      tenantId: seeded.tenantId,
      conversationId: seeded.conversationId,
      messageId: seededConversationMessage._id.toString(),
      deliveryStatus: 'delivered',
      providerAck: 2,
      providerAckName: 'DEVICE',
      source: 'webhook_ack',
      occurredAt: new Date('2026-01-01T10:01:00.000Z'),
    });

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'wamid-resend-1' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const statsResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/team-inbox/stats',
        headers: { cookie },
      });
      expect(statsResponse.statusCode).toBe(200);
      expect(statsResponse.json()).toEqual(
        expect.objectContaining({
          activeSessions: 1,
          activeWorkflows: 1,
        }),
      );

      const pluginsResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/team-inbox/plugins',
        headers: { cookie },
      });
      expect(pluginsResponse.statusCode).toBe(200);
      const pluginsPayload = pluginsResponse.json() as Array<{ pluginId: string; enabled: boolean }>;
      expect(pluginsPayload).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ pluginId: 'crm-hubspot', enabled: true }),
        ]),
      );

      const upsertPluginResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/team-inbox/plugins',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          pluginId: 'crm-hubspot',
          pluginVersion: '1.0.1',
          enabled: false,
          config: { provider: 'hubspot', region: 'eu' },
        },
      });
      expect(upsertPluginResponse.statusCode).toBe(200);
      expect(upsertPluginResponse.json()).toEqual(
        expect.objectContaining({
          pluginId: 'crm-hubspot',
          pluginVersion: '1.0.1',
          enabled: false,
        }),
      );

      const billingResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/team-inbox/billing',
        headers: { cookie },
      });
      expect(billingResponse.statusCode).toBe(200);
      expect(billingResponse.json()).toEqual(
        expect.objectContaining({
          agencyId: seeded.agencyId.toString(),
          plan: 'enterprise',
          features: expect.objectContaining({
            advancedWorkflows: true,
          }),
        }),
      );

      const unhandoffResponse = await server.inject({
        method: 'POST',
        url: `/api/v1/team-inbox/${handoffConversationId.toString()}/unhandoff`,
        headers: { cookie },
      });
      expect(unhandoffResponse.statusCode).toBe(200);
      expect(unhandoffResponse.json()).toEqual(
        expect.objectContaining({
          conversationId: handoffConversationId.toString(),
          status: 'open',
        }),
      );

      const suggestResponse = await server.inject({
        method: 'POST',
        url: `/api/v1/team-inbox/${seeded.conversationId.toString()}/suggest-reply`,
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          mode: 'assist',
        },
      });
      expect(suggestResponse.statusCode).toBe(200);
      expect(suggestResponse.json()).toEqual(
        expect.objectContaining({
          reply: expect.any(String),
          mode: 'assist',
        }),
      );

      const resendResponse = await server.inject({
        method: 'POST',
        url: `/api/v1/team-inbox/${handoffConversationId.toString()}/messages/${handoffMessageId.toString()}`,
        headers: { cookie },
      });
      expect(resendResponse.statusCode).toBe(200);
      expect(resendResponse.json()).toEqual(
        expect.objectContaining({
          messageId: handoffMessageId.toString(),
        }),
      );

      const deliveryHistoryResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/team-inbox/${seeded.conversationId.toString()}/delivery-history`,
        headers: { cookie },
      });
      expect(deliveryHistoryResponse.statusCode).toBe(200);
      expect(deliveryHistoryResponse.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            messageId: seededConversationMessage._id.toString(),
            deliveryStatus: 'delivered',
          }),
        ]),
      );

      const crmGetResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/team-inbox/${seeded.conversationId.toString()}/crm`,
        headers: { cookie },
      });
      expect(crmGetResponse.statusCode).toBe(200);
      expect(crmGetResponse.json()).toEqual(
        expect.objectContaining({
          conversationId: seeded.conversationId.toString(),
        }),
      );

      const crmPatchResponse = await server.inject({
        method: 'PATCH',
        url: `/api/v1/team-inbox/${seeded.conversationId.toString()}/crm`,
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          action: 'update_profile',
          tags: [{ label: 'vip' }],
        },
      });
      expect(crmPatchResponse.statusCode).toBe(200);
      expect(crmPatchResponse.json()).toEqual(
        expect.objectContaining({
          crmTags: expect.arrayContaining([
            expect.objectContaining({ label: 'vip' }),
          ]),
        }),
      );
    } finally {
      await server.close();
    }
  });
});
