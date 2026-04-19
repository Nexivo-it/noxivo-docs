import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { MessagingChatsRequestSchema, MessagingMessagesRequestSchema, MessagingSendMessageRequestSchema, MessagingMessageStatusRequestSchema } from '@noxivo/contracts';
import { MessagingInboxSyncService } from '../modules/inbox/messaging-sync.service.js';
import { InternalInboxMessageService } from '../modules/inbox/internal-message.service.js';
import { ConversationModel, MessageModel } from '@noxivo/database';
import mongoose from 'mongoose';
import { INTERNAL_INBOX_IDEMPOTENCY_HEADER } from '@noxivo/contracts';
import { getConfiguredMessagingBaseUrl, normalizeMessagingBaseUrl, resolveMessagingClusterBaseUrlByAgencyTenant } from '../lib/messaging-base-url.js';

const messagingInboxSyncService = new MessagingInboxSyncService();
const internalInboxMessageService = new InternalInboxMessageService();

function resolveSyncPages(input: { limit: number; offset: number; pages?: number }): number {
  if (input.pages !== undefined) {
    return Math.max(1, Math.min(input.pages, 20));
  }

  const pageDepth = Math.ceil((input.offset + input.limit) / Math.max(input.limit, 1));
  return Math.max(1, Math.min(pageDepth, 20));
}

