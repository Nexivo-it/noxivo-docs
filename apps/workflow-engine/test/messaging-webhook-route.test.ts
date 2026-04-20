import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import {
  ConversationModel,
  MessageDeliveryEventModel,
  MessageModel,
  MessagingClusterModel,
  MessagingSessionBindingModel
} from '@noxivo/database';
import { buildServer } from '../src/server.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('messaging webhook route', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-messaging-webhook-route-tests' });
  });

  afterEach(async () => {
    delete process.env.MESSAGING_PROVIDER_WEBHOOK_SECRET;
    delete process.env.MESSAGING_PROVIDER_BASE_URL;
    delete process.env.MESSAGING_PROVIDER_API_KEY;
    vi.restoreAllMocks();
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  async function seedBinding() {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const clusterId = new mongoose.Types.ObjectId();

    await MessagingClusterModel.create({
      _id: clusterId,
      name: 'Primary MessagingProvider Cluster',
      region: 'eu-west-1',
      baseUrl: 'http://messaging.test',
      dashboardUrl: 'http://messaging.test/dashboard',
      swaggerUrl: 'http://messaging.test/docs',
      capacity: 10,
      activeSessionCount: 1,
      status: 'active',
      secretRefs: { webhookSecretVersion: 'v1' }
    });

    await MessagingSessionBindingModel.create({
      agencyId,
      tenantId,
      clusterId,
      sessionName: 'tenant-main',
      messagingSessionName: 'tenant-main',
      routingMetadata: {},
      status: 'active'
    });

    return {
      agencyId: agencyId.toString(),
      tenantId: tenantId.toString()
    };
  }

  it('persists inbound media messages through the webhook HTTP route', async () => {
    await seedBinding();
    process.env.MESSAGING_PROVIDER_WEBHOOK_SECRET = 'webhook-secret';
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/webhooks/messaging',
        headers: {
          'x-messaging-webhook-secret': 'webhook-secret'
        },
        payload: {
          event: 'message',
          session: 'tenant-main',
          payload: {
            id: 'wamid-webhook-media-1',
            from: '15550001111@c.us',
            to: '15550002222@c.us',
            fromMe: false,
            body: 'See this photo',
            hasMedia: true,
            media: {
              url: 'https://messaging.local/files/photo.jpg',
              mimetype: 'image/jpeg',
              filename: 'photo.jpg'
            },
            ack: 0,
            ackName: 'PENDING'
          }
        }
      });

      expect(response.statusCode).toBe(202);
      const message = await MessageModel.findOne({ providerMessageId: 'wamid-webhook-media-1' }).lean().exec();
      const deliveryEvents = await MessageDeliveryEventModel.find({ providerMessageId: 'wamid-webhook-media-1' }).lean().exec();
      expect(message?.attachments).toEqual([
        expect.objectContaining({
          kind: 'image',
          url: 'https://messaging.local/files/photo.jpg',
          mimeType: 'image/jpeg',
          fileName: 'photo.jpg'
        })
      ]);
      expect(message?.deliveryStatus).toBe('queued');
      expect(deliveryEvents).toEqual([
        expect.objectContaining({
          deliveryStatus: 'queued',
          source: 'webhook_message'
        })
      ]);
    } finally {
      await server.close();
    }
  });

  it('canonicalizes inbound @lid messages onto an existing @c.us conversation', async () => {
    const { agencyId, tenantId } = await seedBinding();
    process.env.MESSAGING_PROVIDER_WEBHOOK_SECRET = 'webhook-secret';
    process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';

    const existingConversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550001111@c.us',
      contactName: 'Alice Smith',
      contactPhone: '15550001111',
      status: 'open',
      unreadCount: 0,
      metadata: {
        messagingCanonicalContactId: '15550001111@c.us',
        messagingAliases: ['15550001111@c.us']
      }
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/tenant-main/contacts/15550001111%40lid')) {
        return new Response(JSON.stringify({
          id: '15550001111@lid',
          number: '15550001111',
          name: 'Alice Smith'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/api/tenant-main/lids/15550001111')) {
        return new Response(JSON.stringify({
          lid: '15550001111@lid',
          pn: '15550001111@c.us'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/webhooks/messaging',
        headers: {
          'x-messaging-webhook-secret': 'webhook-secret'
        },
        payload: {
          event: 'message',
          session: 'tenant-main',
          payload: {
            id: 'wamid-webhook-lid-1',
            from: '15550001111@lid',
            to: '15550002222@c.us',
            fromMe: false,
            body: 'Hello from lid',
            ack: 0,
            ackName: 'PENDING'
          }
        }
      });

      expect(response.statusCode).toBe(202);
      const conversations = await ConversationModel.find({ tenantId }).lean().exec();
      const message = await MessageModel.findOne({ providerMessageId: 'wamid-webhook-lid-1' }).lean().exec();

      expect(conversations).toHaveLength(1);
      expect(conversations[0]?._id.toString()).toBe(existingConversation._id.toString());
      expect(conversations[0]?.contactId).toBe('15550001111@c.us');
      expect(conversations[0]?.metadata).toEqual(expect.objectContaining({
        messagingCanonicalContactId: '15550001111@c.us',
        messagingChatId: '15550001111@lid',
        messagingAliases: expect.arrayContaining(['15550001111@lid', '15550001111@c.us'])
      }));
      expect(message?.conversationId.toString()).toBe(existingConversation._id.toString());
    } finally {
      await server.close();
    }
  });

  it('reuses one inbound conversation when a lid-first webhook identity later resolves as canonical @c.us', async () => {
    const { tenantId } = await seedBinding();
    process.env.MESSAGING_PROVIDER_WEBHOOK_SECRET = 'webhook-secret';
    const server = await buildServer({ logger: false });

    try {
      const firstResponse = await server.inject({
        method: 'POST',
        url: '/v1/webhooks/messaging',
        headers: {
          'x-messaging-webhook-secret': 'webhook-secret'
        },
        payload: {
          event: 'message',
          session: 'tenant-main',
          payload: {
            id: 'wamid-webhook-lid-first',
            from: '15559990000@lid',
            to: '15550002222@c.us',
            fromMe: false,
            body: 'first lid inbound',
            ack: 0,
            ackName: 'PENDING'
          }
        }
      });

      const secondResponse = await server.inject({
        method: 'POST',
        url: '/v1/webhooks/messaging',
        headers: {
          'x-messaging-webhook-secret': 'webhook-secret'
        },
        payload: {
          event: 'message',
          session: 'tenant-main',
          payload: {
            id: 'wamid-webhook-canonical-second',
            from: '15559990000@c.us',
            to: '15550002222@c.us',
            fromMe: false,
            body: 'second canonical inbound',
            ack: 0,
            ackName: 'PENDING'
          }
        }
      });

      expect(firstResponse.statusCode).toBe(202);
      expect(secondResponse.statusCode).toBe(202);

      const [conversations, firstMessage, secondMessage] = await Promise.all([
        ConversationModel.find({ tenantId }).lean().exec(),
        MessageModel.findOne({ providerMessageId: 'wamid-webhook-lid-first' }).lean().exec(),
        MessageModel.findOne({ providerMessageId: 'wamid-webhook-canonical-second' }).lean().exec()
      ]);

      expect(conversations).toHaveLength(1);
      expect(conversations[0]?.contactId).toBe('15559990000@c.us');
      expect(conversations[0]?.metadata).toEqual(expect.objectContaining({
        messagingCanonicalContactId: '15559990000@c.us',
        messagingAliases: expect.arrayContaining(['15559990000@lid', '15559990000@c.us'])
      }));
      expect(firstMessage?.conversationId.toString()).toBe(secondMessage?.conversationId.toString());
      expect(firstMessage?.conversationId.toString()).toBe(conversations[0]?._id.toString());
    } finally {
      await server.close();
    }
  });

  it('canonicalizes @lid messages from WAHA lid phone/name payloads even when contacts lookup lacks number', async () => {
    const { agencyId, tenantId } = await seedBinding();
    process.env.MESSAGING_PROVIDER_WEBHOOK_SECRET = 'webhook-secret';
    process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/tenant-main/contacts/50805738631354%40lid')) {
        return new Response(JSON.stringify({
          id: '50805738631354@lid'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/api/tenant-main/lids/50805738631354')) {
        return new Response(JSON.stringify({
          lid: '50805738631354',
          phone: '84961566302@c.us',
          name: 'Salmen Khelifi'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/webhooks/messaging',
        headers: {
          'x-messaging-webhook-secret': 'webhook-secret'
        },
        payload: {
          event: 'message',
          session: 'tenant-main',
          payload: {
            id: 'wamid-webhook-lid-2',
            from: '50805738631354@lid',
            to: '15550002222@c.us',
            fromMe: false,
            body: 'Hello from lid phone payload',
            ack: 0,
            ackName: 'PENDING'
          }
        }
      });

      expect(response.statusCode).toBe(202);
      const conversation = await ConversationModel.findOne({ tenantId }).lean().exec();
      expect(conversation?.contactId).toBe('84961566302@c.us');
      expect(conversation?.contactName).toBe('Salmen Khelifi');
      expect(conversation?.contactPhone).toBe('84961566302');
    } finally {
      await server.close();
    }
  });

  it('updates message delivery state on webhook ack events', async () => {
    const { agencyId, tenantId } = await seedBinding();
    process.env.MESSAGING_PROVIDER_WEBHOOK_SECRET = 'webhook-secret';
    const conversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550001111@c.us',
      status: 'open',
      unreadCount: 0
    });

    await MessageModel.create({
      conversationId: conversation._id,
      role: 'assistant',
      content: 'Reply',
      messagingMessageId: 'wamid-ack-1',
      providerMessageId: 'wamid-ack-1',
      deliveryStatus: 'sent'
    });

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/webhooks/messaging',
        headers: {
          'x-messaging-webhook-secret': 'webhook-secret'
        },
        payload: {
          event: 'message.ack',
          session: 'tenant-main',
          payload: {
            id: 'wamid-ack-1',
            ack: 3,
            ackName: 'READ'
          }
        }
      });

      expect(response.statusCode).toBe(202);
      const [updatedMessage, deliveryEvents] = await Promise.all([
        MessageModel.findOne({ providerMessageId: 'wamid-ack-1' }).lean().exec(),
        MessageDeliveryEventModel.find({ providerMessageId: 'wamid-ack-1' }).sort({ occurredAt: 1, createdAt: 1 }).lean().exec()
      ]);
      expect(updatedMessage?.providerAck).toBe(3);
      expect(updatedMessage?.providerAckName).toBe('READ');
      expect(updatedMessage?.deliveryStatus).toBe('read');
      expect(deliveryEvents).toEqual([
        expect.objectContaining({
          deliveryStatus: 'read',
          providerAck: 3,
          providerAckName: 'READ',
          source: 'webhook_ack'
        })
      ]);
    } finally {
      await server.close();
    }
  });

  it('does not update messages from a different tenant when provider ids collide', async () => {
    process.env.MESSAGING_PROVIDER_WEBHOOK_SECRET = 'webhook-secret';
    const firstBinding = await seedBinding();
    const secondAgencyId = new mongoose.Types.ObjectId();
    const secondTenantId = new mongoose.Types.ObjectId();
    const secondClusterId = new mongoose.Types.ObjectId();

    await MessagingClusterModel.create({
      _id: secondClusterId,
      name: 'Secondary MessagingProvider Cluster',
      region: 'us-east-1',
      baseUrl: 'http://messaging-2.test',
      dashboardUrl: 'http://messaging-2.test/dashboard',
      swaggerUrl: 'http://messaging-2.test/docs',
      capacity: 10,
      activeSessionCount: 1,
      status: 'active',
      secretRefs: { webhookSecretVersion: 'v1' }
    });

    await MessagingSessionBindingModel.create({
      agencyId: secondAgencyId,
      tenantId: secondTenantId,
      clusterId: secondClusterId,
      sessionName: 'tenant-second',
      messagingSessionName: 'tenant-second',
      routingMetadata: {},
      status: 'active'
    });

    const firstConversation = await ConversationModel.create({
      agencyId: firstBinding.agencyId,
      tenantId: firstBinding.tenantId,
      contactId: '15550001111@c.us',
      status: 'open',
      unreadCount: 0
    });
    const secondConversation = await ConversationModel.create({
      agencyId: secondAgencyId,
      tenantId: secondTenantId,
      contactId: '15550002222@c.us',
      status: 'open',
      unreadCount: 0
    });

    await MessageModel.create({
      conversationId: firstConversation._id,
      role: 'assistant',
      content: 'Tenant one',
      providerMessageId: 'shared-provider-id',
      deliveryStatus: 'sent'
    });
    await MessageModel.create({
      conversationId: secondConversation._id,
      role: 'assistant',
      content: 'Tenant two',
      providerMessageId: 'shared-provider-id',
      deliveryStatus: 'sent'
    });

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/webhooks/messaging',
        headers: {
          'x-messaging-webhook-secret': 'webhook-secret'
        },
        payload: {
          event: 'message.ack',
          session: 'tenant-second',
          payload: {
            id: 'shared-provider-id',
            ack: 3,
            ackName: 'READ'
          }
        }
      });

      expect(response.statusCode).toBe(202);
      const [firstMessage, secondMessage] = await Promise.all([
        MessageModel.findOne({ conversationId: firstConversation._id }).lean().exec(),
        MessageModel.findOne({ conversationId: secondConversation._id }).lean().exec()
      ]);
      expect(firstMessage?.deliveryStatus).toBe('sent');
      expect(secondMessage?.deliveryStatus).toBe('read');
    } finally {
      await server.close();
    }
  });

  it('updates binding status for session.status lifecycle webhooks', async () => {
    await seedBinding();
    process.env.MESSAGING_PROVIDER_WEBHOOK_SECRET = 'webhook-secret';
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/webhooks/messaging',
        headers: {
          'x-messaging-webhook-secret': 'webhook-secret'
        },
        payload: {
          event: 'session.status',
          session: 'tenant-main',
          payload: {
            status: 'STOPPED'
          }
        }
      });

      expect(response.statusCode).toBe(202);
      const updatedBinding = await MessagingSessionBindingModel.findOne({ messagingSessionName: 'tenant-main' }).lean().exec();
      expect(updatedBinding?.status).toBe('stopped');
    } finally {
      await server.close();
    }
  });

  it('acknowledges unknown sessions without failing webhook ingestion', async () => {
    process.env.MESSAGING_PROVIDER_WEBHOOK_SECRET = 'webhook-secret';
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/webhooks/messaging',
        headers: {
          'x-messaging-webhook-secret': 'webhook-secret'
        },
        payload: {
          event: 'message',
          session: 'unknown-session',
          payload: {
            id: 'wamid-unknown-1',
            from: '15550001111@c.us',
            to: '15550002222@c.us',
            fromMe: false,
            body: 'Message from unknown session'
          }
        }
      });

      expect(response.statusCode).toBe(202);
      const message = await MessageModel.findOne({ providerMessageId: 'wamid-unknown-1' }).lean().exec();
      expect(message).toBeNull();
    } finally {
      await server.close();
    }
  });
});
