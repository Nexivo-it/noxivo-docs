import { ConversationModel, MessageModel, projectContactProfileFromMessage } from '@noxivo/database';
import { type InboxDeliveryEventSource, type InboxAttachment, type InboxDeliveryStatus, type InboxStatus, type MessageRole } from '@noxivo/contracts';
import { DeliveryLifecycleService } from './delivery-lifecycle.service.js';

export interface AddMessageInput {
  agencyId: string;
  tenantId: string;
  contactId: string;
  contactName?: string | null;
  contactPhone?: string | null;
  role: MessageRole;
  content?: string;
  messagingMessageId?: string;
  providerMessageId?: string | null;
  providerAck?: number | null;
  providerAckName?: string | null;
  replyToMessageId?: string | null;
  deliveryStatus?: InboxDeliveryStatus | null;
  attachments?: InboxAttachment[];
  error?: string | null;
  metadata?: Record<string, unknown>;
  deliveryEventSource?: InboxDeliveryEventSource;
}

function summarizeAttachments(attachments: InboxAttachment[]): string {
  const primary = attachments[0];
  if (!primary) return '';
  return `[${primary.kind}]`;
}

export class InboxService {
  constructor(private readonly deliveryLifecycleService: DeliveryLifecycleService = new DeliveryLifecycleService()) {}

  async recordMessage(input: AddMessageInput): Promise<{ conversation: { _id: unknown }; message: { _id: unknown; deliveryStatus: string | null } }> {
    const content = input.content?.trim() ?? '';
    const attachments = input.attachments ?? [];

    if (content.length === 0 && attachments.length === 0) {
      throw new Error('Inbox message requires content or attachments');
    }

    const conversationSummary = content.length > 0 ? content : summarizeAttachments(attachments);

    let conversation = await ConversationModel.findOne({
      tenantId: input.tenantId,
      contactId: input.contactId
    });

    if (!conversation) {
      conversation = new ConversationModel({
        agencyId: input.agencyId,
        tenantId: input.tenantId,
        contactId: input.contactId,
        status: 'open',
        unreadCount: 0
      });
    }

    conversation.lastMessageContent = conversationSummary;
    conversation.lastMessageAt = new Date();
    
    if (input.role === 'user') {
      conversation.unreadCount += 1;
      if (['resolved', 'closed'].includes(conversation.status)) {
        conversation.status = 'open';
      }
    } else {
      conversation.unreadCount = 0;
    }

    if (input.contactName && input.contactName.trim().length > 0) {
      conversation.contactName = input.contactName;
    }

    if (input.contactPhone && input.contactPhone.trim().length > 0) {
      conversation.contactPhone = input.contactPhone;
    }

    await conversation.save();

    const message = await MessageModel.create({
      conversationId: conversation._id,
      role: input.role,
      content,
      messagingMessageId: input.messagingMessageId,
      providerMessageId: input.providerMessageId ?? input.messagingMessageId ?? null,
      providerAck: input.providerAck ?? null,
      providerAckName: input.providerAckName ?? null,
      replyToMessageId: input.replyToMessageId ?? null,
      deliveryStatus: input.deliveryStatus ?? null,
      attachments,
      error: input.error ?? null,
      metadata: input.metadata
    });

    if (input.deliveryStatus) {
      await this.deliveryLifecycleService.recordEvent({
        agencyId: input.agencyId,
        tenantId: input.tenantId,
        conversationId: conversation._id.toString(),
        messageId: message._id.toString(),
        providerMessageId: message.providerMessageId ?? message.messagingMessageId ?? null,
        deliveryStatus: input.deliveryStatus,
        providerAck: input.providerAck ?? null,
        providerAckName: input.providerAckName ?? null,
        error: input.error ?? null,
        source: input.deliveryEventSource ?? 'message_create',
        metadata: input.metadata ?? {}
      });
    }

    await projectContactProfileFromMessage({
      agencyId: input.agencyId,
      tenantId: input.tenantId,
      contactId: input.contactId,
      contactName: input.contactName ?? conversation.contactName ?? null,
      contactPhone: input.contactPhone ?? conversation.contactPhone ?? null,
      role: input.role,
      timestamp: message.timestamp
    });

    return { 
      conversation: { _id: conversation._id }, 
      message: { _id: message._id, deliveryStatus: message.deliveryStatus ?? null } 
    };
  }

  async getConversations(query: { tenantId: string; status?: InboxStatus; assignedTo?: string; limit?: number; offset?: number }) {
    const filter: Record<string, unknown> = { tenantId: query.tenantId };
    if (query.status) filter.status = query.status;
    if (query.assignedTo) filter.assignedTo = query.assignedTo;
    return ConversationModel.find(filter).sort({ lastMessageAt: -1 }).limit(query.limit ?? 50).skip(query.offset ?? 0).lean();
  }

  async getMessages(conversationId: string, limit = 50) {
    return MessageModel.find({ conversationId }).sort({ timestamp: -1 }).limit(limit).lean();
  }

  async assignConversation(conversationId: string, userId: string | null) {
    return ConversationModel.findByIdAndUpdate(conversationId, { assignedTo: userId, status: userId ? 'assigned' : 'open' }, { new: true }).lean();
  }

  async markAsRead(conversationId: string) {
    return ConversationModel.findByIdAndUpdate(conversationId, { unreadCount: 0 }, { new: true }).lean();
  }
}
