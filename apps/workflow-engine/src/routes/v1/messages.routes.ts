import { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { InternalInboxMessageService } from '../../modules/inbox/internal-message.service.js';
import { randomUUID } from 'node:crypto';
import { ConversationModel, MessagingSessionBindingModel } from '@noxivo/database';
import { InboxService, type AddMessageInput } from '../../modules/inbox/inbox.service.js';
import { proxyToMessaging } from '../../lib/messaging-proxy-utils.js';

type ConversationLean = {
  _id: { toString(): string };
  contactId: string;
  contactPhone?: string | null;
  contactName?: string | null;
};

type LiveMessagingSession = {
  name?: string;
  status?: string;
  config?: {
    metadata?: {
      agencyId?: string;
      tenantId?: string;
    };
  } | null;
};

type SendAttachment = {
  url: string;
  kind: 'image' | 'video' | 'audio' | 'document';
  fileName?: string | undefined;
  mimeType: string;
  caption?: string | undefined;
};

const SendMessageSchema = z.object({
  to: z.string().describe('Recipient phone number or contact ID'),
  text: z.string().optional().describe('Message text content'),
  agencyId: z.string().optional().describe('Internal Agency Identifier (Optional if using scoped key)'),
  tenantId: z.string().optional().describe('Internal Tenant Identifier (Optional if using scoped key)'),
  attachments: z.array(z.object({
    url: z.string().url(),
    kind: z.enum(['image', 'video', 'audio', 'document']),
    fileName: z.string().optional(),
    mimeType: z.string(),
    caption: z.string().optional()
  })).optional()
});

function extractMessagingMessageId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.id === 'string') {
    return record.id;
  }

  if (record.id && typeof record.id === 'object') {
    const nestedId = record.id as Record<string, unknown>;
    if (typeof nestedId._serialized === 'string') {
      return nestedId._serialized;
    }
  }

  return undefined;
}

function isMissingBindingError(error: unknown): boolean {
  return error instanceof Error && (
    error.message.includes('No active MessagingProvider session binding found')
    || error.message.includes('MessagingProvider cluster not found')
  );
}

function buildMessagingFilePayload(attachment: SendAttachment) {
  return {
    mimetype: attachment.mimeType,
    ...(attachment.fileName ? { filename: attachment.fileName } : {}),
    url: attachment.url,
  };
}

function normalizeAttachments(attachments: Array<{
  url: string;
  kind: 'image' | 'video' | 'audio' | 'document';
  fileName?: string | undefined;
  mimeType: string;
  caption?: string | undefined;
}>): SendAttachment[] {
  return attachments.map((attachment) => ({
    url: attachment.url,
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    ...(attachment.fileName ? { fileName: attachment.fileName } : {}),
    ...(attachment.caption ? { caption: attachment.caption } : {}),
  }));
}

function buildMessagingSendRequest(input: {
  sessionName: string;
  chatId: string;
  text?: string;
  attachments: SendAttachment[];
}): { endpoint: string; body: Record<string, unknown> } {
  const content = input.text?.trim() ?? '';
  const attachment = input.attachments[0];

  if (!attachment) {
    return {
      endpoint: '/api/sendText',
      body: {
        session: input.sessionName,
        chatId: input.chatId,
        text: content,
      },
    };
  }

  if (input.attachments.length > 1) {
    throw new Error('Only one attachment is supported per send');
  }

  const sharedBody = {
    session: input.sessionName,
    chatId: input.chatId,
    file: buildMessagingFilePayload(attachment),
  };

  if (attachment.kind === 'image') {
    return {
      endpoint: '/api/sendImage',
      body: {
        ...sharedBody,
        ...(content || attachment.caption ? { caption: content || attachment.caption } : {}),
      },
    };
  }

  if (attachment.kind === 'document') {
    return {
      endpoint: '/api/sendFile',
      body: {
        ...sharedBody,
        ...(content || attachment.caption ? { caption: content || attachment.caption } : {}),
      },
    };
  }

  if (attachment.kind === 'audio') {
    return {
      endpoint: '/api/sendVoice',
      body: {
        ...sharedBody,
        convert: false,
      },
    };
  }

  return {
    endpoint: '/api/sendVideo',
    body: {
      ...sharedBody,
      convert: false,
      asNote: false,
      ...(content || attachment.caption ? { caption: content || attachment.caption } : {}),
    },
  };
}

