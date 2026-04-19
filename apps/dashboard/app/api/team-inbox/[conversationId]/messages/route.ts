import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import {
  INTERNAL_INBOX_IDEMPOTENCY_HEADER,
  InternalInboxSendAttachmentSchema,
  InternalInboxSendMessageResponseSchema,
  type InternalInboxSendAttachment,
  WORKFLOW_ENGINE_INTERNAL_PSK_HEADER
} from '@noxivo/contracts';
import { ConversationModel, MessageModel } from '@noxivo/database';
import dbConnect from '../../../../../lib/mongodb';
import { getCurrentSession } from '../../../../../lib/auth/session';
import { broadcastInboxEvent } from '../../../../../lib/inbox-events';
import { syncInboxState } from '../../../../../lib/team-inbox-sync';
import { engineClient } from '../../../../../lib/api/engine-client';
import { resolveActorTenantCandidates, resolveActorTenantId } from '../../../../../lib/auth/tenant-context';

type DashboardInboxSendBody = {
  content?: string;
  attachments: InternalInboxSendAttachment[];
  replyToMessageId?: string;
  to?: string;
};

type MessageCursorPayload = {
  ts: string;
  id: string;
};

type ConversationWithMetadata = {
  _id: mongoose.Types.ObjectId;
  contactId: string;
  contactName?: string | null;
  contactPhone?: string | null;
  tenantId: mongoose.Types.ObjectId;
  lastMessageContent?: string | null;
  lastMessageAt?: Date | null;
  metadata?: Record<string, unknown> | null;
};

type ResolvedRecipient = {
  chatId: string;
  contactPicture: string | null;
  contactName: string | null;
};

type DirectMessagingMessage = {
  id: string;
  fromMe: boolean;
  body: string | null;
  timestamp: number;
  ack: number;
  ackName: 'ERROR' | 'PENDING' | 'SERVER' | 'DEVICE' | 'READ' | 'PLAYED';
  hasMedia: boolean;
  media: {
    url: string;
    mimetype: string;
    filename: string | null;
  } | null;
};

function mergeDirectMessagingMessages(
  current: Map<string, DirectMessagingMessage>,
  incoming: DirectMessagingMessage[]
): void {
  for (const message of incoming) {
    const messageId = message.id.trim();
    if (messageId.length === 0) {
      continue;
    }

    const existing = current.get(messageId);
    if (!existing || message.timestamp > existing.timestamp) {
      current.set(messageId, message);
    }
  }
}

function mapMessageForResponse(message: {
  _id: { toString(): string };
  role: 'user' | 'assistant' | 'system';
  content: string;
  deliveryStatus: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'revoked' | null | undefined;
  providerAck: number | null | undefined;
  providerAckName: string | null | undefined;
  providerMessageId: string | null | undefined;
  replyToMessageId: string | null | undefined;
  metadata: Record<string, unknown> | null | undefined;
  error: string | null | undefined;
  attachments: InternalInboxSendAttachment[] | undefined;
  timestamp: Date;
}) {
  return {
    _id: message._id.toString(),
    role: message.role,
    content: message.content,
    deliveryStatus: message.deliveryStatus ?? 'queued',
    providerAck: message.providerAck ?? null,
    providerAckName: message.providerAckName ?? null,
    providerMessageId: message.providerMessageId ?? null,
    replyToMessageId: message.replyToMessageId ?? null,
    metadata: message.metadata ?? {},
    messageSource: typeof message.metadata?.source === 'string' ? message.metadata.source : null,
    error: message.error ?? null,
    attachments: message.attachments ?? [],
    createdAt: message.timestamp.toISOString()
  };
}

type MappedInboxMessage = ReturnType<typeof mapMessageForResponse>;

function toCreatedAtMillis(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeMappedInboxMessages(current: MappedInboxMessage, incoming: MappedInboxMessage): MappedInboxMessage {
  const incomingIsNewer = toCreatedAtMillis(incoming.createdAt) >= toCreatedAtMillis(current.createdAt);
  const preferred = incomingIsNewer ? incoming : current;
  const fallback = incomingIsNewer ? current : incoming;

  return {
    ...fallback,
    ...preferred,
    content: preferred.content.length > 0 ? preferred.content : fallback.content,
    deliveryStatus: preferred.deliveryStatus ?? fallback.deliveryStatus,
    providerAck: preferred.providerAck ?? fallback.providerAck,
    providerAckName: preferred.providerAckName ?? fallback.providerAckName,
    providerMessageId: preferred.providerMessageId ?? fallback.providerMessageId,
    replyToMessageId: preferred.replyToMessageId ?? fallback.replyToMessageId,
    messageSource: preferred.messageSource ?? fallback.messageSource,
    error: preferred.error ?? fallback.error,
    attachments: preferred.attachments.length > 0 ? preferred.attachments : fallback.attachments
  };
}

function dedupeMappedInboxMessages(messages: MappedInboxMessage[]): MappedInboxMessage[] {
  const deduped: MappedInboxMessage[] = [];
  const indexByMessageId = new Map<string, number>();
  const indexByProviderMessageId = new Map<string, number>();

  for (const message of messages) {
    const normalizedProviderMessageId = message.providerMessageId?.trim() ?? '';
    const existingIndex = indexByMessageId.get(message._id)
      ?? (normalizedProviderMessageId.length > 0 ? indexByProviderMessageId.get(normalizedProviderMessageId) : undefined);

    if (existingIndex === undefined) {
      const nextIndex = deduped.length;
      deduped.push(message);
      indexByMessageId.set(message._id, nextIndex);
      if (normalizedProviderMessageId.length > 0) {
        indexByProviderMessageId.set(normalizedProviderMessageId, nextIndex);
      }
      continue;
    }

    const current = deduped[existingIndex];
    if (!current) {
      continue;
    }

    const merged = mergeMappedInboxMessages(current, message);
    deduped[existingIndex] = merged;
    indexByMessageId.set(merged._id, existingIndex);

    const mergedProviderMessageId = merged.providerMessageId?.trim() ?? '';
    if (mergedProviderMessageId.length > 0) {
      indexByProviderMessageId.set(mergedProviderMessageId, existingIndex);
    }
  }

  return deduped;
}

function buildConversationPreviewMessage(conversation: {
  _id: mongoose.Types.ObjectId;
  lastMessageContent?: string | null;
  lastMessageAt?: Date | null;
  metadata?: Record<string, unknown> | null;
}) {
  const content = conversation.lastMessageContent?.trim();
  const createdAt = conversation.lastMessageAt instanceof Date ? conversation.lastMessageAt : null;

  if (!content || !createdAt || Number.isNaN(createdAt.getTime())) {
    return null;
  }

  const metadata = conversation.metadata ?? {};
  const fromMe = metadata.lastMessageFromMe === true;

  return {
    _id: `preview-${conversation._id.toString()}`,
    role: fromMe ? 'assistant' : 'user',
    content,
    deliveryStatus: fromMe ? 'sent' : 'read',
    providerAck: null,
    providerAckName: null,
    providerMessageId: null,
    replyToMessageId: null,
    metadata: { source: 'conversation-preview-fallback' },
    messageSource: 'conversation-preview-fallback',
    error: null,
    attachments: [],
    createdAt: createdAt.toISOString()
  } as const;
}

function mapMessagingAckToDeliveryStatus(ack: number): 'queued' | 'sent' | 'delivered' | 'read' | 'failed' {
  switch (ack) {
    case -1:
      return 'failed';
    case 1:
      return 'sent';
    case 2:
      return 'delivered';
    case 3:
    case 4:
      return 'read';
    case 0:
    default:
      return 'queued';
  }
}

function mapMimeTypeToAttachmentKind(mimeType: string): 'image' | 'video' | 'audio' | 'document' {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }
  return 'document';
}

