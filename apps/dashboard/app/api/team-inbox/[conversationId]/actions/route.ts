import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { ConversationModel } from '@noxivo/database';
import dbConnect from '../../../../../lib/mongodb';
import { getCurrentSession } from '../../../../../lib/auth/session';
import { resolveActorTenantCandidates, resolveActorTenantId } from '../../../../../lib/auth/tenant-context';
import { engineClient } from '../../../../../lib/api/engine-client';
import { syncInboxState } from '../../../../../lib/team-inbox-sync';

type TeamInboxActionResponse = {
  success: boolean;
  conversationId?: string;
  messageId?: string;
  status?: string;
  isArchived?: boolean;
  updatedAt?: string;
  error?: {
    code: string;
    message: string;
  };
};

type ConversationAction =
  | 'seen'
  | 'archive'
  | 'unarchive'
  | 'unread'
  | 'typing_start'
  | 'typing_stop'
  | 'send_poll'
  | 'send_poll_vote'
  | 'send_location'
  | 'send_contact_vcard'
  | 'send_buttons'
  | 'send_list'
  | 'send_link_preview'
  | 'forward_message';

type ActionRequestBody = {
  action?: ConversationAction;
  payload?: Record<string, unknown>;
};

function buildErrorResponse(status: number, code: string, message: string): Response {
  return NextResponse.json(
    {
      success: false,
      error: { code, message }
    } satisfies TeamInboxActionResponse,
    { status }
  );
}

function resolveChatId(metadata: unknown, fallbackContactId: string): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return fallbackContactId;
  }

  const chatId = typeof (metadata as { messagingChatId?: unknown }).messagingChatId === 'string'
    ? (metadata as { messagingChatId: string }).messagingChatId.trim()
    : '';

  return chatId.length > 0 ? chatId : fallbackContactId;
}

function inferConversationChannel(metadata: unknown, contactId: string): 'whatsapp' | 'webhook' | 'internal' | 'unknown' {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const record = metadata as Record<string, unknown>;
    const source = typeof record.lastMessageSource === 'string' ? record.lastMessageSource.trim().toLowerCase() : '';

    if (typeof record.webhookInboxSourceId === 'string') {
      return 'webhook';
    }
    if (typeof record.messagingChatId === 'string' && record.messagingChatId.trim().length > 0) {
      return 'whatsapp';
    }
    if (source.includes('webhook')) {
      return 'webhook';
    }
    if (source.includes('dashboard.internal-inbox') || source.includes('dashboard.engine-client')) {
      return 'internal';
    }
  }

  const normalizedContactId = contactId.trim().toLowerCase();
  if (
    normalizedContactId.includes('@c.us')
    || normalizedContactId.includes('@s.whatsapp.net')
    || normalizedContactId.includes('@lid')
  ) {
    return 'whatsapp';
  }

  const [localPart] = normalizedContactId.split('@');
  const digits = (localPart ?? '').replace(/\D/g, '');
  if (digits.length >= 7) {
    return 'whatsapp';
  }

  return 'unknown';
}