async function ensureConversation(input: {
  agencyId: string;
  tenantId: string;
  contactId: string;
  phone: string;
}): Promise<ConversationLean> {
  const existing = await ConversationModel.findOne({
    agencyId: input.agencyId,
    tenantId: input.tenantId,
    contactId: input.contactId,
  }).select({ _id: 1, contactId: 1, contactPhone: 1, contactName: 1 }).lean<ConversationLean | null>();

  if (existing) {
    return existing;
  }

  const created = await ConversationModel.create({
    agencyId: input.agencyId,
    tenantId: input.tenantId,
    contactId: input.contactId,
    contactPhone: input.phone,
    status: 'open',
    unreadCount: 0,
    lastMessageAt: new Date(),
  });

  return {
    _id: created._id,
    contactId: created.contactId,
    contactPhone: created.contactPhone ?? null,
    contactName: created.contactName ?? null,
  };
}

async function resolveFallbackSessionName(input: {
  agencyId: string;
  tenantId: string;
}): Promise<string | null> {
  const binding = await MessagingSessionBindingModel.findOne({
    agencyId: input.agencyId,
    tenantId: input.tenantId,
  })
    .sort({ updatedAt: -1 })
    .select({ messagingSessionName: 1 })
    .lean<{ messagingSessionName?: string } | null>();

  if (typeof binding?.messagingSessionName === 'string' && binding.messagingSessionName.length > 0) {
    return binding.messagingSessionName;
  }

  const liveSessionsPayload = await proxyToMessaging('/api/sessions?all=true');
  if (!Array.isArray(liveSessionsPayload)) {
    return null;
  }

  const liveSessions = liveSessionsPayload as LiveMessagingSession[];
  const liveSession = liveSessions.find(
    (session) =>
      session.config?.metadata?.agencyId === input.agencyId &&
      session.config?.metadata?.tenantId === input.tenantId &&
      typeof session.name === 'string' &&
      session.name.length > 0
  );

  return typeof liveSession?.name === 'string' ? liveSession.name : null;
}

async function sendViaMessagingFallback(input: {
  agencyId: string;
  tenantId: string;
  contactId: string;
  phone: string;
  text?: string;
  attachments: SendAttachment[];
}) {
  const conversation = await ensureConversation({
    agencyId: input.agencyId,
    tenantId: input.tenantId,
    contactId: input.contactId,
    phone: input.phone,
  });
  const sessionName = await resolveFallbackSessionName({
    agencyId: input.agencyId,
    tenantId: input.tenantId,
  });

  if (!sessionName) {
    throw new Error('No MessagingProvider session found for agency/tenant');
  }

  const messagingRequest = buildMessagingSendRequest({
    sessionName,
    chatId: input.contactId,
    ...(typeof input.text === 'string' ? { text: input.text } : {}),
    attachments: input.attachments,
  });
  const messagingPayload = await proxyToMessaging(messagingRequest.endpoint, {
    method: 'POST',
    body: JSON.stringify(messagingRequest.body),
  });
  const providerMessageId = extractMessagingMessageId(messagingPayload);

  const inboxService = new InboxService();
  const recordInput: AddMessageInput = {
    agencyId: input.agencyId,
    tenantId: input.tenantId,
    contactId: conversation.contactId,
    contactName: conversation.contactName ?? null,
    contactPhone: conversation.contactPhone ?? null,
    role: 'assistant',
    content: input.text ?? '',
    attachments: input.attachments,
    deliveryStatus: 'sent',
    deliveryEventSource: 'message_create',
    metadata: {
      source: 'api-v1-messages-send-fallback',
      sessionName,
      provider: 'messaging',
    },
  };

  if (providerMessageId) {
    recordInput.messagingMessageId = providerMessageId;
    recordInput.providerMessageId = providerMessageId;
  }

  const recorded = await inboxService.recordMessage(recordInput);
  const messageId = recorded.message._id?.toString?.() ?? providerMessageId ?? randomUUID();

  return {
    id: messageId,
    status: 'sent',
    timestamp: new Date().toISOString(),
  };
}

