import { NextResponse } from 'next/server';
import { WebhookInboxActivationModel, ConversationModel, MessageModel } from '@noxivo/database';
import dbConnect from '../../../../lib/mongodb';
import {
  parseWebhookInboxMessagePayload,
  isWebhookInboxMessageValidationError,
} from '../../../../lib/settings/webhook-inbox-activation';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  try {
    const { path } = await params;
    const webhookPath = path.join('/');

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }

    const apiKey = authHeader.slice(7);

    await dbConnect();

    const activation = await WebhookInboxActivationModel.findOne({
      webhookUrl: { $regex: new RegExp(`/${webhookPath}$`) },
      apiKey,
      isActive: true,
    });

    if (!activation) {
      return NextResponse.json({ error: 'Invalid webhook credentials' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const payload = parseWebhookInboxMessagePayload(body);

    const contactId = payload.contactPhone || `webhook-${Date.now()}`;
    let conversation = await ConversationModel.findOne({
      agencyId: activation.agencyId,
      tenantId: activation.tenantId,
      contactId,
    });

    if (!conversation) {
      conversation = await ConversationModel.create({
        agencyId: activation.agencyId,
        tenantId: activation.tenantId,
        contactId,
        contactName: payload.contactName || null,
        contactPhone: payload.contactPhone || null,
        status: 'open',
        lastMessageContent: payload.message,
        lastMessageAt: new Date(),
        unreadCount: 1,
        metadata: {
          source: 'webhook',
          sourceId: activation._id,
          ...payload.metadata,
        },
      });
    } else {
      conversation.lastMessageContent = payload.message;
      conversation.lastMessageAt = new Date();
      conversation.unreadCount += 1;
      conversation.metadata = {
        ...conversation.metadata,
        source: 'webhook',
        sourceId: activation._id,
        ...payload.metadata,
      };
      await conversation.save();
    }

    const message = await MessageModel.create({
      conversationId: conversation._id,
      role: 'user',
      content: payload.message,
      timestamp: new Date(),
      deliveryStatus: 'delivered',
      metadata: {
        source: 'webhook',
        ...payload.metadata,
      },
    });

    return NextResponse.json({
      success: true,
      conversationId: conversation._id,
      messageId: message._id,
    });
  } catch (error) {
    if (isWebhookInboxMessageValidationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('[webhook-inbox] Error processing webhook:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}