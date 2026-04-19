import { ConversationModel, MessageModel, MessagingClusterModel, MessagingSessionBindingModel } from '@noxivo/database';
import { InboxService, type AddMessageInput } from './inbox.service.js';
import { InboxEventsPublisher } from './inbox-events.publisher.js';
import { getConfiguredMessagingBaseUrl, normalizeMessagingBaseUrl } from '../../lib/messaging-base-url.js';
import { buildMessagingAliasCandidates, resolveMessagingContactIdentity } from './messaging-contact-identity.js';

type MessagingAttachmentKind = 'image' | 'video' | 'audio' | 'document';

type MessagingChatSummary = {
  id?: string;
  name?: string;
  lastMessage?: {
    id?: string;
    body?: string;
    timestamp?: number;
    fromMe?: boolean;
    source?: string;
  };
  picture?: string | null;
  _chat?: {
    unreadCount?: number;
  };
};

type MessagingMessagePayload = {
  id?: string | { _serialized?: string };
  from?: string;
  to?: string;
  fromMe?: boolean;
  body?: string;
  timestamp?: number;
  messageTimestamp?: number;
  ack?: number;
  ackName?: string;
  hasMedia?: boolean;
  media?: {
    url?: string;
    mimetype?: string;
    filename?: string | null;
  } | null;
  replyTo?: {
    id?: string;
    participant?: string;
    body?: string;
    media?: {
      url?: string;
      mimetype?: string;
      filename?: string | null;
    } | null;
  } | null;
  source?: string;
};

type ConversationMetadata = Record<string, unknown>;

function mapAckToDeliveryStatus(ack?: number): 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | null {
  switch (ack) {
    case -1:
      return 'failed';
    case 0:
      return 'queued';
    case 1:
      return 'sent';
    case 2:
      return 'delivered';
    case 3:
    case 4:
      return 'read';
    default:
      return null;
  }
}

function mapMimeTypeToAttachmentKind(mimeType: string): MessagingAttachmentKind {
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

function extractProviderMessageId(value: MessagingMessagePayload['id']): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (value && typeof value === 'object' && typeof value._serialized === 'string' && value._serialized.length > 0) {
    return value._serialized;
  }
  return null;
}

function buildQuotedMessageMetadata(replyTo: MessagingMessagePayload['replyTo']): {
  messageId: string;
  participant?: string;
  body?: string;
  media?: {
    kind: MessagingAttachmentKind;
    url: string;
    mimeType: string;
    fileName?: string | null;
  };
} | null {
  if (!replyTo?.id) {
    return null;
  }

  const media = replyTo.media?.url && replyTo.media.mimetype
    ? {
      kind: mapMimeTypeToAttachmentKind(replyTo.media.mimetype),
      url: replyTo.media.url,
      mimeType: replyTo.media.mimetype,
      ...(typeof replyTo.media.filename === 'string' || replyTo.media.filename === null ? { fileName: replyTo.media.filename } : {}),
    }
    : null;

  return {
    messageId: replyTo.id,
    ...(typeof replyTo.participant === 'string' ? { participant: replyTo.participant } : {}),
    ...(typeof replyTo.body === 'string' ? { body: replyTo.body } : {}),
    ...(media ? { media } : {}),
  };
}