export async function registerMessageRoutes(fastify: FastifyInstance) {
  const messageService = new InternalInboxMessageService();

  fastify.post('/api/v1/messages/send', {
    schema: {
      description: 'Send a white-labeled message through the engine',
      tags: ['Messages'],
      body: {
        type: 'object',
        required: ['to'],
        properties: {
          to: { type: 'string' },
          text: { type: 'string' },
          agencyId: { type: 'string', description: 'Optional if using scoped key' },
          tenantId: { type: 'string', description: 'Optional if using scoped key' },
          attachments: {
            type: 'array',
            items: {
              type: 'object',
              required: ['url', 'kind', 'mimeType'],
              properties: {
                url: { type: 'string' },
                kind: { type: 'string', enum: ['image', 'video', 'audio', 'document'] },
                fileName: { type: 'string' },
                mimeType: { type: 'string' },
                caption: { type: 'string' }
              }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string' },
            timestamp: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        409: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        }
      },
      security: [{ apiKey: [] }]
    }
  }, async (request, reply) => {
    const body = SendMessageSchema.parse(request.body);

    const agencyId = body.agencyId || request.context?.agencyId;
    const tenantId = body.tenantId || request.context?.tenantId;

    if (!agencyId || !tenantId) {
      return reply.status(400).send({ error: 'agencyId and tenantId are required (missing from body and no API key context found)' });
    }

    const normalizedContactId = body.to.includes('@') ? body.to : `${body.to}@c.us`;
    const normalizedPhone = normalizedContactId.replace(/@c\.us$/i, '');
    const idempotencyKeyHeader = request.headers['idempotency-key'];
    const idempotencyKey = typeof idempotencyKeyHeader === 'string' && idempotencyKeyHeader.trim().length > 0
      ? idempotencyKeyHeader
      : randomUUID();

    try {
      const conversation = await ensureConversation({
        agencyId,
        tenantId,
        contactId: normalizedContactId,
        phone: normalizedPhone,
      });

      const result = await messageService.sendOperatorMessage({
        conversationId: conversation._id.toString(),
        idempotencyKey,
        payload: {
          agencyId,
          tenantId,
          content: body.text,
          attachments: body.attachments ?? [],
          operatorUserId: 'engine-api'
        }
      });

      return reply.status(200).send({
        id: result._id,
        status: 'sent',
        timestamp: result.createdAt
      });
    } catch (error) {
      if (isMissingBindingError(error)) {
        try {
          const fallbackResult = await sendViaMessagingFallback({
            agencyId,
            tenantId,
            contactId: normalizedContactId,
            phone: normalizedPhone,
            ...(typeof body.text === 'string' ? { text: body.text } : {}),
            attachments: normalizeAttachments(body.attachments ?? []),
          });

          return reply.status(200).send(fallbackResult);
        } catch (fallbackError) {
          request.log.error(fallbackError);
          const message = fallbackError instanceof Error ? fallbackError.message : 'Internal Server Error';
          return reply.status(500).send({ error: message });
        }
      }

      request.log.error(error);
      const message = error instanceof Error ? error.message : 'Internal Server Error';
      const rawStatusCode = typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number((error as { statusCode?: unknown }).statusCode) || 500
        : 500;
      const statusCode: 400 | 404 | 409 | 500 = rawStatusCode === 400 || rawStatusCode === 404 || rawStatusCode === 409
        ? rawStatusCode
        : 500;

      return reply.status(statusCode).send({
        error: message
      });
    }
  });
}