function encodeMessageCursor(message: { _id: { toString(): string }; timestamp: Date }): string {
  const payload: MessageCursorPayload = {
    ts: message.timestamp.toISOString(),
    id: message._id.toString()
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeMessageCursor(rawCursor: string): MessageCursorPayload | null {
  try {
    const decoded = Buffer.from(rawCursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as Partial<MessageCursorPayload>;

    if (typeof parsed.ts !== 'string' || typeof parsed.id !== 'string') {
      return null;
    }

    const timestamp = new Date(parsed.ts);
    if (Number.isNaN(timestamp.getTime()) || !mongoose.Types.ObjectId.isValid(parsed.id)) {
      return null;
    }

    return {
      ts: timestamp.toISOString(),
      id: parsed.id
    };
  } catch {
    return null;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePositiveInt(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const rounded = Math.trunc(parsed);
  return Math.max(min, Math.min(max, rounded));
}

function extractDirectMessagingMessageId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const serialized = (value as { _serialized?: unknown })._serialized;
  return typeof serialized === 'string' && serialized.trim().length > 0
    ? serialized.trim()
    : null;
}

function normalizeChatIdCandidates(contactId: string): string[] {
  const normalized = contactId.trim();
  if (normalized.length === 0) {
    return [];
  }

  const candidates = new Set<string>([normalized]);
  const [localPart] = normalized.split('@');

  const digits = normalized.replace(/\D/g, '');
  if (digits.length > 0) {
    candidates.add(digits);
    candidates.add(`${digits}@c.us`);
    candidates.add(`${digits}@s.whatsapp.net`);
    candidates.add(`${digits}@lid`);
  }

  if (localPart && localPart !== digits && digits.length > 0) {
    candidates.add(`${localPart}@c.us`);
    candidates.add(`${localPart}@lid`);
  }

  return Array.from(candidates);
}

function extractMetadataMessagingChatCandidatesFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): string[] {
  const metadataRecord = metadata ?? {};
  const candidates = new Set<string>();

  const messagingChatId = typeof metadataRecord.messagingChatId === 'string' ? metadataRecord.messagingChatId.trim() : '';
  if (messagingChatId.length > 0) {
    candidates.add(messagingChatId);
  }

  const legacyEngineConversationId = typeof metadataRecord.engineConversationId === 'string'
    ? metadataRecord.engineConversationId.trim()
    : '';
  if (legacyEngineConversationId.length > 0 && !mongoose.Types.ObjectId.isValid(legacyEngineConversationId)) {
    candidates.add(legacyEngineConversationId);
  }

  return Array.from(candidates);
}

function extractMetadataMessagingChatCandidates(conversation: ConversationWithMetadata): string[] {
  const metadata = conversation.metadata
    && typeof conversation.metadata === 'object'
    && !Array.isArray(conversation.metadata)
    ? conversation.metadata as Record<string, unknown>
    : null;

  return extractMetadataMessagingChatCandidatesFromMetadata(metadata);
}

function sameContactIdentity(leftContactId: string, rightContactId: string): boolean {
  const left = leftContactId.trim().toLowerCase();
  const right = rightContactId.trim().toLowerCase();

  if (left === right) {
    return true;
  }

  const [leftLocal] = left.split('@');
  const [rightLocal] = right.split('@');
  if (!leftLocal || !rightLocal) {
    return false;
  }

  const leftDigits = leftLocal.replace(/\D/g, '');
  const rightDigits = rightLocal.replace(/\D/g, '');
  if (leftDigits.length > 0 && rightDigits.length > 0) {
    return leftDigits === rightDigits;
  }

  return leftLocal === rightLocal;
}

async function resolveHistoryConversationIds(input: {
  agencyId: string;
  tenantId: string;
  conversation: ConversationWithMetadata;
}): Promise<mongoose.Types.ObjectId[]> {
  const ids = new Map<string, mongoose.Types.ObjectId>([
    [input.conversation._id.toString(), input.conversation._id]
  ]);

  const normalizedContactId = input.conversation.contactId.trim();
  const [localPartRaw] = normalizedContactId.split('@');
  const localPart = localPartRaw?.trim() ?? '';
  const digits = localPart.replace(/\D/g, '');

  const orClauses: Array<Record<string, unknown>> = [];

  if (localPart.length > 0) {
    orClauses.push({
      contactId: {
        $regex: `^${escapeRegex(localPart)}@`,
        $options: 'i'
      }
    });
  }

  if (digits.length > 0) {
    orClauses.push({
      contactId: {
        $regex: `^(?:\\+)?${escapeRegex(digits)}(?:@|$)`,
        $options: 'i'
      }
    });
    orClauses.push({
      contactPhone: {
        $regex: escapeRegex(digits)
      }
    });
  }

  if (orClauses.length === 0) {
    return Array.from(ids.values());
  }

  const relatedConversations = await ConversationModel.find({
    agencyId: input.agencyId,
    tenantId: new mongoose.Types.ObjectId(input.tenantId),
    _id: { $ne: input.conversation._id },
    $or: orClauses
  }).select({ _id: 1 }).lean();

  for (const relatedConversation of relatedConversations) {
    ids.set(relatedConversation._id.toString(), relatedConversation._id);
  }

  // For opaque LID identities, digits-based matching is not reliable.
  // Resolve canonical contact identity from MessagingProvider and merge sibling threads when needed.
  if (ids.size === 1) {
    const metadata = input.conversation.metadata
      && typeof input.conversation.metadata === 'object'
      && !Array.isArray(input.conversation.metadata)
      ? input.conversation.metadata
      : null;
    const metadataMessagingChatId = typeof metadata?.messagingChatId === 'string'
      ? metadata.messagingChatId.trim()
      : '';
    const lidCandidate = normalizedContactId.endsWith('@lid')
      ? normalizedContactId
      : metadataMessagingChatId.endsWith('@lid')
        ? metadataMessagingChatId
        : '';

    if (lidCandidate.length > 0) {
      const resolvedCandidates = await resolveLidHistoryCandidates({
        agencyId: input.agencyId,
        tenantId: input.tenantId,
        lidChatId: lidCandidate
      });

      if (resolvedCandidates.chatIds.length > 0 || resolvedCandidates.phoneDigits.length > 0) {
        const extraOrClauses: Array<Record<string, unknown>> = [];

        if (resolvedCandidates.chatIds.length > 0) {
          extraOrClauses.push({
            contactId: {
              $in: resolvedCandidates.chatIds
            }
          });
        }

        for (const candidateDigits of resolvedCandidates.phoneDigits) {
          extraOrClauses.push({
            contactPhone: {
              $regex: escapeRegex(candidateDigits)
            }
          });
          extraOrClauses.push({
            contactId: {
              $regex: `^(?:\\+)?${escapeRegex(candidateDigits)}(?:@|$)`,
              $options: 'i'
            }
          });
        }

        if (extraOrClauses.length > 0) {
          const relatedByLidResolution = await ConversationModel.find({
            agencyId: input.agencyId,
            tenantId: new mongoose.Types.ObjectId(input.tenantId),
            _id: { $ne: input.conversation._id },
            $or: extraOrClauses
          }).select({ _id: 1 }).lean();

          for (const relatedConversation of relatedByLidResolution) {
            ids.set(relatedConversation._id.toString(), relatedConversation._id);
          }
        }
      }
    }
  }

  return Array.from(ids.values());
}

function parseDashboardInboxSendBody(value: unknown): DashboardInboxSendBody | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const content = typeof record.content === 'string' ? record.content.trim() : undefined;
  const replyToMessageId = typeof record.replyToMessageId === 'string' && record.replyToMessageId.trim().length > 0
    ? record.replyToMessageId.trim()
    : undefined;
  const to = typeof record.to === 'string' && record.to.trim().length > 0
    ? record.to.trim()
    : undefined;

  const rawAttachments = Array.isArray(record.attachments) ? record.attachments : [];

  if (rawAttachments.length > 10) {
    return null;
  }

  const attachments: InternalInboxSendAttachment[] = [];

  for (const rawAttachment of rawAttachments) {
    const parsedAttachment = InternalInboxSendAttachmentSchema.safeParse(rawAttachment);

    if (!parsedAttachment.success) {
      return null;
    }

    attachments.push(parsedAttachment.data);
  }

  if ((!content || content.length === 0) && attachments.length === 0) {
    return null;
  }

  return {
    ...(content ? { content } : {}),
    attachments,
    ...(replyToMessageId ? { replyToMessageId } : {}),
    ...(to ? { to } : {})
  };
}

function resolveSessionNameFromBinding(binding: { id?: string; name?: string } | null): string | null {
  const name = typeof binding?.name === 'string' ? binding.name.trim() : '';
  if (name.length > 0) {
    return name;
  }

  const id = typeof binding?.id === 'string' ? binding.id.trim() : '';
  if (id.length > 0 && !mongoose.Types.ObjectId.isValid(id)) {
    return id;
  }

  return null;
}

async function resolveLidHistoryCandidates(input: {
  agencyId: string;
  tenantId: string;
  lidChatId: string;
}): Promise<{ chatIds: string[]; phoneDigits: string[] }> {
  const normalizedLid = input.lidChatId.trim().toLowerCase();
  if (!normalizedLid.endsWith('@lid')) {
    return {
      chatIds: [],
      phoneDigits: []
    };
  }

  const binding = await engineClient
    .getSessionByTenant(input.agencyId, input.tenantId)
    .catch(() => null);
  const resolvedSessionName = resolveSessionNameFromBinding(binding)
    ?? ((process.env.MessagingProvider_DEFAULT_SESSION ?? '').trim() || null);

  if (!resolvedSessionName) {
    return {
      chatIds: [],
      phoneDigits: []
    };
  }

  const contactPayload = await engineClient
    .proxyMessaging<unknown>({
      path: `${encodeURIComponent(resolvedSessionName)}/contacts/${encodeURIComponent(normalizedLid)}`,
      method: 'GET'
    })
    .catch(() => null);

  if (!contactPayload || typeof contactPayload !== 'object' || Array.isArray(contactPayload)) {
    return {
      chatIds: [],
      phoneDigits: []
    };
  }

  const record = contactPayload as Record<string, unknown>;
  const chatIds = new Set<string>([normalizedLid]);
  const phoneDigits = new Set<string>();

  const resolvedContactId = typeof record.id === 'string' && record.id.trim().length > 0
    ? record.id.trim().toLowerCase()
    : '';
  if (resolvedContactId.length > 0) {
    chatIds.add(resolvedContactId);
    for (const candidate of normalizeChatIdCandidates(resolvedContactId)) {
      chatIds.add(candidate.toLowerCase());
    }
  }

  const resolvedNumber = typeof record.number === 'string'
    ? record.number.replace(/\D/g, '')
    : '';
  if (resolvedNumber.length > 0) {
    phoneDigits.add(resolvedNumber);
    for (const candidate of normalizeChatIdCandidates(resolvedNumber)) {
      chatIds.add(candidate.toLowerCase());
    }
  }

  return {
    chatIds: Array.from(chatIds),
    phoneDigits: Array.from(phoneDigits)
  };
}

function extractContactPictureFromRecord(record: Record<string, unknown>): string | null {
  const candidates = [
    record.profilePictureURL,
    record.profilePicture,
    record.profilePicUrl,
    record.picture,
    record.avatarUrl
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

async function resolveSendRecipient(input: {
  agencyId: string;
  tenantId: string;
  fallbackRecipient: string;
  conversation: ConversationWithMetadata | null;
}): Promise<ResolvedRecipient> {
  const candidates = new Set<string>();
  const pushCandidate = (value: string | null | undefined) => {
    const normalized = value?.trim();
    if (!normalized) {
      return;
    }
    candidates.add(normalized);
  };

  if (input.conversation) {
    for (const chatId of extractMetadataMessagingChatCandidates(input.conversation)) {
      pushCandidate(chatId);
    }
    pushCandidate(input.conversation.contactId);
    for (const chatId of normalizeChatIdCandidates(input.conversation.contactId)) {
      pushCandidate(chatId);
    }
    for (const chatId of normalizeChatIdCandidates(input.conversation.contactPhone ?? '')) {
      pushCandidate(chatId);
    }
  }

  pushCandidate(input.fallbackRecipient);
  const primaryRecipient = Array.from(candidates)[0] ?? input.fallbackRecipient;
  const normalizedPrimaryRecipient = primaryRecipient.trim();

  if (!normalizedPrimaryRecipient.endsWith('@lid')) {
    return {
      chatId: normalizedPrimaryRecipient,
      contactPicture: null,
      contactName: null
    };
  }

  const binding = await engineClient
    .getSessionByTenant(input.agencyId, input.tenantId)
    .catch(() => null);
  const resolvedSessionName = resolveSessionNameFromBinding(binding)
    ?? ((process.env.MessagingProvider_DEFAULT_SESSION ?? '').trim() || null);

  if (!resolvedSessionName) {
    return {
      chatId: normalizedPrimaryRecipient,
      contactPicture: null,
      contactName: null
    };
  }

  const contactPayload = await engineClient
    .proxyMessaging<unknown>({
      path: `${encodeURIComponent(resolvedSessionName)}/contacts/${encodeURIComponent(normalizedPrimaryRecipient)}`,
      method: 'GET'
    })
    .catch(() => null);

  if (!contactPayload || typeof contactPayload !== 'object' || Array.isArray(contactPayload)) {
    return {
      chatId: normalizedPrimaryRecipient,
      contactPicture: null,
      contactName: null
    };
  }

  const record = contactPayload as Record<string, unknown>;
  const normalizedNumber = typeof record.number === 'string'
    ? record.number.replace(/\D/g, '')
    : '';
  const resolvedContactId = typeof record.id === 'string' && record.id.trim().length > 0
    ? record.id.trim()
    : normalizedNumber.length > 0
      ? `${normalizedNumber}@c.us`
      : normalizedPrimaryRecipient;

  const resolvedContactName = typeof record.name === 'string' && record.name.trim().length > 0
    ? record.name.trim()
    : typeof record.pushName === 'string' && record.pushName.trim().length > 0
      ? record.pushName.trim()
      : null;

  return {
    chatId: resolvedContactId,
    contactPicture: extractContactPictureFromRecord(record),
    contactName: resolvedContactName
  };
}

async function resolveEngineConversationId(
  agencyId: string,
  conversation: ConversationWithMetadata
): Promise<string | null> {
  const metadata = conversation.metadata ?? {};
  const metadataConversationId = typeof metadata.engineConversationId === 'string'
    ? metadata.engineConversationId.trim()
    : null;

  if (metadataConversationId && metadataConversationId.length > 0 && mongoose.Types.ObjectId.isValid(metadataConversationId)) {
    return metadataConversationId;
  }

  const pageLimit = 100;
  for (let page = 0; page < 5; page += 1) {
    const chats = await engineClient
      .getChats({
        tenantId: conversation.tenantId.toString(),
        limit: pageLimit,
        offset: page * pageLimit
      })
      .catch(() => []);

    if (!Array.isArray(chats) || chats.length === 0) {
      break;
    }

    const matchingChat = chats.find((chat) => sameContactIdentity(chat.contactId, conversation.contactId));
    if (matchingChat?.id) {
      await ConversationModel.updateOne(
        { _id: conversation._id, agencyId },
        { $set: { 'metadata.engineConversationId': matchingChat.id } }
      ).exec();
      return matchingChat.id;
    }

    if (chats.length < pageLimit) {
      break;
    }
  }

  await engineClient
    .getMessagingInboxChats({
      agencyId,
      tenantId: conversation.tenantId.toString(),
      limit: 50,
      offset: 0
    })
    .catch(() => null);

  const warmedChats = await engineClient
    .getChats({
      tenantId: conversation.tenantId.toString(),
      limit: pageLimit,
      offset: 0
    })
    .catch(() => []);

  if (Array.isArray(warmedChats)) {
    const matchingChat = warmedChats.find((chat) => sameContactIdentity(chat.contactId, conversation.contactId));
    if (matchingChat?.id) {
      await ConversationModel.updateOne(
        { _id: conversation._id, agencyId },
        { $set: { 'metadata.engineConversationId': matchingChat.id } }
      ).exec();
      return matchingChat.id;
    }
  }

  return null;
}

async function fetchDirectMessagingMessages(input: {
  agencyId: string;
  tenantId: string;
  chatId: string;
}): Promise<DirectMessagingMessage[]> {
  const DIRECT_PAGE_LIMIT = 20;
  const DIRECT_MAX_PAGES = 5;

  const binding = await engineClient
    .getSessionByTenant(input.agencyId, input.tenantId)
    .catch(() => null);

  // Fall back to MessagingProvider_DEFAULT_SESSION env var when the engine has no registered binding
  // for this tenant (e.g. dev environment where the session was created manually).
  const resolvedBindingName = typeof binding?.name === 'string' ? binding.name.trim() : '';
  const resolvedBindingId = typeof binding?.id === 'string' ? binding.id.trim() : '';
  const sessionId: string | null =
    (resolvedBindingName.length > 0
      ? resolvedBindingName
      : resolvedBindingId.length > 0 && !mongoose.Types.ObjectId.isValid(resolvedBindingId)
        ? resolvedBindingId
        : null)
    ?? ((process.env.MessagingProvider_DEFAULT_SESSION ?? '').trim() || null);

  if (!sessionId) {
    return [];
  }

  const extractPayloadMessages = (payload: unknown): unknown[] => {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const payloadRecord = payload as Record<string, unknown>;
    const directArrayCandidates = ['messages', 'data', 'results', 'items'] as const;

    for (const key of directArrayCandidates) {
      const candidate = payloadRecord[key];
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    const nestedData = payloadRecord.data;
    if (nestedData && typeof nestedData === 'object' && !Array.isArray(nestedData)) {
      const nestedMessages = (nestedData as Record<string, unknown>).messages;
      if (Array.isArray(nestedMessages)) {
        return nestedMessages;
      }
    }

    return [];
  };

  const mapPayloadToMessages = (payload: unknown): DirectMessagingMessage[] => {
    return extractPayloadMessages(payload).flatMap((rawMessage) => {
      if (!rawMessage || typeof rawMessage !== 'object' || Array.isArray(rawMessage)) {
        return [];
      }

      const record = rawMessage as {
        id?: unknown;
        fromMe?: unknown;
        body?: unknown;
        timestamp?: unknown;
        messageTimestamp?: unknown;
        ack?: unknown;
        ackName?: unknown;
        hasMedia?: unknown;
        media?: { url?: unknown; mimetype?: unknown; filename?: unknown } | null;
      };

      const messageId = extractDirectMessagingMessageId(record.id);
      if (!messageId) {
        return [];
      }

      const mediaUrl = typeof record.media?.url === 'string' ? record.media.url : null;
      const mediaMimeType = typeof record.media?.mimetype === 'string' ? record.media.mimetype : null;

      return [{
        id: messageId,
        fromMe: record.fromMe === true,
        body: typeof record.body === 'string' ? record.body : null,
        timestamp: typeof record.messageTimestamp === 'number'
          ? record.messageTimestamp
          : typeof record.timestamp === 'number'
            ? record.timestamp
            : Math.floor(Date.now() / 1000),
        ack: typeof record.ack === 'number' ? record.ack : 0,
        ackName: (
          record.ackName === 'ERROR'
          || record.ackName === 'SERVER'
          || record.ackName === 'DEVICE'
          || record.ackName === 'READ'
          || record.ackName === 'PLAYED'
        )
          ? record.ackName
          : 'PENDING',
        hasMedia: record.hasMedia === true && Boolean(mediaUrl && mediaMimeType),
        media: mediaUrl && mediaMimeType
          ? {
              url: mediaUrl,
              mimetype: mediaMimeType,
              filename: typeof record.media?.filename === 'string'
                ? record.media.filename
                : null
            }
          : null
      }];
    });
  };

  const createProxyQuery = (offset: number): Record<string, string> => ({
    // MessagingProvider WEBJS can fail on larger limits for some @lid chats; keep direct recovery conservative.
    limit: String(DIRECT_PAGE_LIMIT),
    sortOrder: 'desc',
    downloadMedia: 'true',
    merge: 'true',
    ...(offset > 0 ? { offset: String(offset) } : {})
  });

  const fetchMessagesPageForChatId = async (
    chatId: string,
    offset: number
  ): Promise<DirectMessagingMessage[] | null> => {
    const proxyQuery = createProxyQuery(offset);
    const modernPayload = await engineClient
      .proxyMessaging<unknown>({
        path: `${encodeURIComponent(sessionId)}/chats/${encodeURIComponent(chatId)}/messages`,
        method: 'GET',
        query: proxyQuery
      })
      .catch(() => null);

    const modernMessages = mapPayloadToMessages(modernPayload);
    if (modernMessages.length > 0) {
      return modernMessages;
    }

    // Legacy /api/messages fallback for the engine proxy path.
    const legacyPayload = await engineClient
      .proxyMessaging<unknown>({
        path: 'messages',
        method: 'GET',
        query: {
          session: sessionId,
          chatId,
          ...proxyQuery
        }
      })
      .catch(() => null);

    const legacyMessages = mapPayloadToMessages(legacyPayload);
    if (legacyMessages.length > 0) {
      return legacyMessages;
    }

    return modernPayload === null && legacyPayload === null ? null : [];
  };

  const fetchMessagesForChatId = async (chatId: string): Promise<DirectMessagingMessage[] | null> => {
    const mergedMessages = new Map<string, DirectMessagingMessage>();
    let reachedProvider = false;

    for (let pageIndex = 0; pageIndex < DIRECT_MAX_PAGES; pageIndex += 1) {
      const offset = pageIndex * DIRECT_PAGE_LIMIT;
      const pageMessages = await fetchMessagesPageForChatId(chatId, offset);

      if (pageMessages === null) {
        if (!reachedProvider) {
          return null;
        }
        break;
      }

      reachedProvider = true;

      if (pageMessages.length === 0) {
        break;
      }

      const beforeMergeCount = mergedMessages.size;
      mergeDirectMessagingMessages(mergedMessages, pageMessages);

      const addedMessages = mergedMessages.size - beforeMergeCount;
      if (pageMessages.length < DIRECT_PAGE_LIMIT || addedMessages === 0) {
        break;
      }
    }

    return Array.from(mergedMessages.values());
  };

  const attemptedChatIds = new Set<string>();
  const tryChatId = async (chatId: string): Promise<DirectMessagingMessage[] | null> => {
    const normalizedChatId = chatId.trim();
    if (normalizedChatId.length === 0 || attemptedChatIds.has(normalizedChatId)) {
      return null;
    }
    attemptedChatIds.add(normalizedChatId);
    return fetchMessagesForChatId(normalizedChatId);
  };

  const mergedMessages = new Map<string, DirectMessagingMessage>();
  const directMessages = await tryChatId(input.chatId);
  if (Array.isArray(directMessages) && directMessages.length > 0) {
    mergeDirectMessagingMessages(mergedMessages, directMessages);
  }

  // Some MessagingProvider/WebJS builds return 500 for @lid chat history requests. Resolve contact to @c.us and retry.
  if (input.chatId.endsWith('@lid')) {
    const contactPayload = await engineClient
      .proxyMessaging<unknown>({
        path: `${encodeURIComponent(sessionId)}/contacts/${encodeURIComponent(input.chatId)}`,
        method: 'GET'
      })
      .catch(() => null);

    if (contactPayload && typeof contactPayload === 'object' && !Array.isArray(contactPayload)) {
      const record = contactPayload as { id?: unknown; number?: unknown };
      const fallbackChatCandidates = new Set<string>();

      if (typeof record.id === 'string' && record.id.trim().length > 0) {
        fallbackChatCandidates.add(record.id.trim());
      }

      if (typeof record.number === 'string' && record.number.trim().length > 0) {
        const number = record.number.replace(/\D/g, '');
        if (number.length > 0) {
          fallbackChatCandidates.add(`${number}@c.us`);
        }
      }

      for (const fallbackChatId of fallbackChatCandidates) {
        const fallbackMessages = await tryChatId(fallbackChatId);
        if (Array.isArray(fallbackMessages) && fallbackMessages.length > 0) {
          mergeDirectMessagingMessages(mergedMessages, fallbackMessages);
        }
      }
    }
  }

  if (mergedMessages.size > 0) {
    return Array.from(mergedMessages.values());
  }

  if (Array.isArray(directMessages)) {
    return [];
  }

  return [];
}

async function backfillConversationMessagesFromEngine(
  agencyId: string,
  conversation: ConversationWithMetadata,
  relatedConversationIds: mongoose.Types.ObjectId[] = [conversation._id],
  recoveryTarget = 20
): Promise<void> {
  const engineConversationId = await resolveEngineConversationId(agencyId, conversation);

  const tenantId = conversation.tenantId.toString();
  let sourceMessages: DirectMessagingMessage[] = [];

  const fetchPrimaryDirectMessages = async (): Promise<DirectMessagingMessage[]> => {
    const mergedMessages = new Map<string, DirectMessagingMessage>();
    const primaryChatCandidates = [
      conversation.contactId.trim(),
      ...(conversation.contactPhone ? [`${conversation.contactPhone.replace(/\D/g, '')}@lid`] : []),
      ...normalizeChatIdCandidates(conversation.contactId),
      ...normalizeChatIdCandidates(conversation.contactPhone ?? '')
    ];
    const seenCandidates = new Set<string>();

    for (const chatId of primaryChatCandidates) {
      const normalizedChatId = chatId.trim();
      if (normalizedChatId.length === 0 || seenCandidates.has(normalizedChatId)) {
        continue;
      }
      seenCandidates.add(normalizedChatId);

      const directMessages = await fetchDirectMessagingMessages({
        agencyId,
        tenantId,
        chatId: normalizedChatId
      });

      if (directMessages.length > 0) {
        mergeDirectMessagingMessages(mergedMessages, directMessages);
        if (mergedMessages.size >= recoveryTarget) {
          break;
        }
      }
    }

    return Array.from(mergedMessages.values());
  };

  const fetchDirectCandidateMessages = async (): Promise<DirectMessagingMessage[]> => {
    const relatedConversations = await ConversationModel.find({
      _id: { $in: relatedConversationIds },
      agencyId,
      tenantId: conversation.tenantId
    })
      .select({ contactId: 1, contactPhone: 1, metadata: 1 })
      .lean();

    const candidateConversations = relatedConversations.length > 0
      ? relatedConversations
      : [conversation];

    const chatCandidates = new Set<string>([
      ...(engineConversationId ? [engineConversationId] : [])
    ]);

    for (const candidateConversation of candidateConversations) {
      if (typeof candidateConversation.contactId === 'string') {
        for (const chatIdCandidate of normalizeChatIdCandidates(candidateConversation.contactId)) {
          chatCandidates.add(chatIdCandidate);
        }
      }

      if (typeof candidateConversation.contactPhone === 'string') {
        for (const chatIdCandidate of normalizeChatIdCandidates(candidateConversation.contactPhone)) {
          chatCandidates.add(chatIdCandidate);
        }
      }

      const candidateMetadata = candidateConversation.metadata
        && typeof candidateConversation.metadata === 'object'
        && !Array.isArray(candidateConversation.metadata)
        ? candidateConversation.metadata as Record<string, unknown>
        : null;

      for (const chatIdCandidate of extractMetadataMessagingChatCandidatesFromMetadata(candidateMetadata)) {
        chatCandidates.add(chatIdCandidate);
      }
    }

    const mergedMessages = new Map<string, DirectMessagingMessage>();

    for (const chatId of chatCandidates) {
      const directMessages = await fetchDirectMessagingMessages({
        agencyId,
        tenantId,
        chatId
      });

      if (directMessages.length > 0) {
        mergeDirectMessagingMessages(mergedMessages, directMessages);
      }
    }

    return Array.from(mergedMessages.values());
  };

  if (engineConversationId) {
    const pageLimit = 100;
    const maxPages = 5;
    const remoteResponse = await engineClient
      .getMessagingConversationMessages({
        agencyId,
        tenantId,
        conversationId: engineConversationId,
        limit: pageLimit,
        offset: 0,
        pages: maxPages
      })
      .catch(() => null);

    const remoteMessages: Array<{
      id: string;
      fromMe: boolean;
      body: string | null;
      timestamp: number;
      ack: number;
      ackName: 'ERROR' | 'PENDING' | 'SERVER' | 'DEVICE' | 'READ' | 'PLAYED';
      hasMedia: boolean;
      media: {
        url: string;
        mimetype: string;
        filename: string | null;
      } | null;
    }> = [];
    if (remoteResponse && Array.isArray(remoteResponse.messages)) {
      remoteMessages.push(...remoteResponse.messages);
    }

    if (remoteMessages.length > 0) {
      sourceMessages = remoteMessages.map((message) => ({
        id: message.id,
        fromMe: message.fromMe,
        body: message.body,
        timestamp: message.timestamp,
        ack: message.ack,
        ackName: message.ackName,
        hasMedia: message.hasMedia,
        media: message.media
      }));
    }
  }

  if (sourceMessages.length === 0) {
    const primaryDirectMessages = await fetchPrimaryDirectMessages();
    const merged = new Map<string, DirectMessagingMessage>();
    mergeDirectMessagingMessages(merged, primaryDirectMessages);
    if (merged.size < recoveryTarget) {
      const candidateDirectMessages = await fetchDirectCandidateMessages();
      mergeDirectMessagingMessages(merged, candidateDirectMessages);
    }
    sourceMessages = Array.from(merged.values());
  } else if (sourceMessages.length < recoveryTarget) {
    const primaryDirectMessages = await fetchPrimaryDirectMessages();
    const merged = new Map<string, DirectMessagingMessage>();
    mergeDirectMessagingMessages(merged, sourceMessages);
    mergeDirectMessagingMessages(merged, primaryDirectMessages);

    if (merged.size < recoveryTarget) {
      const candidateDirectMessages = await fetchDirectCandidateMessages();
      mergeDirectMessagingMessages(merged, candidateDirectMessages);
    }

    if (merged.size > sourceMessages.length) {
      sourceMessages = Array.from(merged.values());
    }
  }

  if (sourceMessages.length === 0) {
    return;
  }

  const operations = sourceMessages
    .filter((message) => typeof message.id === 'string' && message.id.length > 0)
    .map((message) => {
      const mediaUrl = typeof message.media?.url === 'string' ? message.media.url : null;
      const mediaMimeType = typeof message.media?.mimetype === 'string' ? message.media.mimetype : null;
      const attachments = message.hasMedia && mediaUrl && mediaMimeType
        ? [{
            kind: mapMimeTypeToAttachmentKind(mediaMimeType),
            url: mediaUrl,
            mimeType: mediaMimeType,
            fileName: message.media?.filename ?? null,
            caption: null
          }]
        : [];

      const timestamp = Number.isFinite(message.timestamp)
        ? new Date(message.timestamp * 1000)
        : new Date();

      return {
        filter: {
          conversationId: conversation._id,
          $or: [
            { providerMessageId: message.id },
            { messagingMessageId: message.id }
          ]
        },
        update: {
          $set: {
            role: message.fromMe ? 'assistant' : 'user',
            content: message.body ?? '',
            timestamp,
            providerMessageId: message.id,
            messagingMessageId: message.id,
            providerAck: message.ack,
            providerAckName: message.ackName,
            deliveryStatus: mapMessagingAckToDeliveryStatus(message.ack),
            attachments,
            metadata: {
              source: 'messaging-inbox-sync-fallback',
              syncedFrom: 'workflow-engine'
            }
          },
          $setOnInsert: {
            conversationId: conversation._id
          }
        }
      };
    });

  if (operations.length > 0) {
    await Promise.all(
      operations.map((operation) =>
        MessageModel.updateOne(operation.filter, operation.update, { upsert: true }).exec()
      )
    );
  }

  const latestMessage = sourceMessages.reduce((latest, message) => {
    if (!latest) {
      return message;
    }
    return message.timestamp > latest.timestamp ? message : latest;
  }, null as DirectMessagingMessage | null);

  if (latestMessage && Number.isFinite(latestMessage.timestamp)) {
    await ConversationModel.updateOne(
      { _id: conversation._id, agencyId },
      {
        $set: {
          lastMessageContent: latestMessage.body ?? '',
          lastMessageAt: new Date(latestMessage.timestamp * 1000)
        }
      }
    ).exec();
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> }
): Promise<Response> {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const requestedTenantId = resolveActorTenantId(session.actor);
  if (!requestedTenantId) {
    return NextResponse.json(
      { error: 'No tenant workspace available for this agency context' },
      { status: 409 }
    );
  }

  await dbConnect();
  const resolvedTenantCandidates = await resolveActorTenantCandidates(session.actor);
  const tenantCandidates = resolvedTenantCandidates.length > 0
    ? resolvedTenantCandidates
    : [requestedTenantId];
  const { searchParams } = new URL(request.url);
  const isPaginated = searchParams.get('paginated') === '1';
  const pageLimit = parsePositiveInt(searchParams.get('limit'), 20, 1, 100);
  const syncPages = parsePositiveInt(searchParams.get('syncPages'), isPaginated ? 3 : 1, 1, 20);
  const { conversationId } = await context.params;
  let conversation: ConversationWithMetadata | null = null;
  if (mongoose.Types.ObjectId.isValid(conversationId)) {
    conversation = await ConversationModel.findOne({
      _id: conversationId,
      agencyId: session.actor.agencyId,
      tenantId: { $in: tenantCandidates }
    }).lean() as ConversationWithMetadata | null;
  }

  if (!conversation) {
    conversation = await ConversationModel.findOne({
      agencyId: session.actor.agencyId,
      tenantId: { $in: tenantCandidates },
      'metadata.engineConversationId': conversationId
    }).lean() as ConversationWithMetadata | null;
  }

  if (!conversation) {
    return NextResponse.json([]);
  }

  const historyConversationIds = await resolveHistoryConversationIds({
    agencyId: session.actor.agencyId,
    tenantId: conversation.tenantId.toString(),
    conversation
  });

  // Fire sync best-effort — do NOT await; we don't want a slow remote engine to block the response
  void syncInboxState({
    agencyId: session.actor.agencyId,
    tenantId: conversation.tenantId.toString(),
    conversationId,
    limit: 20,
    pages: syncPages
  });

  if (!isPaginated) {
    let messages = await MessageModel.find({ conversationId: { $in: historyConversationIds } })
      .sort({ timestamp: 1 })
      .lean();

    if (messages.length === 0) {
      // Only block on backfill when the DB is truly empty for this conversation
      try {
        await backfillConversationMessagesFromEngine(
          session.actor.agencyId,
          conversation,
          historyConversationIds,
          20
        );
      } catch {
        // Backfill is best-effort. Return existing data instead of failing the route.
      }
      messages = await MessageModel.find({ conversationId: { $in: historyConversationIds } })
        .sort({ timestamp: 1 })
        .lean();
    } else if (messages.length <= 2) {
      // Sparse thread — kick off backfill async so next poll gets the history
      void backfillConversationMessagesFromEngine(
        session.actor.agencyId,
        conversation,
        historyConversationIds,
        20
      ).catch(() => undefined);
    }

    const mappedMessages = dedupeMappedInboxMessages(messages.map((message) => mapMessageForResponse({
      _id: message._id,
      role: message.role,
      content: message.content,
      deliveryStatus: message.deliveryStatus,
      providerAck: message.providerAck,
      providerAckName: message.providerAckName,
      providerMessageId: message.providerMessageId,
      replyToMessageId: message.replyToMessageId,
      metadata: message.metadata,
      error: message.error,
      attachments: message.attachments as InternalInboxSendAttachment[] | undefined,
      timestamp: message.timestamp
    })));

    if (mappedMessages.length === 0) {
      const previewMessage = buildConversationPreviewMessage({
        _id: conversation._id,
        lastMessageContent: conversation.lastMessageContent ?? null,
        lastMessageAt: conversation.lastMessageAt ?? null,
        metadata: conversation.metadata ?? {}
      });

      if (previewMessage) {
        return NextResponse.json([previewMessage]);
      }
    }

    return NextResponse.json(mappedMessages);
  }

  const cursorParam = searchParams.get('cursor');
  const decodedCursor = cursorParam ? decodeMessageCursor(cursorParam) : null;

  if (cursorParam && !decodedCursor) {
    return NextResponse.json({ error: 'Invalid messages cursor' }, { status: 400 });
  }

  const cursorTimestamp = decodedCursor ? new Date(decodedCursor.ts) : null;
  const cursorObjectId = decodedCursor ? new mongoose.Types.ObjectId(decodedCursor.id) : null;

  const readMessagePage = async () => {
    const messageFilter: Record<string, unknown> = {
      conversationId: { $in: historyConversationIds }
    };

    if (cursorTimestamp && cursorObjectId) {
      messageFilter.$or = [
        { timestamp: { $lt: cursorTimestamp } },
        { timestamp: cursorTimestamp, _id: { $lt: cursorObjectId } }
      ];
    }

    return MessageModel.find(messageFilter)
      .sort({ timestamp: -1, _id: -1 })
      .limit(pageLimit + 1)
      .lean();
  };

  let page = await readMessagePage();
  // Block on bounded recovery whenever the requested page is sparse so cursor pagination can keep walking older history.
  const shouldAttemptRecovery = syncPages > 1 && page.length < pageLimit;

  if (shouldAttemptRecovery) {
    try {
      await backfillConversationMessagesFromEngine(
        session.actor.agencyId,
        conversation,
        historyConversationIds,
        Math.max(pageLimit * 2, 20)
      );
    } catch {
      // Backfill is best-effort. Keep route healthy and return currently persisted page.
    }
    page = await readMessagePage();
  }

  if (!cursorParam && page.length === 0) {
    const previewMessage = buildConversationPreviewMessage({
      _id: conversation._id,
      lastMessageContent: conversation.lastMessageContent ?? null,
      lastMessageAt: conversation.lastMessageAt ?? null,
      metadata: conversation.metadata ?? {}
    });

    if (previewMessage) {
      return NextResponse.json({
        messages: [previewMessage],
        hasMore: false,
        nextCursor: null
      });
    }
  }

  const hasMore = page.length > pageLimit;
  const pageItems = hasMore ? page.slice(0, pageLimit) : page;
  const oldestPageItem = pageItems[pageItems.length - 1];
  const nextCursor = hasMore && oldestPageItem ? encodeMessageCursor({
    _id: oldestPageItem._id,
    timestamp: oldestPageItem.timestamp
  }) : null;

  const messages = dedupeMappedInboxMessages(pageItems
    .slice()
    .reverse()
    .map((message) => mapMessageForResponse({
      _id: message._id,
      role: message.role,
      content: message.content,
      deliveryStatus: message.deliveryStatus,
      providerAck: message.providerAck,
      providerAckName: message.providerAckName,
      providerMessageId: message.providerMessageId,
      replyToMessageId: message.replyToMessageId,
      metadata: message.metadata,
      error: message.error,
      attachments: message.attachments as InternalInboxSendAttachment[] | undefined,
      timestamp: message.timestamp
    })));

  return NextResponse.json({
    messages,
    hasMore,
    nextCursor
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> }
): Promise<Response> {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const requestedTenantId = resolveActorTenantId(session.actor);
  if (!requestedTenantId) {
    return NextResponse.json(
      { error: 'No tenant workspace available for this agency context' },
      { status: 409 }
    );
  }

  await dbConnect();
  const resolvedTenantCandidates = await resolveActorTenantCandidates(session.actor);
  const tenantCandidates = resolvedTenantCandidates.length > 0
    ? resolvedTenantCandidates
    : [requestedTenantId];
  const tenantId = tenantCandidates[0] ?? requestedTenantId;
  const { conversationId } = await context.params;
  const rawPayload = await request.json().catch(() => null);
  const parsedPayload = parseDashboardInboxSendBody(rawPayload);

  if (!parsedPayload) {
    return NextResponse.json({ error: 'Message content or attachments are required' }, { status: 400 });
  }

  const conversation = await ConversationModel.findOne({
    _id: conversationId,
    agencyId: session.actor.agencyId,
    tenantId: { $in: tenantCandidates }
  });
  const scopedTenantId = conversation ? conversation.tenantId.toString() : tenantId;

  if (!conversation && parsedPayload.attachments.length > 0) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  let messagePayload:
    | ReturnType<typeof mapMessageForResponse>
    | {
        _id: string;
        role: 'assistant';
        content: string;
        deliveryStatus: 'sent';
        providerAck: null;
        providerAckName: null;
        providerMessageId: string;
        replyToMessageId: string | null;
        metadata: Record<string, unknown>;
        messageSource: string;
        error: null;
        attachments: InternalInboxSendAttachment[];
        createdAt: string;
      };

  if (parsedPayload.attachments.length > 0) {
    const internalBaseUrl = process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL;
    const internalPsk = process.env.WORKFLOW_ENGINE_INTERNAL_PSK;

    if (!internalBaseUrl || !internalPsk) {
      return NextResponse.json({ error: 'Workflow engine internal send is not configured' }, { status: 500 });
    }

    const idempotencyKey = request.headers.get(INTERNAL_INBOX_IDEMPOTENCY_HEADER) ?? randomUUID();

    let internalResponse: Response;

    try {
      internalResponse = await fetch(
        `${internalBaseUrl.replace(/\/$/, '')}/v1/internal/inbox/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [WORKFLOW_ENGINE_INTERNAL_PSK_HEADER]: internalPsk,
            [INTERNAL_INBOX_IDEMPOTENCY_HEADER]: idempotencyKey
          },
          body: JSON.stringify({
            agencyId: session.actor.agencyId,
            tenantId: scopedTenantId,
            operatorUserId: session.actor.userId,
            content: parsedPayload.content,
            attachments: parsedPayload.attachments,
            replyToMessageId: parsedPayload.replyToMessageId
          })
        }
      );
    } catch {
      return NextResponse.json({ error: 'Failed to send message' }, { status: 502 });
    }

    if (!internalResponse.ok) {
      return NextResponse.json({ error: 'Failed to send message' }, { status: internalResponse.status });
    }

    const responsePayload = InternalInboxSendMessageResponseSchema.parse(await internalResponse.json());
    messagePayload = {
      _id: responsePayload._id,
      role: responsePayload.role,
      content: responsePayload.content,
      deliveryStatus: responsePayload.deliveryStatus ?? 'sent',
      providerAck: null,
      providerAckName: null,
      providerMessageId: responsePayload.messagingMessageId ?? responsePayload._id,
      replyToMessageId: parsedPayload.replyToMessageId ?? null,
      metadata: { source: 'dashboard.internal-inbox' },
      messageSource: 'dashboard.internal-inbox',
      error: null,
      attachments: responsePayload.attachments,
      createdAt: responsePayload.createdAt
    };
  } else {
    const fallbackRecipient = conversation?.contactId ?? parsedPayload.to;
    if (!fallbackRecipient) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const resolvedRecipient = await resolveSendRecipient({
      agencyId: session.actor.agencyId,
      tenantId: scopedTenantId,
      fallbackRecipient,
      conversation: conversation
        ? {
            _id: conversation._id,
            contactId: conversation.contactId,
            contactName: conversation.contactName ?? null,
            contactPhone: conversation.contactPhone ?? null,
            tenantId: conversation.tenantId,
            metadata: conversation.metadata as Record<string, unknown> | null
          }
        : null
    });

    let sendResponse: { id: string; status: string; timestamp: string };
    const sendStartedAt = new Date();

    try {
      sendResponse = await engineClient.sendMessage({
        to: resolvedRecipient.chatId,
        text: parsedPayload.content ?? '',
        agencyId: session.actor.agencyId,
        tenantId: scopedTenantId
      });
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('conversation not found')) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }
      if (error instanceof Error && error.message.toLowerCase().includes('unauthorized')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.json({ error: 'Failed to send message' }, { status: 502 });
    }

    if (conversation) {
      const metadataUpdate: Record<string, unknown> = {
        'metadata.messagingChatId': resolvedRecipient.chatId
      };
      if (resolvedRecipient.contactPicture) {
        metadataUpdate['metadata.contactPicture'] = resolvedRecipient.contactPicture;
      }
      if (resolvedRecipient.contactName && !conversation.contactName) {
        metadataUpdate.contactName = resolvedRecipient.contactName;
      }

      await ConversationModel.updateOne(
        { _id: conversation._id, agencyId: session.actor.agencyId },
        { $set: metadataUpdate }
      ).exec();
    }

    await syncInboxState({
      agencyId: session.actor.agencyId,
      tenantId: scopedTenantId,
      conversationId,
      limit: 20
    });

    const persistedMessage = await MessageModel.findOne({
      conversationId,
      role: 'assistant',
      timestamp: { $gte: new Date(sendStartedAt.getTime() - 30_000) }
    })
      .sort({ timestamp: -1 })
      .lean();

    if (persistedMessage) {
      messagePayload = mapMessageForResponse({
        _id: persistedMessage._id,
        role: persistedMessage.role,
        content: persistedMessage.content,
        deliveryStatus: persistedMessage.deliveryStatus,
        providerAck: persistedMessage.providerAck,
        providerAckName: persistedMessage.providerAckName,
        providerMessageId: persistedMessage.providerMessageId,
        replyToMessageId: persistedMessage.replyToMessageId,
        metadata: persistedMessage.metadata,
        error: persistedMessage.error,
        attachments: persistedMessage.attachments as InternalInboxSendAttachment[] | undefined,
        timestamp: persistedMessage.timestamp
      });
    } else {
      messagePayload = {
        _id: sendResponse.id,
        role: 'assistant',
        content: parsedPayload.content ?? '',
        deliveryStatus: 'sent',
        providerAck: null,
        providerAckName: null,
        providerMessageId: sendResponse.id,
        replyToMessageId: parsedPayload.replyToMessageId ?? null,
        metadata: { source: 'dashboard.engine-client' },
        messageSource: 'dashboard.engine-client',
        error: null,
        attachments: [],
        createdAt: sendResponse.timestamp
      };
    }
  }

  await broadcastInboxEvent(scopedTenantId, {
    type: 'message.created',
    conversationId: conversationId
  });

  return NextResponse.json(messagePayload);
}