function toIsoPhone(contactId: string): string | null {
  const [raw] = contactId.split('@');
  if (!raw) {
    return null;
  }
  const digits = raw.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

const normalizeChatIdCandidates = buildMessagingAliasCandidates;

function extractMessagingChatIdFromMetadata(metadata: ConversationMetadata): string | null {
  const value = metadata.messagingChatId;
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'x-api-key': token
    }
  });

  if (!response.ok) {
    throw new Error(`MessagingProvider sync request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function fetchChatMessagesWithFallback(input: {
  baseUrl: string;
  sessionName: string;
  token: string;
  chatId: string;
  query: URLSearchParams;
}): Promise<MessagingMessagePayload[] | null> {
  const modernUrl = `${input.baseUrl}/api/${encodeURIComponent(input.sessionName)}/chats/${encodeURIComponent(input.chatId)}/messages?${input.query.toString()}`;
  const modernMessages = await fetchJson<MessagingMessagePayload[]>(modernUrl, input.token).catch(() => null);

  if (Array.isArray(modernMessages)) {
    return modernMessages;
  }

  // Some MessagingProvider deployments fail on /chats/{chatId}/messages for LID-linked chats.
  // Fall back to the legacy /api/messages endpoint with explicit session/chatId.
  const legacyQuery = new URLSearchParams({
    session: input.sessionName,
    chatId: input.chatId,
    ...Object.fromEntries(input.query.entries())
  });

  const legacyUrl = `${input.baseUrl}/api/messages?${legacyQuery.toString()}`;
  const legacyMessages = await fetchJson<MessagingMessagePayload[]>(legacyUrl, input.token).catch(() => null);
  return Array.isArray(legacyMessages) ? legacyMessages : null;
}

export class MessagingInboxSyncService {
  private static readonly conversationSyncLocks = new Set<string>();

  constructor(
    private readonly inboxService: InboxService = new InboxService(),
    private readonly inboxEventsPublisher: InboxEventsPublisher = new InboxEventsPublisher()
  ) {}

  private async acquireConversationSyncLock(lockKey: string): Promise<void> {
    while (MessagingInboxSyncService.conversationSyncLocks.has(lockKey)) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    MessagingInboxSyncService.conversationSyncLocks.add(lockKey);
  }

  private releaseConversationSyncLock(lockKey: string): void {
    MessagingInboxSyncService.conversationSyncLocks.delete(lockKey);
  }

  private async resolveSession(input: { agencyId: string; tenantId: string }) {
    const binding = await MessagingSessionBindingModel.findOne({
      agencyId: input.agencyId,
      tenantId: input.tenantId,
      status: { $in: ['active', 'pending'] }
    })
      .sort({ status: 1, updatedAt: -1 })
      .lean();

    if (!binding) {
      return null;
    }

    const cluster = await MessagingClusterModel.findById(binding.clusterId).lean();

    if (!cluster?.baseUrl) {
      return null;
    }

    return {
      sessionName: binding.messagingSessionName,
      baseUrl: normalizeMessagingBaseUrl(cluster.baseUrl),
      fallbackBaseUrl: getConfiguredMessagingBaseUrl()
    };
  }

  private async resolveFallbackChatCandidates(input: {
    baseUrl: string;
    sessionName: string;
    token: string;
    chatId: string;
  }): Promise<string[]> {
    const resolvedChatIds = new Set<string>();

    if (!input.chatId.endsWith('@lid')) {
      return [];
    }

    const url = `${input.baseUrl}/api/${encodeURIComponent(input.sessionName)}/contacts/${encodeURIComponent(input.chatId)}`;
    const payload = await fetchJson<unknown>(url, input.token).catch(() => null);

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return [];
    }

    const record = payload as { id?: unknown; number?: unknown };
    if (typeof record.id === 'string' && record.id.trim().length > 0) {
      resolvedChatIds.add(record.id.trim().toLowerCase());
    }

    if (typeof record.number === 'string' && record.number.trim().length > 0) {
      const digits = record.number.replace(/\D/g, '');
      if (digits.length > 0) {
        resolvedChatIds.add(`${digits}@c.us`);
      }
    }

    return Array.from(resolvedChatIds);
  }

  private async resolveSiblingConversationIds(input: {
    agencyId: string;
    tenantId: string;
    conversationId: string;
    contactId: string;
    contactPhone: string | null | undefined;
    expandedChatCandidates: Set<string>;
  }): Promise<string[]> {
    const contactIdCandidates = new Set<string>();
    const digitsCandidates = new Set<string>();

    for (const value of input.expandedChatCandidates) {
      const normalized = value.trim().toLowerCase();
      if (normalized.length === 0) {
        continue;
      }
      contactIdCandidates.add(normalized);
      const [localPart] = normalized.split('@');
      const digits = (localPart ?? normalized).replace(/\D/g, '');
      if (digits.length > 0) {
        digitsCandidates.add(digits);
      }
    }

    for (const value of [input.contactId, input.contactPhone ?? '']) {
      const normalized = value.trim().toLowerCase();
      if (normalized.length === 0) {
        continue;
      }
      contactIdCandidates.add(normalized);
      const [localPart] = normalized.split('@');
      const digits = (localPart ?? normalized).replace(/\D/g, '');
      if (digits.length > 0) {
        digitsCandidates.add(digits);
      }
    }

    const orClauses: Array<Record<string, unknown>> = [];

    if (contactIdCandidates.size > 0) {
      orClauses.push({
        contactId: {
          $in: Array.from(contactIdCandidates)
        }
      });
    }

    for (const digits of digitsCandidates) {
      orClauses.push({
        contactId: {
          $regex: `^(?:\\+)?${digits}(?:@|$)`,
          $options: 'i'
        }
      });
      orClauses.push({
        contactPhone: {
          $regex: digits
        }
      });
    }

    if (orClauses.length === 0) {
      return [];
    }

    const siblings = await ConversationModel.find({
      agencyId: input.agencyId,
      tenantId: input.tenantId,
      _id: { $ne: input.conversationId },
      $or: orClauses
    }).select({ _id: 1 }).lean();

    return siblings.map((item) => item._id.toString());
  }

  async syncRecentChats(input: { agencyId: string; tenantId: string; limit?: number; pages?: number }) {
    const session = await this.resolveSession(input);
    if (!session) {
      return { syncedConversations: 0, syncedMessages: 0, sessionName: null };
    }

    const token = process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN ?? process.env.MESSAGING_PROVIDER_API_KEY;
    if (!token) {
      throw new Error('MessagingProvider auth token is not configured');
    }

    const pageLimit = Math.max(1, Math.min(input.limit ?? 50, 100));
    const maxPages = Math.max(1, Math.min(input.pages ?? 1, 20));

    let syncedConversations = 0;
    let offset = 0;
    const seenChatIds = new Set<string>();

    for (let page = 0; page < maxPages; page += 1) {
      const search = new URLSearchParams({
        limit: String(pageLimit)
      });

      if (offset > 0) {
        search.set('offset', String(offset));
      }

      let chats: MessagingChatSummary[] = [];

      try {
        chats = await fetchJson<MessagingChatSummary[]>(
          `${session.baseUrl}/api/${encodeURIComponent(session.sessionName)}/chats/overview?${search.toString()}`,
          token
        );
      } catch {
        if (page === 0) {
          throw new Error('MessagingProvider chat overview sync failed');
        }
        break;
      }

      if (!Array.isArray(chats) || chats.length === 0) {
        break;
      }

      let newlySeenChats = 0;

      for (const chat of chats) {
        if (!chat.id) {
          continue;
        }

        if (!seenChatIds.has(chat.id)) {
          seenChatIds.add(chat.id);
          newlySeenChats += 1;
        }

        const lastMessageBody = chat.lastMessage?.body?.trim() || null;
        const lastMessageSummary = lastMessageBody && lastMessageBody.length > 0 ? lastMessageBody : null;
        const lastMessageAt = typeof chat.lastMessage?.timestamp === 'number'
          ? new Date(chat.lastMessage.timestamp * 1000)
          : undefined;

        const resolvedIdentity = await resolveMessagingContactIdentity({
          requester: (path) => fetchJson(`${session.baseUrl}${path}`, token),
          sessionName: session.sessionName,
          rawContactId: chat.id
        });

        const conversationRecord = await this.inboxService.upsertConversationIdentity({
          agencyId: input.agencyId,
          tenantId: input.tenantId,
          contactId: resolvedIdentity.canonicalContactId,
          canonicalContactId: resolvedIdentity.canonicalContactId,
          rawContactId: resolvedIdentity.rawContactId,
          contactAliases: resolvedIdentity.contactAliases,
          contactName: resolvedIdentity.contactName ?? chat.name ?? null,
          contactPhone: resolvedIdentity.contactPhone ?? toIsoPhone(chat.id)
        });

        await ConversationModel.updateOne(
          { _id: conversationRecord._id },
          {
            $set: {
              'metadata.messagingChatId': resolvedIdentity.messagingChatId,
              'metadata.messagingCanonicalContactId': resolvedIdentity.canonicalContactId,
              'metadata.messagingAliases': resolvedIdentity.contactAliases,
              ...(typeof chat.picture === 'string' && chat.picture.trim().length > 0
                ? { 'metadata.contactPicture': chat.picture.trim() }
                : {}),
              ...(lastMessageSummary ? { lastMessageContent: lastMessageSummary } : {}),
              ...(lastMessageAt ? { lastMessageAt } : {}),
              unreadCount: chat._chat?.unreadCount ?? 0
            }
          }
        ).exec();

        syncedConversations += 1;
      }

      if (chats.length < pageLimit) {
        break;
      }

      // MessagingProvider may ignore offset; stop when pages no longer advance.
      if (page > 0 && newlySeenChats === 0) {
        break;
      }

      offset += pageLimit;
    }

    return {
      syncedConversations,
      syncedMessages: 0,
      sessionName: session.sessionName
    };
  }

  async syncConversationMessages(input: {
    agencyId: string;
    tenantId: string;
    conversationId: string;
    limit?: number;
    pages?: number;
  }) {
    const lockKey = `${input.agencyId}:${input.tenantId}:${input.conversationId}`;
    await this.acquireConversationSyncLock(lockKey);

    try {
      const [session, conversation] = await Promise.all([
        this.resolveSession(input),
        ConversationModel.findOne({
          _id: input.conversationId,
          agencyId: input.agencyId,
          tenantId: input.tenantId
        }).lean()
      ]);

      if (!session || !conversation) {
        return { syncedConversations: 0, syncedMessages: 0, sessionName: session?.sessionName ?? null };
      }

      const token = process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN ?? process.env.MESSAGING_PROVIDER_API_KEY;
      if (!token) {
        throw new Error('MessagingProvider auth token is not configured');
      }

      const pageLimit = Math.max(1, Math.min(input.limit ?? 100, 100));
      const maxPages = Math.max(1, Math.min(input.pages ?? 1, 20));
      let syncedMessages = 0;
      const seenProviderMessageIds = new Set<string>();
      let latestConversationMessageAt: Date | null = null;
      let latestConversationMessageBody: string | null = null;
      const metadata = conversation.metadata && typeof conversation.metadata === 'object' && !Array.isArray(conversation.metadata)
        ? conversation.metadata as ConversationMetadata
        : {};
      const metadataChatId = extractMessagingChatIdFromMetadata(metadata);

      const metadataAliases = Array.isArray(metadata.messagingAliases)
        ? metadata.messagingAliases.filter((value): value is string => typeof value === 'string')
        : [];
      const initialChatCandidates = new Set<string>([
        ...normalizeChatIdCandidates(conversation.contactId),
        ...normalizeChatIdCandidates(conversation.contactPhone ?? null),
        ...normalizeChatIdCandidates(metadataChatId),
        ...normalizeChatIdCandidates(metadata.messagingCanonicalContactId as string | null | undefined),
        ...metadataAliases.flatMap((value) => normalizeChatIdCandidates(value))
      ]);

      const expandedChatCandidates = new Set<string>();
      const chatQueue = Array.from(initialChatCandidates);

      while (chatQueue.length > 0) {
        const nextChatId = chatQueue.shift();
        if (!nextChatId || expandedChatCandidates.has(nextChatId)) {
          continue;
        }

        expandedChatCandidates.add(nextChatId);

        const fallbackChatIds = await this.resolveFallbackChatCandidates({
          baseUrl: session.baseUrl,
          sessionName: session.sessionName,
          token,
          chatId: nextChatId
        });

        for (const fallbackChatId of fallbackChatIds) {
          if (!expandedChatCandidates.has(fallbackChatId)) {
            chatQueue.push(fallbackChatId);
          }
        }
      }

      const siblingConversationIds = await this.resolveSiblingConversationIds({
        agencyId: input.agencyId,
        tenantId: input.tenantId,
        conversationId: conversation._id.toString(),
        contactId: conversation.contactId,
        contactPhone: conversation.contactPhone ?? null,
        expandedChatCandidates
      });
      const dedupeConversationIds = [conversation._id.toString(), ...siblingConversationIds];

      for (const chatId of expandedChatCandidates) {
        let offset = 0;

        for (let page = 0; page < maxPages; page += 1) {
          const search = new URLSearchParams({
            limit: String(pageLimit),
            sortOrder: 'desc',
            downloadMedia: 'true',
            merge: 'true'
          });

          if (offset > 0) {
            search.set('offset', String(offset));
          }

          const messages = await fetchChatMessagesWithFallback({
            baseUrl: session.baseUrl,
            sessionName: session.sessionName,
            token,
            chatId,
            query: search
          });

          if (!Array.isArray(messages) || messages.length === 0) {
            break;
          }

          let uniqueMessagesInPage = 0;

          for (const message of messages) {
            const providerMessageId = extractProviderMessageId(message.id);
            const timestampSeconds = typeof message.messageTimestamp === 'number'
              ? message.messageTimestamp
              : typeof message.timestamp === 'number'
                ? message.timestamp
                : null;

            if (!providerMessageId) {
              continue;
            }

            if (!seenProviderMessageIds.has(providerMessageId)) {
              seenProviderMessageIds.add(providerMessageId);
              uniqueMessagesInPage += 1;
            }

            const attachments = message.hasMedia && message.media?.url && message.media.mimetype
              ? [
                  {
                    kind: mapMimeTypeToAttachmentKind(message.media.mimetype),
                    url: message.media.url,
                    mimeType: message.media.mimetype,
                    fileName: message.media.filename ?? null,
                    caption: message.body?.trim() ? message.body.trim() : null
                  }
                ]
              : [];
            const quotedMessage = buildQuotedMessageMetadata(message.replyTo);

            if (timestampSeconds) {
              const timestamp = new Date(timestampSeconds * 1000);
              if (!latestConversationMessageAt || timestamp > latestConversationMessageAt) {
                latestConversationMessageAt = timestamp;
                latestConversationMessageBody = message.body?.trim() ?? '';
              }
            }

            const existing = await MessageModel.findOne({
              conversationId: { $in: dedupeConversationIds },
              $or: [
                { providerMessageId },
                { messagingMessageId: providerMessageId }
              ]
            }).exec();

            if (existing) {
              await MessageModel.updateOne(
                { _id: existing._id },
                {
                  $set: {
                    providerAck: message.ack ?? null,
                    providerAckName: message.ackName ?? null,
                    deliveryStatus: mapAckToDeliveryStatus(message.ack),
                    ...(attachments.length > 0 ? { attachments } : {}),
                    ...(quotedMessage ? { 'metadata.quotedMessage': quotedMessage } : {}),
                    ...(quotedMessage?.messageId ? { replyToMessageId: quotedMessage.messageId } : {})
                  }
                }
              ).exec();
              await this.inboxEventsPublisher.publishDeliveryUpdated(input.tenantId, conversation._id.toString());
              continue;
            }

            const payload: AddMessageInput = {
              agencyId: input.agencyId,
              tenantId: input.tenantId,
              contactId: conversation.contactId,
              contactName: conversation.contactName ?? null,
              contactPhone: conversation.contactPhone ?? null,
              role: message.fromMe === true ? 'assistant' : 'user',
              content: message.body ?? '',
              messagingMessageId: providerMessageId,
              providerMessageId,
              providerAck: message.ack ?? null,
              providerAckName: message.ackName ?? null,
              replyToMessageId: quotedMessage?.messageId ?? null,
              deliveryStatus: mapAckToDeliveryStatus(message.ack),
              attachments,
              metadata: {
                messagingEvent: 'sync',
                source: message.source ?? null,
                syncedFrom: 'messaging-sync',
                syncedFromChatId: chatId,
                ...(quotedMessage ? { quotedMessage } : {})
              },
              deliveryEventSource: 'webhook_message'
            };

            const result = await this.inboxService.recordMessage(payload);

            if (timestampSeconds) {
              const timestamp = new Date(timestampSeconds * 1000);
              await MessageModel.updateOne({ _id: result.message._id }, { $set: { timestamp } }).exec();
            }

            await this.inboxEventsPublisher.publishMessageCreated(input.tenantId, conversation._id.toString());
            syncedMessages += 1;
          }

          if (messages.length < pageLimit) {
            break;
          }

          // MessagingProvider may ignore offset for some builds; stop when pages repeat.
          if (page > 0 && uniqueMessagesInPage === 0) {
            break;
          }

          offset += pageLimit;
        }
      }

      if (syncedMessages === 0) {
        const overviewLimit = Math.max(100, pageLimit);
        const overviewSearch = new URLSearchParams({
          limit: String(Math.min(overviewLimit, 200))
        });
        const overviewChats = await fetchJson<MessagingChatSummary[]>(
          `${session.baseUrl}/api/${encodeURIComponent(session.sessionName)}/chats/overview?${overviewSearch.toString()}`,
          token
        ).catch(() => []);

        if (Array.isArray(overviewChats) && overviewChats.length > 0) {
          const normalizedCandidates = new Set(Array.from(expandedChatCandidates).map((candidate) => candidate.toLowerCase()));
          const fallbackChat = overviewChats.find((chat) =>
            typeof chat.id === 'string'
            && normalizedCandidates.has(chat.id.toLowerCase())
            && typeof chat.lastMessage?.timestamp === 'number'
          );

          if (
            fallbackChat
            && typeof fallbackChat.id === 'string'
            && fallbackChat.lastMessage
            && typeof fallbackChat.lastMessage.timestamp === 'number'
          ) {
            const fallbackTimestamp = new Date(fallbackChat.lastMessage.timestamp * 1000);
            const fallbackBody = fallbackChat.lastMessage.body?.trim() ?? '';
            const fallbackProviderMessageId = typeof fallbackChat.lastMessage.id === 'string'
              && fallbackChat.lastMessage.id.trim().length > 0
              ? fallbackChat.lastMessage.id.trim()
              : null;

            if (!Number.isNaN(fallbackTimestamp.getTime())) {
              latestConversationMessageAt = fallbackTimestamp;
              if (fallbackBody.length > 0) {
                latestConversationMessageBody = fallbackBody;
              }
            }

            if (fallbackProviderMessageId && fallbackBody.length > 0 && !Number.isNaN(fallbackTimestamp.getTime())) {
              const existingFallbackMessage = await MessageModel.findOne({
                conversationId: { $in: dedupeConversationIds },
                $or: [
                  { providerMessageId: fallbackProviderMessageId },
                  { messagingMessageId: fallbackProviderMessageId }
                ]
              }).exec();

              if (!existingFallbackMessage) {
                const fallbackResult = await this.inboxService.recordMessage({
                  agencyId: input.agencyId,
                  tenantId: input.tenantId,
                  contactId: conversation.contactId,
                  contactName: conversation.contactName ?? null,
                  contactPhone: conversation.contactPhone ?? null,
                  role: fallbackChat.lastMessage.fromMe === true ? 'assistant' : 'user',
                  content: fallbackBody,
                  messagingMessageId: fallbackProviderMessageId,
                  providerMessageId: fallbackProviderMessageId,
                  deliveryStatus: null,
                  metadata: {
                    messagingEvent: 'sync_overview_fallback',
                    source: fallbackChat.lastMessage.source ?? null,
                    syncedFrom: 'messaging-sync-overview-fallback',
                    syncedFromChatId: fallbackChat.id
                  },
                  deliveryEventSource: 'webhook_message'
                });

                await MessageModel.updateOne(
                  { _id: fallbackResult.message._id },
                  { $set: { timestamp: fallbackTimestamp } }
                ).exec();
                await this.inboxEventsPublisher.publishMessageCreated(input.tenantId, conversation._id.toString());
                syncedMessages += 1;
              }
            }

            await ConversationModel.updateOne(
              { _id: conversation._id },
              {
                $set: {
                  ...(typeof fallbackChat._chat?.unreadCount === 'number'
                    ? { unreadCount: fallbackChat._chat.unreadCount }
                    : {}),
                  ...(latestConversationMessageAt ? { lastMessageAt: latestConversationMessageAt } : {}),
                  ...(latestConversationMessageBody && latestConversationMessageBody.length > 0
                    ? { lastMessageContent: latestConversationMessageBody }
                    : {})
                }
              }
            ).exec();
          }
        }
      }

      if (latestConversationMessageAt) {
        await ConversationModel.updateOne(
          { _id: conversation._id },
          {
            $set: {
              lastMessageAt: latestConversationMessageAt,
              ...(latestConversationMessageBody && latestConversationMessageBody.length > 0
                ? { lastMessageContent: latestConversationMessageBody }
                : {})
            }
          }
        ).exec();
      }

      return {
        syncedConversations: 1,
        syncedMessages,
        sessionName: session.sessionName
      };
    } finally {
      this.releaseConversationSyncLock(lockKey);
    }
  }
}