async function resolveAgencyAndTenant(agencyId: string, tenantId: string): Promise<{ agencyObjectId: mongoose.Types.ObjectId, tenantObjectId: mongoose.Types.ObjectId }> {
  const { AgencyModel, TenantModel } = await import('@noxivo/database');
  const isAgencyIdHex = /^[a-fA-F0-9]{24}$/.test(agencyId);
  const isTenantIdHex = /^[a-fA-F0-9]{24}$/.test(tenantId);

  let agencyObjectId: mongoose.Types.ObjectId;
  if (isAgencyIdHex) {
    agencyObjectId = new mongoose.Types.ObjectId(agencyId);
  } else {
    const agencyResult = await AgencyModel.findOne({ slug: agencyId }, { _id: 1 }).lean();
    if (!agencyResult) throw new Error('Agency not found by slug');
    agencyObjectId = agencyResult._id as mongoose.Types.ObjectId;
  }

  let tenantObjectId: mongoose.Types.ObjectId;
  if (isTenantIdHex) {
    tenantObjectId = new mongoose.Types.ObjectId(tenantId);
  } else {
    const tenantResult = await TenantModel.findOne({ agencyId: agencyObjectId, slug: tenantId }, { _id: 1 }).lean();
    if (!tenantResult) throw new Error('Tenant not found by slug');
    tenantObjectId = tenantResult._id as mongoose.Types.ObjectId;
  }

  return { agencyObjectId, tenantObjectId };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function registerMessagingInboxRoutes(fastify: FastifyInstance): Promise<void> {
  const resolveMessagingProviderBaseUrl = async (agencyId: string, tenantId: string): Promise<string> => {
    const clusterBaseUrl = await resolveMessagingClusterBaseUrlByAgencyTenant({ agencyId, tenantId });
    if (clusterBaseUrl) {
      return clusterBaseUrl;
    }

    const configuredBaseUrl = getConfiguredMessagingBaseUrl();
    if (!configuredBaseUrl) {
      throw new Error('MESSAGING_PROVIDER_PROXY_BASE_URL or MESSAGING_PROVIDER_BASE_URL environment variable is required');
    }

    return normalizeMessagingBaseUrl(configuredBaseUrl);
  };
  const requireApiKey = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!fastify.verifyApiKey(request, reply)) {
      return;
    }
  };

  fastify.get('/v1/inbox/chats', {
    preHandler: [requireApiKey]
  }, async (request, reply) => {
    // Resolve context: prefer query params, then fallback to API key context
    const agencyId = (request.query as any).agencyId || (request as any).context?.agencyId;
    const tenantId = (request.query as any).tenantId || (request as any).context?.tenantId;

    if (!agencyId || !tenantId) {
      return reply.status(400).send({ error: 'agencyId and tenantId are required (missing from query and no API key context found)' });
    }

    const query = MessagingChatsRequestSchema.parse(Object.assign({}, request.query, { agencyId, tenantId }));
    const { limit, offset } = query;
    const rawPages = (request.query as { pages?: string | number }).pages;
    const parsedPages = typeof rawPages === 'number'
      ? rawPages
      : typeof rawPages === 'string'
        ? Number(rawPages)
        : undefined;
    const normalizedPages = typeof parsedPages === 'number' && Number.isFinite(parsedPages)
      ? Math.trunc(parsedPages)
      : undefined;
    const syncPages = resolveSyncPages({
      limit,
      offset,
      ...(normalizedPages !== undefined ? { pages: normalizedPages } : {})
    });

    const syncResult = await messagingInboxSyncService.syncRecentChats({
      agencyId,
      tenantId,
      limit,
      pages: syncPages
    });

    const { agencyObjectId, tenantObjectId } = await resolveAgencyAndTenant(agencyId, tenantId);

    const conversations = await ConversationModel.find({
      agencyId: agencyObjectId,
      tenantId: tenantObjectId
    })
      .sort({ lastMessageAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    const total = await ConversationModel.countDocuments({
      agencyId: agencyObjectId,
      tenantId: tenantObjectId
    });

    const messagingToken = process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN ?? process.env.MESSAGING_PROVIDER_API_KEY;
    let messagingChats: Array<{ id?: string; name?: string; picture?: string | null; lastMessage?: { body?: string; timestamp?: number; fromMe?: boolean }; _chat?: { unreadCount?: number } }> = [];

    if (syncResult.sessionName && messagingToken) {
      try {
        const messagingParams = new URLSearchParams({
          limit: String(limit)
        });
        if (offset > 0) {
          messagingParams.set('offset', String(offset));
        }

        const messagingBaseUrl = await resolveMessagingProviderBaseUrl(agencyId, tenantId);
        const messagingUrl = `${messagingBaseUrl}/api/${encodeURIComponent(syncResult.sessionName)}/chats/overview?${messagingParams.toString()}`;
        const messagingResponse = await fetchWithTimeout(messagingUrl, { headers: { 'x-api-key': messagingToken } }, 8000);
        if (messagingResponse.ok) {
          messagingChats = await messagingResponse.json();
        }
      } catch {
        // ignore MessagingProvider fetch errors
      }
    }

    const chatsById = new Map<string, {
      id: string;
      name: string | null;
      picture: string | null;
      lastMessage: { body: string | null; timestamp: number; fromMe: boolean } | null;
      unreadCount: number;
    }>();

    for (const chat of messagingChats) {
      const chatId = chat.id?.trim();
      if (!chatId) {
        continue;
      }

      chatsById.set(chatId, {
        id: chatId,
        name: chat.name ?? null,
        picture: chat.picture ?? null,
        lastMessage: chat.lastMessage ? {
          body: chat.lastMessage.body ?? null,
          timestamp: chat.lastMessage.timestamp ?? 0,
          fromMe: chat.lastMessage.fromMe ?? false
        } : null,
        unreadCount: chat._chat?.unreadCount ?? 0
      });
    }

    for (const conversation of conversations) {
      const chatId = conversation.contactId?.trim();
      if (!chatId || chatsById.has(chatId)) {
        continue;
      }

      const metadata = conversation.metadata && typeof conversation.metadata === 'object' && !Array.isArray(conversation.metadata)
        ? conversation.metadata as Record<string, unknown>
        : null;
      const pictureCandidate = metadata && (
        metadata.contactPicture
        ?? metadata.profilePictureURL
        ?? metadata.profilePicture
        ?? metadata.profilePicUrl
        ?? metadata.avatarUrl
      );
      const picture = typeof pictureCandidate === 'string' && pictureCandidate.trim().length > 0
        ? pictureCandidate.trim()
        : null;

      const lastMessageTimestamp = conversation.lastMessageAt instanceof Date
        ? Math.floor(conversation.lastMessageAt.getTime() / 1000)
        : 0;

      chatsById.set(chatId, {
        id: chatId,
        name: conversation.contactName ?? null,
        picture,
        lastMessage: conversation.lastMessageContent
          ? {
              body: conversation.lastMessageContent,
              timestamp: lastMessageTimestamp,
              fromMe: false
            }
          : null,
        unreadCount: conversation.unreadCount ?? 0
      });
    }

    const chats = Array.from(chatsById.values()).slice(0, limit);

    return reply.status(200).send({
      chats,
      total,
      hasMore: offset + limit < total
    });
  });

  fastify.get('/v1/inbox/conversations/:conversationId/messages', {
    preHandler: [requireApiKey]
  }, async (request, reply) => {
    const params = request.params as { conversationId: string };
    const agencyId = (request.query as any).agencyId || (request as any).context?.agencyId;
    const tenantId = (request.query as any).tenantId || (request as any).context?.tenantId;

    if (!agencyId || !tenantId) {
      return reply.status(400).send({ error: 'agencyId and tenantId are required' });
    }

    const q = MessagingMessagesRequestSchema.parse(Object.assign({}, request.query, { 
      conversationId: params.conversationId,
      agencyId,
      tenantId
    }));
    const { conversationId, limit, offset, pages } = q;
    const syncPages = resolveSyncPages({
      limit,
      offset,
      ...(pages !== undefined ? { pages } : {})
    });

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return reply.status(404).send({
        messages: [],
        hasMore: false
      });
    }

    await messagingInboxSyncService.syncConversationMessages({
      agencyId,
      tenantId,
      conversationId,
      limit,
      pages: syncPages
    });

    const { agencyObjectId, tenantObjectId } = await resolveAgencyAndTenant(agencyId, tenantId);

    const conversation = await ConversationModel.findOne({
      _id: conversationId,
      agencyId: agencyObjectId,
      tenantId: tenantObjectId
    }).lean();

    if (!conversation) {
      return reply.status(404).send({
        messages: [],
        hasMore: false
      });
    }

    const contactId = conversation?.contactId ?? '';

    const pageMessages = await MessageModel.find({ conversationId: new mongoose.Types.ObjectId(conversationId) })
      .sort({ timestamp: -1, _id: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    const messages = pageMessages.slice().reverse();
    const total = await MessageModel.countDocuments({ conversationId: new mongoose.Types.ObjectId(conversationId) });

    const formattedMessages = messages.map((msg) => ({
      id: msg.messagingMessageId ?? String(msg._id),
      from: msg.role === 'assistant' ? 'me' : contactId,
      fromMe: msg.role === 'assistant',
      to: msg.role === 'assistant' ? contactId : 'me',
      body: msg.content,
      timestamp: msg.timestamp ? Math.floor(msg.timestamp.getTime() / 1000) : Math.floor(Date.now() / 1000),
      ack: msg.providerAck ?? 0,
      ackName: msg.providerAckName ?? 'PENDING',
      hasMedia: (msg.attachments ?? []).length > 0,
      media: (msg.attachments ?? []).length > 0 ? {
        url: msg.attachments?.[0]?.url ?? '',
        mimetype: msg.attachments?.[0]?.mimeType ?? '',
        filename: msg.attachments?.[0]?.fileName ?? null
      } : null
    }));

    return reply.status(200).send({
      messages: formattedMessages,
      hasMore: offset + pageMessages.length < total
    });
  });

  fastify.post('/v1/inbox/conversations/:conversationId/messages', {
    preHandler: [requireApiKey]
  }, async (request, reply) => {
    const params = request.params as { conversationId: string };
    const agencyId = (request.body as any).agencyId || (request as any).context?.agencyId;
    const tenantId = (request.body as any).tenantId || (request as any).context?.tenantId;

    if (!agencyId || !tenantId) {
      return reply.status(400).send({ error: 'agencyId and tenantId are required' });
    }

    const body = MessagingSendMessageRequestSchema.parse(Object.assign({}, request.body, { 
      conversationId: params.conversationId,
      agencyId,
      tenantId
    }));
    const { conversationId, operatorUserId, content, attachments } = body;

    const idempotencyKey = (request.headers[INTERNAL_INBOX_IDEMPOTENCY_HEADER] as string) ?? crypto.randomUUID();

    const internalPayload = {
      agencyId,
      tenantId,
      operatorUserId,
      content: content ?? '',
      attachments: attachments.map((att) => ({
        kind: att.kind,
        url: att.url ?? '',
        mimeType: att.mimeType,
        fileName: att.filename ?? null,
        caption: att.caption ?? null
      }))
    };

    try {
      const result = await internalInboxMessageService.sendOperatorMessage({
        conversationId,
        idempotencyKey,
        payload: internalPayload
      });

      const messageId = result._id;
      const deliveryStatus = result.deliveryStatus ?? 'sent';

      return reply.status(200).send({
        messageId,
        conversationId,
        status: deliveryStatus
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to send message' });
    }
  });

  fastify.get('/v1/inbox/messages/:messageId/status', {
    preHandler: [requireApiKey]
  }, async (request, reply) => {
    const params = request.params as { messageId: string };
    const agencyId = (request.query as any).agencyId || (request as any).context?.agencyId;
    const tenantId = (request.query as any).tenantId || (request as any).context?.tenantId;

    if (!agencyId || !tenantId) {
      return reply.status(400).send({ error: 'agencyId and tenantId are required' });
    }

    const query = MessagingMessageStatusRequestSchema.parse(Object.assign({}, request.query, { 
      messageId: params.messageId,
      agencyId,
      tenantId
    }));
    const { messageId } = query;

    const { agencyObjectId, tenantObjectId } = await resolveAgencyAndTenant(agencyId, tenantId);

    const message = await MessageModel.findOne({
      _id: new mongoose.Types.ObjectId(messageId),
      agencyId: agencyObjectId,
      tenantId: tenantObjectId
    }).lean();

    if (!message) {
      return reply.status(404).send({ error: 'Message not found' });
    }

    return reply.status(200).send({
      messageId: String(message._id),
      providerMessageId: message.providerMessageId ?? message.messagingMessageId ?? null,
      status: message.deliveryStatus ?? 'sent',
      providerAck: message.providerAck ?? null,
      providerAckName: message.providerAckName ?? null,
      updatedAt: message.updatedAt ? new Date(message.updatedAt).toISOString() : new Date().toISOString()
    });
  });
}
