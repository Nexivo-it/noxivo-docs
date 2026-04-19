import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { ConversationModel, MessageModel } from '@noxivo/database';
import dbConnect from '../../../../../../../lib/mongodb';
import { getCurrentSession } from '../../../../../../../lib/auth/session';
import { resolveActorTenantCandidates, resolveActorTenantId } from '../../../../../../../lib/auth/tenant-context';
import { engineClient } from '../../../../../../../lib/api/engine-client';
import { syncInboxState } from '../../../../../../../lib/team-inbox-sync';

type TeamInboxActionResponse = {
  success: boolean;
  conversationId?: string;
  messageId?: string;
  status?: string;
  updatedAt?: string;
  error?: {
    code: string;
    message: string;
  };
};

type MessageAction =
  | 'reaction'
  | 'star'
  | 'unstar'
  | 'edit'
  | 'delete'
  | 'pin'
  | 'unpin'
  | 'forward';

type ActionRequestBody = {
  action?: MessageAction;
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

function resolveMessagingSessionPath(binding: { id: string; name?: string }): string {
  const sessionName = typeof binding.name === 'string' ? binding.name.trim() : '';
  if (sessionName.length > 0) {
    return sessionName;
  }
  return binding.id;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string; messageId: string }> }
): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) {
    return buildErrorResponse(401, 'UNAUTHORIZED', 'Unauthorized');
  }

  const requestedTenantId = resolveActorTenantId(session.actor);
  if (!requestedTenantId) {
    return buildErrorResponse(409, 'TENANT_CONTEXT_REQUIRED', 'No tenant workspace available for this agency context');
  }

  const { conversationId, messageId } = await context.params;
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

  const messageLookupFilter = mongoose.Types.ObjectId.isValid(messageId)
    ? {
        conversationId: conversation._id,
        _id: new mongoose.Types.ObjectId(messageId)
      }
    : {
        conversationId: conversation._id,
        $or: [
          { providerMessageId: messageId },
          { messagingMessageId: messageId }
        ]
      };

  const message = await MessageModel.findOne(messageLookupFilter).lean();
  if (!message) {
    return buildErrorResponse(404, 'MESSAGE_NOT_FOUND', 'Message not found');
  }

  const providerMessageId = message.providerMessageId ?? message.messagingMessageId ?? null;
  if (!providerMessageId) {
    return buildErrorResponse(409, 'PROVIDER_MESSAGE_ID_REQUIRED', 'Message is not yet synced with provider id');
  }

  const tenantId = conversation.tenantId.toString();
  const chatId = resolveChatId(conversation.metadata, conversation.contactId);

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
  const encodedProviderMessageId = encodeURIComponent(providerMessageId);

  try {
    switch (action) {
      case 'reaction': {
        const reaction = typeof payload.reaction === 'string' && payload.reaction.trim().length > 0
          ? payload.reaction.trim()
          : '👍';

        await engineClient.proxyMessaging({
          path: 'reaction',
          method: 'PUT',
          body: {
            session: sessionId,
            chatId,
            messageId: providerMessageId,
            reaction
          }
        });
        break;
      }
      case 'star': {
        await engineClient.proxyMessaging({
          path: 'star',
          method: 'PUT',
          body: {
            session: sessionId,
            chatId,
            messageId: providerMessageId,
            star: true
          }
        });
        break;
      }
      case 'unstar': {
        await engineClient.proxyMessaging({
          path: 'star',
          method: 'PUT',
          body: {
            session: sessionId,
            chatId,
            messageId: providerMessageId,
            star: false
          }
        });
        break;
      }
      case 'edit': {
        const text = typeof payload.text === 'string' ? payload.text.trim() : '';
        if (!text) {
          return buildErrorResponse(400, 'INVALID_PAYLOAD', 'edit requires payload.text');
        }

        await engineClient.proxyMessaging({
          path: `${encodedSessionId}/chats/${encodedChatId}/messages/${encodedProviderMessageId}`,
          method: 'PUT',
          body: { text }
        });
        break;
      }
      case 'delete': {
        await engineClient.proxyMessaging({
          path: `${encodedSessionId}/chats/${encodedChatId}/messages/${encodedProviderMessageId}`,
          method: 'DELETE'
        });
        break;
      }
      case 'pin': {
        await engineClient.proxyMessaging({
          path: `${encodedSessionId}/chats/${encodedChatId}/messages/${encodedProviderMessageId}/pin`,
          method: 'POST'
        });
        break;
      }
      case 'unpin': {
        await engineClient.proxyMessaging({
          path: `${encodedSessionId}/chats/${encodedChatId}/messages/${encodedProviderMessageId}/unpin`,
          method: 'POST'
        });
        break;
      }
      case 'forward': {
        await engineClient.proxyMessaging({
          path: 'forwardMessage',
          method: 'POST',
          body: {
            session: sessionId,
            chatId,
            messageId: providerMessageId,
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
    messageId: message._id.toString(),
    status: 'ok',
    updatedAt: new Date().toISOString()
  } satisfies TeamInboxActionResponse);
}
