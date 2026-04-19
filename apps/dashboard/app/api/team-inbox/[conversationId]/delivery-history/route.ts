import { NextResponse } from 'next/server';
import { ConversationModel, MessageModel, MessageDeliveryEventModel } from '@noxivo/database';
import dbConnect from '../../../../../lib/mongodb';
import { getCurrentSession } from '../../../../../lib/auth/session';
import { resolveActorTenantCandidates, resolveActorTenantId } from '../../../../../lib/auth/tenant-context';

export async function GET(
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

  const conversation = await ConversationModel.findOne({
    _id: conversationId,
    agencyId: session.actor.agencyId,
    tenantId: { $in: tenantCandidates }
  }).lean();

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const messageIds = await MessageModel.find({ conversationId }, { _id: 1 })
    .lean()
    .then(msgs => msgs.map(m => m._id.toString()));

  if (messageIds.length === 0) {
    return NextResponse.json([]);
  }

  const events = await MessageDeliveryEventModel.find(
    { messageId: { $in: messageIds } },
    {},
    { sort: { occurredAt: -1 }, limit: 100 }
  ).lean();

  return NextResponse.json(events.map(event => ({
    messageId: event.messageId,
    deliveryStatus: event.deliveryStatus,
    providerAckName: event.providerAckName,
    providerAck: event.providerAck,
    source: event.source,
    error: event.error,
    occurredAt: event.occurredAt?.toISOString()
  })));
}
