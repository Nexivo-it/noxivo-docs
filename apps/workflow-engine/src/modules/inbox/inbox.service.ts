import { ConversationModel, MessageModel, projectContactProfileFromMessage } from '@noxivo/database';
import { type InboxDeliveryEventSource, type InboxAttachment, type InboxDeliveryStatus, type InboxStatus, type MessageRole } from '@noxivo/contracts';
import { DeliveryLifecycleService } from './delivery-lifecycle.service.js';
import { buildMessagingAliasCandidates } from './messaging-contact-identity.js';

export interface AddMessageInput {
  agencyId: string;
  tenantId: string;
  contactId: string;
  canonicalContactId?: string;
  rawContactId?: string;
  contactAliases?: string[];
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

function normalizePhoneDigits(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) {
    return null;
  }

  const digits = trimmed.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

function normalizeChatId(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? '';
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.includes('@')) {
    return trimmed;
  }

  const digits = normalizePhoneDigits(trimmed);
  return digits ? `${digits}@c.us` : trimmed;
}

function summarizeAttachments(attachments: InboxAttachment[]): string {
  const primary = attachments[0];
  if (!primary) return '';
  return `[${primary.kind}]`;
}

export class InboxService {
  constructor(private readonly deliveryLifecycleService: DeliveryLifecycleService = new DeliveryLifecycleService()) {}

  async upsertConversationIdentity(input: Pick<AddMessageInput, 'agencyId' | 'tenantId' | 'contactId' | 'canonicalContactId' | 'rawContactId' | 'contactAliases' | 'contactName' | 'contactPhone'>) {
    const canonicalContactId = normalizeChatId(input.canonicalContactId ?? input.contactId) ?? input.contactId;
    const explicitAliases = [
      canonicalContactId,
      ...(input.contactAliases ?? []),
      input.contactId,
      input.rawContactId
    ]
      .map((value) => normalizeChatId(value))
      .filter((value): value is string => Boolean(value));

    const canonicalMappingSeed = normalizeChatId(input.canonicalContactId);
    const mappingAliases = [
      ...((input.contactAliases ?? [])
        .map((value) => normalizeChatId(value))
        .filter((value): value is string => Boolean(value) && !value.endsWith('@lid'))),
      ...(canonicalMappingSeed && !canonicalMappingSeed.endsWith('@lid') ? [canonicalMappingSeed] : []),
      ...(input.contactPhone && input.contactPhone.trim().length > 0 ? [input.contactPhone] : [])
    ];

    const aliasCandidates = new Set<string>([
      ...explicitAliases,
      ...buildMessagingAliasCandidates(mappingAliases)
    ]);
    const phoneDigits = normalizePhoneDigits(input.contactPhone);
    const orClauses: Array<Record<string, unknown>> = [
      {
        contactId: {
          $in: Array.from(aliasCandidates)
        }
      },
      {
        'metadata.messagingCanonicalContactId': canonicalContactId
      },
      {
        'metadata.messagingChatId': {
          $in: Array.from(aliasCandidates)
        }
      },
      {
        'metadata.messagingAliases': {
          $in: Array.from(aliasCandidates)
        }
      }
    ];

    if (phoneDigits) {
      orClauses.push({
        contactPhone: {
          $regex: phoneDigits
        }
      });
    }

    const conversations = await ConversationModel.find({
      agencyId: input.agencyId,
      tenantId: input.tenantId,
      $or: orClauses
    }).sort({ updatedAt: -1 }).exec();

    const canonicalConversation = conversations.find((conversation) => conversation.contactId === canonicalContactId);
    const selectedConversation = canonicalConversation ?? conversations[0] ?? new ConversationModel({
      agencyId: input.agencyId,
      tenantId: input.tenantId,
      contactId: canonicalContactId,
      status: 'open',
      unreadCount: 0
    });

    if (selectedConversation.contactId !== canonicalContactId) {
      selectedConversation.contactId = canonicalContactId;
    }

    const metadata = selectedConversation.metadata && typeof selectedConversation.metadata === 'object' && !Array.isArray(selectedConversation.metadata)
      ? selectedConversation.metadata as Record<string, unknown>
      : {};
    const metadataAliases = Array.isArray(metadata.messagingAliases)
      ? metadata.messagingAliases.filter((value): value is string => typeof value === 'string')
      : [];
    selectedConversation.metadata = {
      ...metadata,
      messagingCanonicalContactId: canonicalContactId,
      messagingChatId: normalizeChatId(input.rawContactId ?? input.contactId) ?? canonicalContactId,
      messagingAliases: Array.from(new Set([...metadataAliases, ...aliasCandidates]))
    };

    // Deduplicate and canonicalize related conversations
    await ConversationModel.updateMany(
      {
        agencyId: input.agencyId,
        tenantId: input.tenantId,
        _id: { $ne: selectedConversation._id },
        $or: [
          { contactId: { $in: Array.from(aliasCandidates) } },
          { 'metadata.messagingChatId': { $in: Array.from(aliasCandidates) } },
          { 'metadata.messagingAliases': { $in: Array.from(aliasCandidates) } },
          { 'metadata.messagingCanonicalContactId': canonicalContactId }
        ]
      },
      {
        $set: {
          'metadata.messagingCanonicalContactId': canonicalContactId,
          'metadata.messagingAliases': Array.from(aliasCandidates)
        }
      }
    ).exec();

    if (input.contactName && input.contactName.trim().length > 0) {
      selectedConversation.contactName = input.contactName;
    }

    if (input.contactPhone && input.contactPhone.trim().length > 0) {
      selectedConversation.contactPhone = input.contactPhone;
    }

    await selectedConversation.save();
    return selectedConversation;
  }

  async recordMessage(input: AddMessageInput): Promise<{ conversation: { _id: unknown }; message: { _id: unknown; deliveryStatus: string | null } }> {
    const content = input.content?.trim() ?? '';
    const attachments = input.attachments ?? [];

    if (content.length === 0 && attachments.length === 0) {
      throw new Error('Inbox message requires content or attachments');
    }

    const conversationSummary = content.length > 0 ? content : summarizeAttachments(attachments);

    const canonicalContactId = normalizeChatId(input.canonicalContactId ?? input.contactId) ?? input.contactId;
    const conversation = await this.upsertConversationIdentity(input);

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
      contactId: canonicalContactId,
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
