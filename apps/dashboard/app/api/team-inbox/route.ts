import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '../../../lib/mongodb';
import { ContactProfileModel, ConversationModel, MessageModel } from '@noxivo/database';
import { getCurrentSession } from '../../../lib/auth/session';
import { syncInboxState } from '../../../lib/team-inbox-sync';
import { engineClient } from '../../../lib/api/engine-client';
import { resolveActorTenantCandidates, resolveActorTenantId } from '../../../lib/auth/tenant-context';

function inferPhoneFromContactId(contactId: string): string | null {
  const [inferredPhone] = contactId.split('@');
  return inferredPhone && /^\+?[0-9]+$/.test(inferredPhone) ? inferredPhone : null;
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return code === 11000;
}

function isObjectIdString(value: string): boolean {
  return mongoose.Types.ObjectId.isValid(value);
}

type ContactProfileSummary = {
  totalMessages: number;
  inboundMessages: number;
  outboundMessages: number;
  firstSeenAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
};

type InboxSummary = {
  _id: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string | null;
  avatarUrl: string | null;
  leadSaved: boolean;
  unreadCount: number;
  status: string;
  assignedTo: string | null;
  lastMessage: {
    content: string;
    createdAt: string;
  } | null;
  contactProfile: ContactProfileSummary;
  latestProviderMessageId?: string | null;
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

function toMillis(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
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

  const leftDigits = normalizedDigits(leftLocal);
  const rightDigits = normalizedDigits(rightLocal);
  if (leftDigits.length > 0 && rightDigits.length > 0) {
    return leftDigits === rightDigits;
  }

  return leftLocal === rightLocal;
}

function shouldMergeSummaries(left: InboxSummary, right: InboxSummary): boolean {
  const leftContactId = left.contactId.trim().toLowerCase();
  const rightContactId = right.contactId.trim().toLowerCase();

  if (sameContactIdentity(leftContactId, rightContactId)) {
    return true;
  }

  const leftPhoneDigits = normalizedDigits(left.contactPhone);
  const rightPhoneDigits = normalizedDigits(right.contactPhone);

  if (leftPhoneDigits.length > 0 && leftPhoneDigits === rightPhoneDigits) {
    return true;
  }

  const leftLatestProviderMessageId = left.latestProviderMessageId?.trim() ?? '';
  const rightLatestProviderMessageId = right.latestProviderMessageId?.trim() ?? '';
  if (
    leftLatestProviderMessageId.length > 0
    && rightLatestProviderMessageId.length > 0
    && leftLatestProviderMessageId === rightLatestProviderMessageId
  ) {
    return true;
  }

  return false;
}

function compareSummaryPriority(left: InboxSummary, right: InboxSummary): number {
  const leftScore = [
    left.assignedTo ? 1 : 0,
    left.status === 'handoff' ? 1 : 0,
    left.contactProfile.totalMessages,
    toMillis(left.lastMessage?.createdAt)
  ];
  const rightScore = [
    right.assignedTo ? 1 : 0,
    right.status === 'handoff' ? 1 : 0,
    right.contactProfile.totalMessages,
    toMillis(right.lastMessage?.createdAt)
  ];

  for (let index = 0; index < leftScore.length; index += 1) {
    const leftValue = leftScore[index] ?? 0;
    const rightValue = rightScore[index] ?? 0;
    if (leftValue === rightValue) {
      continue;
    }
    return leftValue > rightValue ? -1 : 1;
  }

  return 0;
}

function pickPrimarySummary(left: InboxSummary, right: InboxSummary): InboxSummary {
  return compareSummaryPriority(left, right) <= 0 ? left : right;
}

function mergeContactProfiles(left: ContactProfileSummary, right: ContactProfileSummary): ContactProfileSummary {
  return {
    totalMessages: Math.max(left.totalMessages, right.totalMessages),
    inboundMessages: Math.max(left.inboundMessages, right.inboundMessages),
    outboundMessages: Math.max(left.outboundMessages, right.outboundMessages),
    firstSeenAt: [left.firstSeenAt, right.firstSeenAt].filter(Boolean).sort()[0] ?? null,
    lastInboundAt: [left.lastInboundAt, right.lastInboundAt].filter(Boolean).sort().at(-1) ?? null,
    lastOutboundAt: [left.lastOutboundAt, right.lastOutboundAt].filter(Boolean).sort().at(-1) ?? null
  };
}

function collapseDuplicateSummaries(summaries: InboxSummary[]): InboxSummary[] {
  const collapsed: InboxSummary[] = [];

  for (const summary of summaries) {
    const duplicateIndex = collapsed.findIndex((candidate) => shouldMergeSummaries(candidate, summary));

    if (duplicateIndex === -1) {
      collapsed.push(summary);
      continue;
    }

    const duplicate = collapsed[duplicateIndex];
    if (!duplicate) {
      collapsed.push(summary);
      continue;
    }

    const primary = pickPrimarySummary(duplicate, summary);
    const secondary = primary._id === duplicate._id ? summary : duplicate;
    const latestMessage =
      toMillis(primary.lastMessage?.createdAt) >= toMillis(secondary.lastMessage?.createdAt)
        ? primary.lastMessage
        : secondary.lastMessage;

    collapsed[duplicateIndex] = {
      ...primary,
      avatarUrl: primary.avatarUrl ?? secondary.avatarUrl ?? null,
      leadSaved: primary.leadSaved || secondary.leadSaved,
      unreadCount: Math.max(primary.unreadCount, secondary.unreadCount),
      lastMessage: latestMessage,
      contactProfile: mergeContactProfiles(primary.contactProfile, secondary.contactProfile),
      latestProviderMessageId: primary.latestProviderMessageId ?? secondary.latestProviderMessageId ?? null
    };
  }

  return collapsed;
}

export async function GET(request: Request) {
  try {
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

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query')?.trim();
    const status = searchParams.get('status')?.trim();

    const shouldBackfillHistory = !query && !status;

    await syncInboxState({
      agencyId: session.actor.agencyId,
      tenantId,
      limit: shouldBackfillHistory ? 100 : 40,
      pages: shouldBackfillHistory ? 5 : 1
    });

    const filterBase: {
      agencyId: string;
      status?: string;
      $or?: Array<Record<string, { $regex: string; $options: string }>>;
    } = {
      agencyId: session.actor.agencyId
    };

    if (status) {
      filterBase.status = status;
    }

    if (query) {
      filterBase.$or = [
        { contactId: { $regex: query, $options: 'i' } },
        { contactName: { $regex: query, $options: 'i' } },
        { contactPhone: { $regex: query, $options: 'i' } },
        { lastMessageContent: { $regex: query, $options: 'i' } }
      ];
    }

    const fetchEngineChats = async (candidateTenantId: string) => {
      const payload = await engineClient
        .getChats({
          tenantId: candidateTenantId,
          limit: 50,
          offset: 0
        })
        .catch(() => []);

      return Array.isArray(payload) ? payload : [];
    };

    const fetchMessagingChatsWithSync = async (candidateTenantId: string) => {
      const payload = await engineClient
        .getMessagingInboxChats({
          agencyId: session.actor.agencyId,
          tenantId: candidateTenantId,
          limit: 100,
          offset: 0
        })
        .catch(() => null);

      if (!payload || !Array.isArray(payload.chats)) {
        // Fall back to workflow-engine MessagingProvider proxy read when deployed engine inbox sync route is unhealthy.
      } else if (payload.chats.length > 0) {
        return payload.chats;
      }

      const binding = await engineClient
        .getSessionByTenant(session.actor.agencyId, candidateTenantId)
        .catch(() => null);

      const resolvedSessionName = typeof binding?.name === 'string' && binding.name.trim().length > 0
        ? binding.name.trim()
        : typeof binding?.id === 'string' && binding.id.trim().length > 0 && !isObjectIdString(binding.id)
          ? binding.id.trim()
          : null;

      if (!resolvedSessionName) {
        return [];
      }

      const proxyPayload = await engineClient
        .proxyMessaging<unknown>({
          path: `${encodeURIComponent(resolvedSessionName)}/chats/overview`,
          method: 'GET',
          query: { limit: 100 }
        })
        .catch(() => null);

      if (!Array.isArray(proxyPayload)) {
        return [];
      }

      return proxyPayload.flatMap((chat) => {
        if (!chat || typeof chat !== 'object' || Array.isArray(chat)) {
          return [];
        }

        const record = chat as {
          id?: unknown;
          name?: unknown;
          picture?: unknown;
          lastMessage?: { body?: unknown; timestamp?: unknown; fromMe?: unknown } | null;
          _chat?: { unreadCount?: unknown } | null;
        };

        if (typeof record.id !== 'string' || record.id.trim().length === 0) {
          return [];
        }

        const lastMessageTimestamp = typeof record.lastMessage?.timestamp === 'number'
          ? record.lastMessage.timestamp
          : 0;

        return [{
          id: record.id,
          name: typeof record.name === 'string' ? record.name : null,
          picture: typeof record.picture === 'string' && record.picture.trim().length > 0
            ? record.picture.trim()
            : null,
          lastMessage: {
            id: record.id,
            body: typeof record.lastMessage?.body === 'string' ? record.lastMessage.body : null,
            timestamp: lastMessageTimestamp,
            fromMe: record.lastMessage?.fromMe === true
          },
          unreadCount: typeof record._chat?.unreadCount === 'number' ? record._chat.unreadCount : 0
        }];
      });
    };

    const mapMessagingChatsToEngineChats = (messagingChats: Awaited<ReturnType<typeof fetchMessagingChatsWithSync>>) => {
      return messagingChats.map((chat) => ({
        id: chat.id,
        contactId: chat.id,
        contactName: chat.name ?? '',
        lastMessage: chat.lastMessage?.body ?? null,
        updatedAt: chat.lastMessage ? new Date(chat.lastMessage.timestamp * 1000).toISOString() : null
      }));
    };

    const hydrateConversationsFromMessagingChats = async (
      candidateTenantId: string,
      messagingChats: Awaited<ReturnType<typeof fetchMessagingChatsWithSync>>
    ) => {
      for (const chat of messagingChats) {
        const lastMessage = chat.lastMessage?.body?.trim();
        const lastMessageAt = chat.lastMessage
          ? new Date(chat.lastMessage.timestamp * 1000)
          : null;

        try {
          await ConversationModel.findOneAndUpdate(
            {
              agencyId: session.actor.agencyId,
              tenantId: candidateTenantId,
              contactId: chat.id
            },
            {
              $set: {
                contactName: chat.name ?? null,
                contactPhone: inferPhoneFromContactId(chat.id),
                unreadCount: chat.unreadCount ?? 0,
                'metadata.messagingChatId': chat.id,
                'metadata.workflowEngineSummaryUpdatedAt': new Date().toISOString(),
                ...(chat.picture && chat.picture.length > 0 ? { 'metadata.contactPicture': chat.picture } : {}),
                ...(lastMessage && lastMessage.length > 0 ? { lastMessageContent: lastMessage } : {}),
                ...(lastMessageAt && !Number.isNaN(lastMessageAt.getTime()) ? { lastMessageAt } : {})
              },
              $setOnInsert: {
                agencyId: session.actor.agencyId,
                tenantId: candidateTenantId,
                status: 'open'
              }
            },
            { upsert: true, setDefaultsOnInsert: true }
          ).exec();
        } catch (error) {
          if (!isDuplicateKeyError(error)) {
            throw error;
          }
        }
      }

      return fetchConversations(candidateTenantId);
    };

    const fetchConversations = async (candidateTenantId: string) => {
      return ConversationModel.find({
        ...filterBase,
        tenantId: candidateTenantId
      })
        .sort({ lastMessageAt: -1 })
        .limit(50)
        .lean();
    };

    let selectedTenantId = tenantId;
    let engineChats = await fetchEngineChats(tenantId);
    let conversations = await fetchConversations(tenantId);

    if (!query && !status && conversations.length === 0 && engineChats.length === 0) {
      for (const candidateTenantId of tenantCandidates.slice(1)) {
        await syncInboxState({
          agencyId: session.actor.agencyId,
          tenantId: candidateTenantId,
          limit: 100,
          pages: 3
        });

        const [candidateChats, candidateConversations] = await Promise.all([
          fetchEngineChats(candidateTenantId),
          fetchConversations(candidateTenantId)
        ]);

        if (candidateChats.length > 0 || candidateConversations.length > 0) {
          selectedTenantId = candidateTenantId;
          engineChats = candidateChats;
          conversations = candidateConversations;
          break;
        }
      }
    }

    if (!query && !status && conversations.length === 0 && engineChats.length === 0) {
      for (const candidateTenantId of tenantCandidates) {
        const messagingChats = await fetchMessagingChatsWithSync(candidateTenantId);
        if (messagingChats.length === 0) {
          continue;
        }

        selectedTenantId = candidateTenantId;
        engineChats = mapMessagingChatsToEngineChats(messagingChats);
        conversations = await hydrateConversationsFromMessagingChats(selectedTenantId, messagingChats);
        break;
      }
    }

    if (!query && !status) {
      const messagingChats = await fetchMessagingChatsWithSync(selectedTenantId);
      if (messagingChats.length > 0) {
        engineChats = mapMessagingChatsToEngineChats(messagingChats);
        conversations = await hydrateConversationsFromMessagingChats(selectedTenantId, messagingChats);
      }
    }

    const engineConversationOrder = engineChats.map((chat) => chat.id);

    if (!query && !status && engineConversationOrder.length > 0) {
      const orderByConversationId = new Map<string, number>();
      engineChats.forEach((chat, index) => {
        orderByConversationId.set(chat.id, index);
        orderByConversationId.set(chat.contactId, index);
      });

      conversations.sort((left, right) => {
        const leftOrder = orderByConversationId.get(left._id.toString())
          ?? orderByConversationId.get(left.contactId)
          ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = orderByConversationId.get(right._id.toString())
          ?? orderByConversationId.get(right.contactId)
          ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      });
    }

    const contactProfiles = conversations.length > 0
      ? await ContactProfileModel.find({
          tenantId: selectedTenantId,
          contactId: {
            $in: conversations.map((conversation) => conversation.contactId)
          }
        }).lean()
      : [];

    const contactProfilesByContactId = new Map(
      contactProfiles.map((profile) => [profile.contactId, profile])
    );

    const fallbackConversationIds = conversations
      .filter((conversation) => !contactProfilesByContactId.has(conversation.contactId))
      .map((conversation) => conversation._id);

    const messageStats = fallbackConversationIds.length > 0
      ? await MessageModel.aggregate<{
          _id: { toString(): string };
          totalMessages: number;
          inboundMessages: number;
          outboundMessages: number;
          firstSeenAt: Date | null;
          lastInboundAt: Date | null;
          lastOutboundAt: Date | null;
        }>([
          {
            $match: {
              conversationId: { $in: fallbackConversationIds }
            }
          },
          {
            $group: {
              _id: '$conversationId',
              totalMessages: { $sum: 1 },
              inboundMessages: {
                $sum: {
                  $cond: [{ $eq: ['$role', 'user'] }, 1, 0]
                }
              },
              outboundMessages: {
                $sum: {
                  $cond: [{ $ne: ['$role', 'user'] }, 1, 0]
                }
              },
              firstSeenAt: { $min: '$timestamp' },
              lastInboundAt: {
                $max: {
                  $cond: [{ $eq: ['$role', 'user'] }, '$timestamp', null]
                }
              },
              lastOutboundAt: {
                $max: {
                  $cond: [{ $ne: ['$role', 'user'] }, '$timestamp', null]
                }
              }
            }
          }
        ])
      : [];

    const messageStatsByConversationId = new Map(
      messageStats.map((stats) => [stats._id.toString(), stats])
    );
    const conversationIds = conversations.map((conversation) => conversation._id);
    const latestProviderMessageByConversationId = conversationIds.length > 0
      ? await MessageModel.aggregate([
          {
            $match: {
              conversationId: {
                $in: conversationIds
              }
            }
          },
          {
            $sort: {
              timestamp: -1,
              _id: -1
            }
          },
          {
            $group: {
              _id: '$conversationId',
              providerMessageId: { $first: '$providerMessageId' },
              messagingMessageId: { $first: '$messagingMessageId' }
            }
          }
        ])
      : [];

    const latestProviderMessageIdByConversationId = new Map<string, string>();
    for (const row of latestProviderMessageByConversationId) {
      const conversationId = row?._id?.toString?.();
      if (!conversationId) {
        continue;
      }

      const providerMessageId = typeof row.providerMessageId === 'string'
        ? row.providerMessageId.trim()
        : '';
      const messagingMessageId = typeof row.messagingMessageId === 'string'
        ? row.messagingMessageId.trim()
        : '';

      if (providerMessageId.length > 0) {
        latestProviderMessageIdByConversationId.set(conversationId, providerMessageId);
      } else if (messagingMessageId.length > 0) {
        latestProviderMessageIdByConversationId.set(conversationId, messagingMessageId);
      }
    }

    const summaries = conversations.map((conversation) => ({
      ...(contactProfilesByContactId.has(conversation.contactId)
        ? {
            contactProfile: {
              totalMessages: contactProfilesByContactId.get(conversation.contactId)?.totalMessages ?? 0,
              inboundMessages: contactProfilesByContactId.get(conversation.contactId)?.inboundMessages ?? 0,
              outboundMessages: contactProfilesByContactId.get(conversation.contactId)?.outboundMessages ?? 0,
              firstSeenAt: contactProfilesByContactId.get(conversation.contactId)?.firstSeenAt?.toISOString() ?? null,
              lastInboundAt: contactProfilesByContactId.get(conversation.contactId)?.lastInboundAt?.toISOString() ?? null,
              lastOutboundAt: contactProfilesByContactId.get(conversation.contactId)?.lastOutboundAt?.toISOString() ?? null
            }
          }
        : messageStatsByConversationId.has(conversation._id.toString())
        ? {
            contactProfile: {
              totalMessages: messageStatsByConversationId.get(conversation._id.toString())?.totalMessages ?? 0,
              inboundMessages: messageStatsByConversationId.get(conversation._id.toString())?.inboundMessages ?? 0,
              outboundMessages: messageStatsByConversationId.get(conversation._id.toString())?.outboundMessages ?? 0,
              firstSeenAt: messageStatsByConversationId.get(conversation._id.toString())?.firstSeenAt?.toISOString() ?? null,
              lastInboundAt: messageStatsByConversationId.get(conversation._id.toString())?.lastInboundAt?.toISOString() ?? null,
              lastOutboundAt: messageStatsByConversationId.get(conversation._id.toString())?.lastOutboundAt?.toISOString() ?? null
            }
          }
        : {
            contactProfile: {
              totalMessages: 0,
              inboundMessages: 0,
              outboundMessages: 0,
              firstSeenAt: null,
              lastInboundAt: null,
              lastOutboundAt: null
            }
          }),
      _id: conversation._id.toString(),
      contactId: conversation.contactId,
      contactName: conversation.contactName ?? null,
      contactPhone: conversation.contactPhone ?? null,
      avatarUrl: extractAvatarUrlFromMetadata(conversation.metadata),
      leadSaved: (contactProfilesByContactId.get(conversation.contactId)?.crmTags ?? []).some((tag) =>
        typeof tag.label === 'string' && tag.label.trim().toLowerCase() === 'lead'
      ),
      unreadCount: conversation.unreadCount,
      status: conversation.status,
      assignedTo: conversation.assignedTo ? conversation.assignedTo.toString() : null,
      lastMessage: conversation.lastMessageContent && conversation.lastMessageAt ? {
        content: conversation.lastMessageContent,
        createdAt: conversation.lastMessageAt.toISOString()
      } : null,
      latestProviderMessageId: latestProviderMessageIdByConversationId.get(conversation._id.toString()) ?? null
    }));

    if (!query && !status && engineChats.length > 0) {
      const existingConversationIds = new Set(summaries.map((conversation) => conversation._id));
      const existingConversationContacts = new Set(summaries.map((conversation) => conversation.contactId));

      for (const chat of engineChats) {
        if (existingConversationIds.has(chat.id) || existingConversationContacts.has(chat.contactId)) {
          continue;
        }

        const updatedAt = chat.updatedAt ? new Date(chat.updatedAt) : null;
        const lastMessage = chat.lastMessage?.trim();
        let persistedConversation = null;

        try {
          const metadataUpdates: Record<string, string> = {
            'metadata.messagingChatId': chat.contactId
          };
          if (isObjectIdString(chat.id)) {
            metadataUpdates['metadata.engineConversationId'] = chat.id;
          }

          persistedConversation = await ConversationModel.findOneAndUpdate(
            {
              agencyId: session.actor.agencyId,
              tenantId: selectedTenantId,
              contactId: chat.contactId
            },
            {
              $set: {
                contactName: chat.contactName || null,
                contactPhone: inferPhoneFromContactId(chat.contactId),
                unreadCount: 0,
                ...metadataUpdates,
                ...(lastMessage && lastMessage.length > 0 ? { lastMessageContent: lastMessage } : {}),
                ...(updatedAt && !Number.isNaN(updatedAt.getTime()) ? { lastMessageAt: updatedAt } : {})
              },
              $setOnInsert: {
                agencyId: session.actor.agencyId,
                tenantId: selectedTenantId,
                status: 'open'
              }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          ).lean();
        } catch (error) {
          if (!isDuplicateKeyError(error)) {
            throw error;
          }
        }

        let conversationId = persistedConversation?._id.toString() ?? null;

        if (!conversationId) {
          const existingConversation = await ConversationModel.findOne({
            agencyId: session.actor.agencyId,
            tenantId: selectedTenantId,
            contactId: chat.contactId
          }).select({ _id: 1 }).lean();

          conversationId = existingConversation?._id.toString() ?? null;
        }

        if (!conversationId) {
          continue;
        }

        summaries.push({
          _id: conversationId,
          contactId: chat.contactId,
          contactName: chat.contactName || null,
          contactPhone: inferPhoneFromContactId(chat.contactId),
          avatarUrl: extractAvatarUrlFromMetadata(persistedConversation?.metadata),
          leadSaved: false,
          unreadCount: 0,
          status: 'open',
          assignedTo: null,
          lastMessage: chat.lastMessage && chat.updatedAt
            ? {
                content: chat.lastMessage,
                createdAt: chat.updatedAt
              }
            : null,
          latestProviderMessageId: null,
          contactProfile: {
            totalMessages: 0,
            inboundMessages: 0,
            outboundMessages: 0,
            firstSeenAt: null,
            lastInboundAt: null,
            lastOutboundAt: null
          }
        });
        existingConversationIds.add(conversationId);
        existingConversationContacts.add(chat.contactId);
      }
    }

    if (!query && !status && engineConversationOrder.length > 0) {
      const orderByConversationId = new Map<string, number>();
      engineChats.forEach((chat, index) => {
        orderByConversationId.set(chat.id, index);
        orderByConversationId.set(chat.contactId, index);
      });

      summaries.sort((left, right) => {
        const leftOrder = orderByConversationId.get(left._id)
          ?? orderByConversationId.get(left.contactId)
          ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = orderByConversationId.get(right._id)
          ?? orderByConversationId.get(right.contactId)
          ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      });
    }

    const collapsedSummaries = collapseDuplicateSummaries(
      summaries.slice().sort((left, right) => compareSummaryPriority(left, right))
    );
    collapsedSummaries.sort(
      (left, right) => toMillis(right.lastMessage?.createdAt) - toMillis(left.lastMessage?.createdAt)
    );

    return NextResponse.json(collapsedSummaries);
  } catch (error) {
    console.error('Team Inbox Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}
