import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  INTERNAL_INBOX_IDEMPOTENCY_HEADER,
  WORKFLOW_ENGINE_INTERNAL_PSK_HEADER
} from '@noxivo/contracts';
import { ConversationModel, MessageModel } from '@noxivo/database';
import dbConnect from '../../../../../../lib/mongodb';
import { getCurrentSession } from '../../../../../../lib/auth/session';
import { resolveActorTenantCandidates, resolveActorTenantId } from '../../../../../../lib/auth/tenant-context';

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string; messageId: string }> }
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
  const { conversationId, messageId } = await context.params;

  const conversation = await ConversationModel.findOne({
    _id: conversationId,
    agencyId: session.actor.agencyId,
    tenantId: { $in: tenantCandidates }
  });

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const message = await MessageModel.findOne({
    _id: messageId,
    conversationId
  });

  if (!message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  const internalBaseUrl = process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL;
  const internalPsk = process.env.WORKFLOW_ENGINE_INTERNAL_PSK;

  if (!internalBaseUrl || !internalPsk) {
    return NextResponse.json({ error: 'Workflow engine internal send is not configured' }, { status: 500 });
  }

  const idempotencyKey = `${messageId}-resend-${randomUUID()}`;

  try {
    const internalResponse = await fetch(
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
          tenantId: conversation.tenantId.toString(),
          operatorUserId: session.actor.userId,
          content: message.content,
          attachments: message.attachments ?? [],
          replyToMessageId: message.replyToMessageId
        })
      }
    );

    if (!internalResponse.ok) {
      return NextResponse.json({ error: 'Failed to resend message' }, { status: internalResponse.status });
    }

    const responsePayload = await internalResponse.json();

    return NextResponse.json({
      messageId: message._id.toString(),
      resentAt: new Date().toISOString(),
      ...(responsePayload as object)
    });
  } catch {
    return NextResponse.json({ error: 'Failed to resend message' }, { status: 502 });
  }
}
