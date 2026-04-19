import { NextResponse } from 'next/server';
import { ConversationModel } from '@noxivo/database';
import dbConnect from '../../../../../lib/mongodb';
import { getCurrentSession } from '../../../../../lib/auth/session';
import { broadcastInboxEvent } from '../../../../../lib/inbox-events';
import { resolveActorTenantCandidates, resolveActorTenantId } from '../../../../../lib/auth/tenant-context';

export async function POST(
  _request: Request,
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
  const { conversationId } = await context.params;
  const conversation = await ConversationModel.findOneAndUpdate(
    {
      _id: conversationId,
      agencyId: session.actor.agencyId,
      tenantId: { $in: tenantCandidates }
    },
    { unreadCount: 0 },
    { new: true }
  ).lean();

  if (!conversation) {
    return NextResponse.json({ ok: true });
  }

  await broadcastInboxEvent(conversation.tenantId.toString(), {
    type: 'conversation.updated',
    conversationId: conversationId
  });

  return NextResponse.json({ ok: true });
}
