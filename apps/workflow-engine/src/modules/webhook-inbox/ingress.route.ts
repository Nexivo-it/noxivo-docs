import type { FastifyPluginAsync } from 'fastify';
import {
  ConversationModel,
  MessageModel,
  WebhookInboxActivationModel,
} from '@noxivo/database';

type WebhookInboxMessagePayload = {
  contactName?: string;
  contactPhone?: string;
  message: string;
  metadata?: Record<string, unknown>;
};

function isWebhookInboxMessageValidationError(
  error: unknown,
): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

function parseWebhookInboxMessagePayload(body: unknown): WebhookInboxMessagePayload {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw { message: 'Invalid payload: must be an object' };
  }

  const payload = body as Record<string, unknown>;

  if (typeof payload.message !== 'string' || payload.message.trim().length === 0) {
    throw { message: 'message is required' };
  }

  const parsedPayload: WebhookInboxMessagePayload = {
    message: payload.message.trim(),
  };

  if (typeof payload.contactName === 'string') {
    parsedPayload.contactName = payload.contactName.trim();
  }

  if (typeof payload.contactPhone === 'string') {
    parsedPayload.contactPhone = payload.contactPhone.trim();
  }

  if (typeof payload.metadata === 'object' && payload.metadata !== null) {
    parsedPayload.metadata = payload.metadata as Record<string, unknown>;
  }

  return parsedPayload;
}

export const webhookInboxIngressRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/*', async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply
          .status(401)
          .send({ error: 'Missing or invalid Authorization header' });
      }

      const apiKey = authHeader.slice(7);
      const params = request.params as { '*': string | undefined };
      const webhookPath = params['*'] ?? '';

      const activation = await WebhookInboxActivationModel.findOne({
        webhookUrl: { $regex: new RegExp(`/${webhookPath}$`) },
        apiKey,
        isActive: true,
      });

      if (!activation) {
        return reply.status(401).send({ error: 'Invalid webhook credentials' });
      }

      const payload = parseWebhookInboxMessagePayload(request.body);

      const contactId = payload.contactPhone || `webhook-${Date.now()}`;
      let conversation = await ConversationModel.findOne({
        agencyId: activation.agencyId,
        tenantId: activation.tenantId,
        contactId,
      });

      if (!conversation) {
        conversation = await ConversationModel.create({
          agencyId: activation.agencyId,
          tenantId: activation.tenantId,
          contactId,
          contactName: payload.contactName || null,
          contactPhone: payload.contactPhone || null,
          status: 'open',
          lastMessageContent: payload.message,
          lastMessageAt: new Date(),
          unreadCount: 1,
          metadata: {
            source: 'webhook',
            sourceId: activation._id,
            ...payload.metadata,
          },
        });
      } else {
        conversation.lastMessageContent = payload.message;
        conversation.lastMessageAt = new Date();
        conversation.unreadCount += 1;
        conversation.metadata = {
          ...conversation.metadata,
          source: 'webhook',
          sourceId: activation._id,
          ...payload.metadata,
        };
        await conversation.save();
      }

      const message = await MessageModel.create({
        conversationId: conversation._id,
        role: 'user',
        content: payload.message,
        timestamp: new Date(),
        deliveryStatus: 'delivered',
        metadata: {
          source: 'webhook',
          ...payload.metadata,
        },
      });

      return reply.status(200).send({
        success: true,
        conversationId: conversation._id,
        messageId: message._id,
      });
    } catch (error) {
      if (isWebhookInboxMessageValidationError(error)) {
        return reply.status(400).send({ error: error.message });
      }

      request.log.error(error, '[webhook-inbox] Error processing webhook');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};
