import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { ConversationModel } from '@noxivo/database';
import { getCurrentSession } from '../../../../../lib/auth/session';
import { broadcastInboxEvent } from '../../../../../lib/inbox-events';
import { resolveActorTenantCandidates, resolveActorTenantId } from '../../../../../lib/auth/tenant-context';
import dbConnect from '../../../../../lib/mongodb';

export async function POST(
  _request: Request,
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
    await dbConnect();
    const resolvedTenantCandidates = await resolveActorTenantCandidates(session.actor);
    const tenantCandidates = resolvedTenantCandidates.length > 0
      ? resolvedTenantCandidates
      : [requestedTenantId];

    const idFilter = mongoose.Types.ObjectId.isValid(conversationId)
      ? { _id: new mongoose.Types.ObjectId(conversationId) }
      : { 'metadata.engineConversationId': conversationId };

    const conversation = await ConversationModel.findOne(
      {
        ...idFilter,
        agencyId: session.actor.agencyId,
        tenantId: { $in: tenantCandidates }
      }
    ).lean();

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    if (conversation.status !== 'handoff' && conversation.status !== 'assigned') {
      return NextResponse.json(
        { error: 'Conversation is not in handoff state' },
        { status: 400 }
      );
    }

    const updatedConversation = await ConversationModel.findByIdAndUpdate(
      conversation._id,
      {
        assignedTo: null,
        status: 'open'
      },
      { new: true }
    ).lean();

    if (!updatedConversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    await broadcastInboxEvent(updatedConversation.tenantId.toString(), {
      type: 'assignment.updated',
      conversationId: updatedConversation._id.toString()
    });

    return NextResponse.json({
      conversationId: updatedConversation._id.toString(),
      status: updatedConversation.status
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to return conversation to AI' },
      { status: 500 }
    );
  }
}
