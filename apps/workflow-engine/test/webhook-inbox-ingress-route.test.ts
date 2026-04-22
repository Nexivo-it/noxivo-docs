import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  ConversationModel,
  MessageModel,
  WebhookInboxActivationModel,
} from '@noxivo/database';
import { buildServer } from '../src/server.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb,
} from './helpers/mongo-memory.js';

describe('webhook inbox ingress route parity', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-workflow-engine-webhook-inbox-ingress-tests' });
    await Promise.all([
      WebhookInboxActivationModel.init(),
      ConversationModel.init(),
      MessageModel.init(),
    ]);
  });

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('accepts bearer-authenticated webhook payload and creates/updates conversation with inbound messages', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const inboundPath = 'agency-a/tenant-b/source-1';
    const apiKey = 'wbi_test_ingress_key';

    await WebhookInboxActivationModel.create({
      agencyId,
      tenantId,
      isActive: true,
      webhookUrl: `/api/webhook-inbox/${inboundPath}`,
      apiKey,
      activatedAt: new Date(),
      deactivatedAt: null,
    });

    const server = await buildServer({ logger: false });

    try {
      const firstResponse = await server.inject({
        method: 'POST',
        url: `/api/webhook-inbox/${inboundPath}`,
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        payload: {
          contactName: 'Alice',
          contactPhone: '15550001111',
          message: 'Hello from webhook',
          metadata: { sourceTag: 'landing-page' },
        },
      });

      expect(firstResponse.statusCode).toBe(200);
      expect(firstResponse.json()).toEqual({
        success: true,
        conversationId: expect.any(String),
        messageId: expect.any(String),
      });

      const secondResponse = await server.inject({
        method: 'POST',
        url: `/api/webhook-inbox/${inboundPath}`,
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        payload: {
          contactName: 'Alice',
          contactPhone: '15550001111',
          message: 'Second webhook message',
          metadata: { sourceTag: 'landing-page' },
        },
      });

      expect(secondResponse.statusCode).toBe(200);
      expect(secondResponse.json()).toEqual({
        success: true,
        conversationId: expect.any(String),
        messageId: expect.any(String),
      });

      const conversations = await ConversationModel.find({ agencyId, tenantId }).lean().exec();
      expect(conversations).toHaveLength(1);
      expect(conversations[0]).toEqual(
        expect.objectContaining({
          contactId: '15550001111',
          contactName: 'Alice',
          contactPhone: '15550001111',
          lastMessageContent: 'Second webhook message',
          unreadCount: 2,
          metadata: expect.objectContaining({
            source: 'webhook',
            sourceTag: 'landing-page',
          }),
        }),
      );

      const messages = await MessageModel.find({ conversationId: conversations[0]?._id }).lean().exec();
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual(
        expect.objectContaining({
          role: 'user',
          content: 'Hello from webhook',
          deliveryStatus: 'delivered',
          metadata: expect.objectContaining({ source: 'webhook', sourceTag: 'landing-page' }),
        }),
      );
    } finally {
      await server.close();
    }
  });

  it('returns 401 when bearer auth is missing or invalid', async () => {
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/webhook-inbox/missing-auth',
        headers: {
          'content-type': 'application/json',
        },
        payload: { message: 'hello' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Missing or invalid Authorization header' });
    } finally {
      await server.close();
    }
  });

  it('returns 400 for invalid JSON or invalid payload semantics', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const inboundPath = 'agency-a/tenant-b/source-2';
    const apiKey = 'wbi_test_ingress_key_invalid_payload';

    await WebhookInboxActivationModel.create({
      agencyId,
      tenantId,
      isActive: true,
      webhookUrl: `/api/webhook-inbox/${inboundPath}`,
      apiKey,
      activatedAt: new Date(),
      deactivatedAt: null,
    });

    const server = await buildServer({ logger: false });

    try {
      const invalidJsonResponse = await server.inject({
        method: 'POST',
        url: `/api/webhook-inbox/${inboundPath}`,
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        payload: '{',
      });
      expect(invalidJsonResponse.statusCode).toBe(400);

      const invalidPayloadResponse = await server.inject({
        method: 'POST',
        url: `/api/webhook-inbox/${inboundPath}`,
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        payload: {
          message: '   ',
        },
      });
      expect(invalidPayloadResponse.statusCode).toBe(400);
      expect(invalidPayloadResponse.json()).toEqual({ error: 'message is required' });
    } finally {
      await server.close();
    }
  });
});
