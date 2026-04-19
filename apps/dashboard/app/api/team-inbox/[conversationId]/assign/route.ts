import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { ConversationModel } from '@noxivo/database';
import { getCurrentSession } from '../../../../../lib/auth/session';
import { broadcastInboxEvent } from '../../../../../lib/inbox-events';
import { resolveActorTenantCandidates, resolveActorTenantId } from '../../../../../lib/auth/tenant-context';
import dbConnect from '../../../../../lib/mongodb';

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> }
): Promise<Response> {
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

    const { conversationId } = await context.params;
    const payload = await request.json().catch(() => ({})) as { assignedTo?: string | null };
    const assignedToRaw = payload.assignedTo === null
      ? null
      : payload.assignedTo ?? session.actor.userId;
    const assignedTo = assignedToRaw && mongoose.Types.ObjectId.isValid(assignedToRaw)
      ? new mongoose.Types.ObjectId(assignedToRaw)
      : null;

    await dbConnect();
    const resolvedTenantCandidates = await resolveActorTenantCandidates(session.actor);
    const tenantCandidates = resolvedTenantCandidates.length > 0
      ? resolvedTenantCandidates
      : [requestedTenantId];

    const idFilter = mongoose.Types.ObjectId.isValid(conversationId)
      ? { _id: new mongoose.Types.ObjectId(conversationId) }
      : { 'metadata.engineConversationId': conversationId };

    const conversation = await ConversationModel.findOneAndUpdate(
      {
        ...idFilter,
        agencyId: session.actor.agencyId,
        tenantId: { $in: tenantCandidates }
      },
      {
        assignedTo,
        status: assignedTo ? 'handoff' : 'open'
      },
      { new: true }
    ).lean();

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    await broadcastInboxEvent(conversation.tenantId.toString(), {
      type: 'assignment.updated',
      conversationId: conversation._id.toString()
    });

    return NextResponse.json({
      _id: conversation._id.toString(),
      assignedTo: conversation.assignedTo ? conversation.assignedTo.toString() : null,
      status: conversation.status
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to assign conversation' },
      { status: 500 }
    );
  }
}