function resolveMessagingSessionPath(binding: { id: string; name?: string }): string {
  const sessionName = typeof binding.name === 'string' ? binding.name.trim() : '';
  if (sessionName.length > 0) {
    return sessionName;
  }
  return binding.id;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> }
): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) {
    return buildErrorResponse(401, 'UNAUTHORIZED', 'Unauthorized');
  }

  const requestedTenantId = resolveActorTenantId(session.actor);
  if (!requestedTenantId) {
    return buildErrorResponse(409, 'TENANT_CONTEXT_REQUIRED', 'No tenant workspace available for this agency context');
  }

  const { conversationId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as ActionRequestBody;
  const action = body.action;
  const payload = body.payload ?? {};

  if (!action) {
    return buildErrorResponse(400, 'INVALID_ACTION', 'Action is required');
  }

  await dbConnect();
  const resolvedTenantCandidates = await resolveActorTenantCandidates(session.actor);
  const tenantCandidates = resolvedTenantCandidates.length > 0
    ? resolvedTenantCandidates
    : [requestedTenantId];
  const idFilter = mongoose.Types.ObjectId.isValid(conversationId)
    ? { _id: new mongoose.Types.ObjectId(conversationId) }
    : { 'metadata.engineConversationId': conversationId };

  const conversation = await ConversationModel.findOne({
    ...idFilter,
    agencyId: session.actor.agencyId,
    tenantId: { $in: tenantCandidates }
  }).lean();

  if (!conversation) {
    return buildErrorResponse(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  }

  const tenantId = conversation.tenantId.toString();
  const chatId = resolveChatId(conversation.metadata, conversation.contactId);
  const conversationChannel = inferConversationChannel(conversation.metadata, conversation.contactId);

  if ((action === 'archive' || action === 'unarchive') && conversationChannel !== 'whatsapp') {
    const nextStatus = action === 'archive' ? 'closed' : 'open';
    const isArchived = action === 'archive';
    const updatedConversation = await ConversationModel.findByIdAndUpdate(
      conversation._id,
      { $set: { status: nextStatus, 'metadata.isArchived': isArchived } },
      { new: true }
    ).lean();

    return NextResponse.json({
      success: true,
      conversationId,
      status: updatedConversation?.status ?? nextStatus,
      isArchived,
      updatedAt: new Date().toISOString()
    } satisfies TeamInboxActionResponse);
  }

  const binding = await engineClient
    .getSessionByTenant(session.actor.agencyId, tenantId)
    .catch(() => null);

  if (!binding?.id) {
    return buildErrorResponse(409, 'SESSION_NOT_AVAILABLE', 'No active WhatsApp session binding found');
  }

  const sessionId = binding.id;
  const sessionPath = resolveMessagingSessionPath(binding);
  const encodedSessionId = encodeURIComponent(sessionPath);
  const encodedChatId = encodeURIComponent(chatId);
  let actionStatus = 'ok';

  try {
    switch (action) {
      case 'seen': {
        await engineClient.proxyMessaging({
          path: 'sendSeen',
          method: 'POST',
          body: { session: sessionId, chatId }
        });
        break;
      }
      case 'archive': {
        await engineClient.proxyMessaging({
          path: `${encodedSessionId}/chats/${encodedChatId}/archive`,
          method: 'POST'
        });
        await ConversationModel.updateOne(
          { _id: conversation._id },
          { $set: { status: 'closed', 'metadata.isArchived': true } }
        ).exec();
        actionStatus = 'closed';
        break;
      }
      case 'unarchive': {
        await engineClient.proxyMessaging({
          path: `${encodedSessionId}/chats/${encodedChatId}/unarchive`,
          method: 'POST'
        });
        await ConversationModel.updateOne(
          { _id: conversation._id },
          { $set: { status: 'open', 'metadata.isArchived': false } }
        ).exec();
        actionStatus = 'open';
        break;
      }
      case 'unread': {
        await engineClient.proxyMessaging({
          path: `${encodedSessionId}/chats/${encodedChatId}/unread`,
          method: 'POST'
        });
        break;
      }
      case 'typing_start': {
        await engineClient.proxyMessaging({
          path: 'startTyping',
          method: 'POST',
          body: { session: sessionId, chatId }
        });
        break;
      }
      case 'typing_stop': {
        await engineClient.proxyMessaging({
          path: 'stopTyping',
          method: 'POST',
          body: { session: sessionId, chatId }
        });
        break;
      }
      case 'send_poll': {
        await engineClient.proxyMessaging({
          path: 'sendPoll',
          method: 'POST',
          body: {
            session: sessionId,
            chatId,
            ...payload
          }
        });
        break;
      }
      case 'send_poll_vote': {
        await engineClient.proxyMessaging({
          path: 'sendPollVote',
          method: 'POST',
          body: {
            session: sessionId,
            chatId,
            ...payload
          }
        });
        break;
      }
      case 'send_location': {
        await engineClient.proxyMessaging({
          path: 'sendLocation',
          method: 'POST',
          body: {
            session: sessionId,
            chatId,
            ...payload
          }
        });
        break;
      }
      case 'send_contact_vcard': {
        await engineClient.proxyMessaging({
          path: 'sendContactVcard',
          method: 'POST',
          body: {
            session: sessionId,
            chatId,
            ...payload
          }
        });
        break;
      }
      case 'send_buttons': {
        await engineClient.proxyMessaging({
          path: 'sendButtons',
          method: 'POST',
          body: {
            session: sessionId,
            chatId,
            ...payload
          }
        });
        break;
      }
      case 'send_list': {
        await engineClient.proxyMessaging({
          path: 'sendList',
          method: 'POST',
          body: {
            session: sessionId,
            chatId,
            ...payload
          }
        });
        break;
      }
      case 'send_link_preview': {
        const text = typeof payload.text === 'string' ? payload.text.trim() : '';
        if (!text) {
          return buildErrorResponse(400, 'INVALID_PAYLOAD', 'send_link_preview requires payload.text');
        }

        await engineClient.proxyMessaging({
          path: 'send/link-custom-preview',
          method: 'POST',
          body: {
            session: sessionId,
            chatId,
            text,
            ...payload
          }
        });
        break;
      }
      case 'forward_message': {
        await engineClient.proxyMessaging({
          path: 'forwardMessage',
          method: 'POST',
          body: {
            session: sessionId,
            chatId,
            ...payload
          }
        });
        break;
      }
      default: {
        return buildErrorResponse(400, 'UNSUPPORTED_ACTION', `Unsupported action: ${action}`);
      }
    }
  } catch (error) {
    return buildErrorResponse(
      502,
      'ENGINE_ACTION_FAILED',
      error instanceof Error ? error.message : 'Action failed'
    );
  }

  await syncInboxState({
    agencyId: session.actor.agencyId,
    tenantId,
    conversationId,
    limit: 40,
    pages: 1
  });

  return NextResponse.json({
    success: true,
    conversationId,
    status: actionStatus,
    isArchived: actionStatus === 'closed',
    updatedAt: new Date().toISOString()
  } satisfies TeamInboxActionResponse);
}
