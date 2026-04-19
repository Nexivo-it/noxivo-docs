import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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
