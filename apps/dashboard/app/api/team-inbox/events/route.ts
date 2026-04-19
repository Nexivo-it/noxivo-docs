import { getCurrentSession } from '../../../../lib/auth/session';
import { subscribeToInboxEvents, type InboxEvent } from '../../../../lib/inbox-events';
import dbConnect from '../../../../lib/mongodb';
import { ContactProfileModel, ConversationModel, MessageModel } from '@noxivo/database';
import { resolveActorTenantCandidates, resolveActorTenantId } from '../../../../lib/auth/tenant-context';

export const dynamic = 'force-dynamic';

function encodeSseEvent(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

type TeamInboxEventType =
  | InboxEvent['type']
  | 'message.sent'
  | 'message.received'
  | 'connected';

type TeamInboxStreamMessage = {
  _id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  deliveryStatus: string | null;
  providerMessageId: string | null;
};

type TeamInboxStreamConversation = {
  _id: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string | null;
  avatarUrl: string | null;
  leadSaved: boolean;
  unreadCount: number;
  status: string;
  assignedTo: string | null;
  channel: 'whatsapp' | 'webhook' | 'internal' | 'unknown';
  sourceName: string | null;
  sourceLabel: string | null;
  isArchived: boolean;
  lastMessageSource: string | null;
  lastMessage: {
    content: string;
    createdAt: string;
  } | null;
};

function extractAvatarUrlFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const candidates = [
    record.contactPicture,
    record.profilePictureURL,
    record.profilePicture,
    record.profilePicUrl,
    record.avatarUrl
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function inferConversationChannel(
  latestMessageSource: string | null,
  metadata: unknown,
  contactId: string
): 'whatsapp' | 'webhook' | 'internal' | 'unknown' {
  const source = (latestMessageSource ?? '').trim().toLowerCase();

  if (source.includes('webhook')) {
    return 'webhook';
  }

  if (source.includes('dashboard.internal-inbox') || source.includes('dashboard.engine-client')) {
    return 'whatsapp';
  }

  if (source.length > 0) {
    return 'whatsapp';
  }

  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const record = metadata as Record<string, unknown>;
    if (typeof record.messagingChatId === 'string' && record.messagingChatId.trim().length > 0) {
      return 'whatsapp';
    }
    if (typeof record.webhookInboxSourceId === 'string' && record.webhookInboxSourceId.trim().length > 0) {
      return 'webhook';
    }
  }

  const normalizedContactId = contactId.trim().toLowerCase();
  const localPart = normalizedContactId.split('@')[0] ?? '';
  const digits = localPart.replace(/\D/g, '');
  if (digits.length >= 7) {
    return 'whatsapp';
  }

  return 'unknown';
}

type TeamInboxStreamEnvelope = {
  type: TeamInboxEventType;
  conversationId?: string;
  message?: TeamInboxStreamMessage;
  conversation?: TeamInboxStreamConversation;
};

type SeenConversationState = {
  createdAtMs: number;
  messageFingerprint: string | null;
};

function getEnvelopeMessageFingerprint(payload: TeamInboxStreamEnvelope): string | null {
  const providerMessageId = payload.message?.providerMessageId?.trim();
  if (providerMessageId && providerMessageId.length > 0) {
    return providerMessageId;
  }

  const internalMessageId = payload.message?._id?.trim();
  if (internalMessageId && internalMessageId.length > 0) {
    return internalMessageId;
  }

  return null;
}

async function buildEnvelope(
  tenantIds: string[],
  event: InboxEvent
): Promise<TeamInboxStreamEnvelope> {
  await dbConnect();

  const conversation = await ConversationModel.findOne({
    _id: event.conversationId,
    tenantId: { $in: tenantIds }
  }).lean();

  if (!conversation) {
    return {
      type: event.type,
      conversationId: event.conversationId
    };
  }

  const latestMessage = await MessageModel.findOne({ conversationId: conversation._id })
    .sort({ timestamp: -1, _id: -1 })
    .lean();
  const contactProfile = await ContactProfileModel.findOne({
    tenantId: conversation.tenantId,
    contactId: conversation.contactId
  })
    .select({ crmTags: 1 })
    .lean();

  const mappedConversation: TeamInboxStreamConversation = {
    _id: conversation._id.toString(),
    contactId: conversation.contactId,
    contactName: conversation.contactName ?? null,
    contactPhone: conversation.contactPhone ?? null,
    avatarUrl: extractAvatarUrlFromMetadata(conversation.metadata),
    leadSaved: Array.isArray(contactProfile?.crmTags)
      ? contactProfile.crmTags.some((tag) =>
          typeof tag.label === 'string' && tag.label.trim().toLowerCase() === 'lead'
        )
      : false,
    unreadCount: conversation.unreadCount,
    status: conversation.status,
    assignedTo: conversation.assignedTo ? conversation.assignedTo.toString() : null,
    channel: inferConversationChannel(
      latestMessage && latestMessage.metadata && typeof latestMessage.metadata.source === 'string'
        ? latestMessage.metadata.source
        : null,
      conversation.metadata,
      conversation.contactId
    ),
    sourceName: null,
    sourceLabel: null,
    isArchived: conversation.status === 'closed' || conversation.status === 'deleted' || (
      Boolean(conversation.metadata)
      && typeof conversation.metadata === 'object'
      && !Array.isArray(conversation.metadata)
      && (conversation.metadata as Record<string, unknown>).isArchived === true
    ),
    lastMessageSource: latestMessage && latestMessage.metadata && typeof latestMessage.metadata.source === 'string'
      ? latestMessage.metadata.source
      : null,
    lastMessage:
      conversation.lastMessageContent && conversation.lastMessageAt
        ? {
            content: conversation.lastMessageContent,
            createdAt: conversation.lastMessageAt.toISOString()
          }
        : null
  };

  const mappedMessage = latestMessage
    ? {
        _id: latestMessage._id.toString(),
        role: latestMessage.role,
        content: latestMessage.content,
        createdAt: latestMessage.timestamp.toISOString(),
        deliveryStatus: latestMessage.deliveryStatus ?? null,
        providerMessageId: latestMessage.providerMessageId ?? null
      }
    : undefined;

  if (event.type === 'message.created' && mappedMessage) {
    return {
      type: mappedMessage.role === 'user' ? 'message.received' : 'message.sent',
      conversationId: event.conversationId,
      conversation: mappedConversation,
      message: mappedMessage
    };
  }

  return {
    type: event.type,
    conversationId: event.conversationId,
    conversation: mappedConversation,
    ...(mappedMessage ? { message: mappedMessage } : {})
  };
}

export async function GET(): Promise<Response> {
  const session = await getCurrentSession();

  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  const requestedTenantId = resolveActorTenantId(session.actor);
  if (!requestedTenantId) {
    return new Response('No tenant workspace available for this agency context', { status: 409 });
  }
  await dbConnect();
  const resolvedTenantCandidates = await resolveActorTenantCandidates(session.actor);
  const tenantCandidates = resolvedTenantCandidates.length > 0
    ? resolvedTenantCandidates
    : [requestedTenantId];

  let cleanup = async () => {};
  let isClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encodeSseEvent({ type: 'connected' }));
      const seenConversationState = new Map<string, SeenConversationState>();
      let lastConversationProbeAt = Date.now() - 15_000;

      const shouldEmitConversation = (
        conversationId: string,
        messageCreatedAtIso: string | null,
        messageFingerprint: string | null
      ): boolean => {
        const parsedCreatedAtMs = messageCreatedAtIso ? new Date(messageCreatedAtIso).getTime() : Date.now();
        const createdAtMs = Number.isFinite(parsedCreatedAtMs) ? parsedCreatedAtMs : Date.now();
        const previous = seenConversationState.get(conversationId);
        const normalizedFingerprint = messageFingerprint?.trim() ?? null;

        if (!previous || createdAtMs > previous.createdAtMs) {
          seenConversationState.set(conversationId, {
            createdAtMs,
            messageFingerprint: normalizedFingerprint
          });
          return true;
        }

        if (
          createdAtMs === previous.createdAtMs
          && normalizedFingerprint
          && normalizedFingerprint !== previous.messageFingerprint
        ) {
          seenConversationState.set(conversationId, {
            createdAtMs,
            messageFingerprint: normalizedFingerprint
          });
          return true;
        }

        if (createdAtMs <= previous.createdAtMs) {
          return false;
        }

        seenConversationState.set(conversationId, {
          createdAtMs,
          messageFingerprint: normalizedFingerprint
        });
        return true;
      };

      const unsubscribers = await Promise.all(
        tenantCandidates.map((tenantId) => subscribeToInboxEvents(tenantId, (event) => {
          void (async () => {
            if (isClosed) {
              return;
            }

            try {
              const payload = await buildEnvelope(tenantCandidates, event);
              if (
                payload.conversationId
                && !shouldEmitConversation(
                  payload.conversationId,
                  payload.conversation?.lastMessage?.createdAt ?? payload.message?.createdAt ?? null,
                  getEnvelopeMessageFingerprint(payload)
                )
              ) {
                return;
              }

              if (!isClosed) {
                controller.enqueue(encodeSseEvent(payload));
              }
            } catch {
              if (!isClosed) {
                controller.enqueue(encodeSseEvent({
                  type: event.type,
                  conversationId: event.conversationId
                } satisfies TeamInboxStreamEnvelope));
              }
            }
          })();
        }))
      );

      // Fallback realtime probe:
      // When Redis pub/sub is unavailable between workflow-engine and dashboard,
      // MessagingProvider webhooks still update Mongo. Probe recent conversation changes and emit SSE.
      const realtimeProbe = setInterval(() => {
        void (async () => {
          if (isClosed) {
            return;
          }

          try {
            const updatedConversations = await ConversationModel.find({
              tenantId: { $in: tenantCandidates },
              lastMessageAt: { $gt: new Date(lastConversationProbeAt) }
            })
              .sort({ lastMessageAt: -1 })
              .limit(40)
              .select({ _id: 1, lastMessageAt: 1 })
              .lean();

            const newestTimestamp = updatedConversations.reduce((latest, conversation) => {
              const timestamp = conversation.lastMessageAt?.getTime() ?? 0;
              return timestamp > latest ? timestamp : latest;
            }, lastConversationProbeAt);

            if (newestTimestamp > lastConversationProbeAt) {
              lastConversationProbeAt = newestTimestamp;
            } else {
              lastConversationProbeAt = Date.now() - 2000;
            }

            for (const updatedConversation of updatedConversations) {
              const conversationId = updatedConversation._id.toString();

              const payload = await buildEnvelope(tenantCandidates, {
                type: 'message.created',
                conversationId
              });
              const createdAtIso = payload.conversation?.lastMessage?.createdAt ?? payload.message?.createdAt ?? null;
              const messageFingerprint = getEnvelopeMessageFingerprint(payload);

              if (!shouldEmitConversation(conversationId, createdAtIso, messageFingerprint)) {
                continue;
              }

              if (!isClosed) {
                controller.enqueue(encodeSseEvent(payload));
              }
            }
          } catch {
            // Fallback probe is best-effort.
          }
        })();
      }, 1200);

      const keepAlive = setInterval(() => {
        if (!isClosed) {
          controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));
        }
      }, 15000);

      cleanup = async () => {
        isClosed = true;
        clearInterval(realtimeProbe);
        clearInterval(keepAlive);
        await Promise.all(unsubscribers.map(async (unsubscribe) => unsubscribe()));
      };
    },
    async cancel() {
      await cleanup();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  });
}
