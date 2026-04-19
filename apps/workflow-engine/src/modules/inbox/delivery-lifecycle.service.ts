import { MessageModel, ConversationModel, AgencyModel, MessageDeliveryEventModel } from '@noxivo/database';
import {
  type InboxDeliveryEventSource,
  type InboxDeliveryStatus,
  MessageDeliveryEventSchema
} from '@noxivo/contracts';

export interface DeliveryLifecycleRecordInput {
  agencyId: string;
  tenantId: string;
  conversationId: string;
  messageId: string;
  providerMessageId?: string | null;
  deliveryStatus: InboxDeliveryStatus;
  providerAck?: number | null;
  providerAckName?: string | null;
  error?: string | null;
  source: InboxDeliveryEventSource;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
}

function isSameLifecycleSnapshot(
  previous: {
    deliveryStatus?: string | null;
    providerAck?: number | null;
    providerAckName?: string | null;
    error?: string | null;
    source?: string | null;
  } | null,
  next: DeliveryLifecycleRecordInput
): boolean {
  return previous?.deliveryStatus === next.deliveryStatus
    && (previous?.providerAck ?? null) === (next.providerAck ?? null)
    && (previous?.providerAckName ?? null) === (next.providerAckName ?? null)
    && (previous?.error ?? null) === (next.error ?? null)
    && (previous?.source ?? null) === next.source;
}

export class DeliveryLifecycleService {
  async recordEvent(input: DeliveryLifecycleRecordInput) {
    const parsed = MessageDeliveryEventSchema.parse({
      ...input,
      providerMessageId: input.providerMessageId ?? null,
      providerAck: input.providerAck ?? null,
      providerAckName: input.providerAckName ?? null,
      error: input.error ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      metadata: input.metadata ?? {}
    });

    const lastEvent = await MessageDeliveryEventModel.findOne({ messageId: parsed.messageId })
      .sort({ occurredAt: -1, createdAt: -1 })
      .lean()
      .exec();

    if (isSameLifecycleSnapshot(lastEvent, input)) {
      return null;
    }

    return MessageDeliveryEventModel.create(parsed);
  }

  async syncMessageState(input: DeliveryLifecycleRecordInput) {
    await MessageModel.findByIdAndUpdate(input.messageId, {
      $set: {
        deliveryStatus: input.deliveryStatus,
        providerAck: input.providerAck ?? null,
        providerAckName: input.providerAckName ?? null,
        error: input.error ?? null,
        ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {})
      }
    }).exec();

    return this.recordEvent(input);
  }

  async getMessageHistory(messageId: string) {
    return MessageDeliveryEventModel.find({ messageId })
      .sort({ occurredAt: -1, createdAt: -1 })
      .lean()
      .exec();
  }

  async resendMessage(input: DeliveryLifecycleRecordInput & { reason?: string }) {
    const message = await MessageModel.findById(input.messageId).lean().exec();

    if (!message) {
      throw new Error('Message not found');
    }

    const conversation = await ConversationModel.findById(message.conversationId).lean().exec();

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const agency = await AgencyModel.findById(conversation.agencyId).lean().exec();

    if (!agency) {
      throw new Error('Agency not found');
    }

    await this.recordEvent({
      ...input,
      deliveryStatus: 'sent',
      source: 'retry_worker',
      metadata: {
        ...input.metadata,
        reason: input.reason ?? 'manual_resend',
        originalMessageId: input.messageId,
        originalPayload: {
          content: message.content,
          attachments: message.attachments
        }
      }
    });

    return {
      messageId: input.messageId,
      conversationId: input.conversationId,
      resendTriggeredAt: new Date()
    };
  }

  async getConversationAuditTrail(conversationId: string, options?: { limit?: number; offset?: number }) {
    const messageIds = await MessageModel.find({ conversationId }, { _id: 1 })
      .lean()
      .exec()
      .then(msgs => msgs.map(m => m._id.toString()));

    if (messageIds.length === 0) {
      return [];
    }

    return MessageDeliveryEventModel.find(
      { messageId: { $in: messageIds } },
      {},
      {
        sort: { occurredAt: -1 },
        limit: options?.limit ?? 50,
        skip: options?.offset ?? 0
      }
    )
      .lean()
      .exec();
  }
}