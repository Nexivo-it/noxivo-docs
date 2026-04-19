import {
  ConversationModel,
  InternalInboxSendReservationModel,
  MessageModel,
  MessagingClusterModel,
  MessagingSessionBindingModel
} from '@noxivo/database';
import {
  type InternalInboxSendAttachment,
  InternalInboxSendMessageRequestSchema,
  InternalInboxSendMessageResponseSchema,
  type InternalInboxSendMessageRequest,
  type InternalInboxSendMessageResponse
} from '@noxivo/contracts';
import { InboxService, type AddMessageInput } from './inbox.service.js';

const INTERNAL_MESSAGE_SOURCE = 'internal-operator-send';
const RESERVATION_WAIT_MS = 2000;
const RESERVATION_POLL_MS = 50;

function normalizeMessagingBaseUrl(baseUrl: string): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new InternalInboxMessageError(500, 'Invalid MessagingProvider cluster base URL');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
    throw new InternalInboxMessageError(500, 'Invalid MessagingProvider cluster base URL');
  }

  parsedUrl.hash = '';
  parsedUrl.search = '';
  parsedUrl.pathname = parsedUrl.pathname.replace(/\/$/, '');

  return parsedUrl.toString().replace(/\/$/, '');
}

export class InternalInboxMessageError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

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

function mapPersistedMessage(message: {
  _id: { toString(): string };
  conversationId: { toString(): string };
  content: string;
  timestamp: Date;
  messagingMessageId?: string | null;
  deliveryStatus?: string | null;
  attachments?: unknown[];
}): InternalInboxSendMessageResponse {
  const attachments = message.attachments
    ? JSON.parse(JSON.stringify(message.attachments)) as unknown[]
    : [];

  return InternalInboxSendMessageResponseSchema.parse({
    _id: message._id.toString(),
    conversationId: message.conversationId.toString(),
    role: 'assistant',
    content: message.content,
    createdAt: message.timestamp.toISOString(),
    messagingMessageId: message.messagingMessageId ?? null,
    deliveryStatus: message.deliveryStatus ?? null,
    attachments
  });
}

function buildPayloadSignature(payload: InternalInboxSendMessageRequest): string {
  return JSON.stringify({
    content: payload.content?.trim() ?? '',
    attachments: payload.attachments,
    replyToMessageId: payload.replyToMessageId ?? null
  });
}

function buildMessagingFilePayload(attachment: InternalInboxSendAttachment) {
  return {
    mimetype: attachment.mimeType,
    ...(attachment.fileName ? { filename: attachment.fileName } : {}),
    url: attachment.url
  };
}

function buildMessagingSendRequest(input: {
  sessionName: string;
  chatId: string;
  payload: InternalInboxSendMessageRequest;
  attachments: InternalInboxSendAttachment[];
}): { endpoint: string; body: Record<string, unknown> } {
  const content = input.payload.content?.trim() ?? '';
  const attachment = input.attachments[0];

  if (!attachment) {
    return {
      endpoint: '/api/sendText',
      body: {
        session: input.sessionName,
        chatId: input.chatId,
        text: content,
        ...(input.payload.replyToMessageId ? { reply_to: input.payload.replyToMessageId } : {})
      }
    };
  }

  if (input.attachments.length > 1) {
    throw new InternalInboxMessageError(400, 'Only one attachment is supported per send');
  }

  const sharedBody = {
    session: input.sessionName,
    chatId: input.chatId,
    file: buildMessagingFilePayload(attachment),
    ...(input.payload.replyToMessageId ? { reply_to: input.payload.replyToMessageId } : {})
  };

  if (attachment.kind === 'image') {
    return {
      endpoint: '/api/sendImage',
      body: {
        ...sharedBody,
        ...(content || attachment.caption ? { caption: content || attachment.caption } : {})
      }
    };
  }

  if (attachment.kind === 'document') {
    return {
      endpoint: '/api/sendFile',
      body: {
        ...sharedBody,
        ...(content || attachment.caption ? { caption: content || attachment.caption } : {})
      }
    };
  }

  if (attachment.kind === 'audio') {
    if (content.length > 0) {
      throw new InternalInboxMessageError(400, 'Audio attachments do not support text content');
    }

    return {
      endpoint: '/api/sendVoice',
      body: {
        ...sharedBody,
        convert: attachment.convert ?? false
      }
    };
  }

  return {
    endpoint: '/api/sendVideo',
    body: {
      ...sharedBody,
      convert: attachment.convert ?? false,
      asNote: attachment.asNote ?? false,
      ...(content || attachment.caption ? { caption: content || attachment.caption } : {})
    }
  };
}

export class InternalInboxMessageService {
  constructor(private readonly inboxService: InboxService = new InboxService()) {}

  private async waitForCompletedReservation(input: {
    reservationId: string;
    timeoutMs?: number;
  }) {
    const startedAt = Date.now();

    while (Date.now() - startedAt <= (input.timeoutMs ?? RESERVATION_WAIT_MS)) {
      const reservation = await InternalInboxSendReservationModel.findById(input.reservationId).exec();

      if (!reservation) {
        return null;
      }

      if (reservation.status !== 'pending') {
        return reservation;
      }

      await new Promise((resolve) => setTimeout(resolve, RESERVATION_POLL_MS));
    }

    return InternalInboxSendReservationModel.findById(input.reservationId).exec();
  }

  async sendOperatorMessage(input: {
    conversationId: string;
    idempotencyKey: string;
    payload: InternalInboxSendMessageRequest;
  }): Promise<InternalInboxSendMessageResponse> {
    const payload = InternalInboxSendMessageRequestSchema.parse(input.payload);
    const content = payload.content?.trim() ?? '';
    const attachments = payload.attachments;
    const payloadSignature = buildPayloadSignature(payload);

    const conversation = await ConversationModel.findOne({
      _id: input.conversationId,
      agencyId: payload.agencyId,
      tenantId: payload.tenantId
    }).lean();

    if (!conversation) {
      throw new InternalInboxMessageError(404, 'Conversation not found');
    }

    let reservation = await InternalInboxSendReservationModel.findOne({
      conversationId: conversation._id,
      idempotencyKey: input.idempotencyKey
    }).exec();

    if (reservation) {
      if (reservation.payloadSignature !== payloadSignature || reservation.operatorUserId !== payload.operatorUserId) {
        throw new InternalInboxMessageError(409, 'Idempotency key already used for a different payload');
      }

      if (reservation.status === 'completed' && reservation.messageId) {
        const completedMessage = await MessageModel.findById(reservation.messageId).exec();

        if (!completedMessage) {
          throw new InternalInboxMessageError(500, 'Completed reservation is missing its message');
        }

        return mapPersistedMessage({
          _id: completedMessage._id,
          conversationId: completedMessage.conversationId,
          content: completedMessage.content,
          timestamp: completedMessage.timestamp,
          messagingMessageId: completedMessage.messagingMessageId ?? null,
          deliveryStatus: completedMessage.deliveryStatus ?? null,
          attachments: completedMessage.attachments
        });
      }

      if (reservation.status === 'failed') {
        throw new InternalInboxMessageError(409, 'Idempotent send already failed; retry with a new idempotency key');
      }

      const settledReservation = await this.waitForCompletedReservation({
        reservationId: reservation._id.toString()
      });

      if (settledReservation?.status === 'completed' && settledReservation.messageId) {
        const settledMessage = await MessageModel.findById(settledReservation.messageId).exec();

        if (!settledMessage) {
          throw new InternalInboxMessageError(500, 'Completed reservation is missing its message');
        }

        return mapPersistedMessage({
          _id: settledMessage._id,
          conversationId: settledMessage.conversationId,
          content: settledMessage.content,
          timestamp: settledMessage.timestamp,
          messagingMessageId: settledMessage.messagingMessageId ?? null,
          deliveryStatus: settledMessage.deliveryStatus ?? null,
          attachments: settledMessage.attachments
        });
      }

      throw new InternalInboxMessageError(409, 'Duplicate send is already in progress');
    }

    try {
      reservation = await InternalInboxSendReservationModel.create({
        conversationId: conversation._id,
        agencyId: payload.agencyId,
        tenantId: payload.tenantId,
        operatorUserId: payload.operatorUserId,
        content,
        payloadSignature,
        idempotencyKey: input.idempotencyKey,
        status: 'pending'
      });
    } catch (error) {
      if (
        error instanceof Error &&
        'name' in error &&
        error.name === 'MongoServerError'
      ) {
        const duplicateReservation = await InternalInboxSendReservationModel.findOne({
          conversationId: conversation._id,
          idempotencyKey: input.idempotencyKey
        }).exec();

        if (duplicateReservation) {
          if (duplicateReservation.payloadSignature !== payloadSignature || duplicateReservation.operatorUserId !== payload.operatorUserId) {
            throw new InternalInboxMessageError(409, 'Idempotency key already used for a different payload');
          }

          const settledReservation = await this.waitForCompletedReservation({
            reservationId: duplicateReservation._id.toString()
          });

          if (settledReservation?.status === 'completed' && settledReservation.messageId) {
            const settledMessage = await MessageModel.findById(settledReservation.messageId).exec();

            if (!settledMessage) {
              throw new InternalInboxMessageError(500, 'Completed reservation is missing its message');
            }

            return mapPersistedMessage({
              _id: settledMessage._id,
              conversationId: settledMessage.conversationId,
              content: settledMessage.content,
              timestamp: settledMessage.timestamp,
              messagingMessageId: settledMessage.messagingMessageId ?? null,
              deliveryStatus: settledMessage.deliveryStatus ?? null,
              attachments: settledMessage.attachments
            });
          }

          throw new InternalInboxMessageError(409, 'Duplicate send is already in progress');
        }
      }

      throw error;
    }

    const binding = await MessagingSessionBindingModel.findOne({
      agencyId: payload.agencyId,
      tenantId: payload.tenantId,
      status: 'active'
    }).sort({ updatedAt: -1 }).lean();

    if (!binding) {
      throw new InternalInboxMessageError(409, 'No active MessagingProvider session binding found');
    }

    const cluster = await MessagingClusterModel.findById(binding.clusterId).lean();

    if (!cluster) {
      throw new InternalInboxMessageError(409, 'MessagingProvider cluster not found');
    }

    const messagingBaseUrl = normalizeMessagingBaseUrl(cluster.baseUrl);

    const messagingAuthToken = process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN ?? process.env.MESSAGING_PROVIDER_API_KEY;

    if (!messagingAuthToken) {
      throw new InternalInboxMessageError(500, 'MessagingProvider auth token is not configured');
    }

    try {
      const messagingRequest = buildMessagingSendRequest({
        sessionName: binding.messagingSessionName,
        chatId: conversation.contactId,
        payload,
        attachments
      });

      const messagingResponse = await fetch(`${messagingBaseUrl}${messagingRequest.endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': messagingAuthToken
        },
        body: JSON.stringify(messagingRequest.body)
      });

      const rawMessagingPayload = await messagingResponse.json().catch(() => null);

      if (!messagingResponse.ok) {
        throw new InternalInboxMessageError(502, 'MessagingProvider send failed');
      }

      const messagingMessageId = extractMessagingMessageId(rawMessagingPayload);

      const recordMessageInput: AddMessageInput = {
        agencyId: payload.agencyId,
        tenantId: payload.tenantId,
        contactId: conversation.contactId,
        contactName: conversation.contactName ?? null,
        contactPhone: conversation.contactPhone ?? null,
        role: 'assistant',
        content,
        replyToMessageId: payload.replyToMessageId ?? null,
        attachments,
          deliveryStatus: 'sent',
          deliveryEventSource: 'message_create',
          metadata: {
            source: INTERNAL_MESSAGE_SOURCE,
          sentByUserId: payload.operatorUserId,
          idempotencyKey: input.idempotencyKey,
          provider: 'messaging'
        }
      };

      if (messagingMessageId) {
        recordMessageInput.messagingMessageId = messagingMessageId;
      }

      await this.inboxService.recordMessage(recordMessageInput);

      const persistedMessage = await MessageModel.findOne({
        conversationId: conversation._id,
        role: 'assistant',
        'metadata.source': INTERNAL_MESSAGE_SOURCE,
        'metadata.idempotencyKey': input.idempotencyKey
      }).sort({ timestamp: -1 }).exec();

      if (!persistedMessage) {
        throw new InternalInboxMessageError(500, 'Message persistence verification failed');
      }

      await InternalInboxSendReservationModel.updateOne(
        { _id: reservation._id },
        {
          status: 'completed',
          messageId: persistedMessage._id,
          messagingMessageId: messagingMessageId ?? null,
          error: null
        }
      ).exec();

      return mapPersistedMessage({
        _id: persistedMessage._id,
        conversationId: persistedMessage.conversationId,
        content: persistedMessage.content,
        timestamp: persistedMessage.timestamp,
        messagingMessageId: persistedMessage.messagingMessageId ?? null,
        deliveryStatus: persistedMessage.deliveryStatus ?? null,
        attachments: persistedMessage.attachments
      });
    } catch (error) {
      await InternalInboxSendReservationModel.updateOne(
        { _id: reservation._id },
        {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown send failure'
        }
      ).exec();

      throw error;
    }
  }
}
