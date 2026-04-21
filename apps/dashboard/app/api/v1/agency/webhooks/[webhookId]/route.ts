import { NextResponse } from 'next/server';
import { WebhookModel } from '@noxivo/database';
import dbConnect from '../../../../../../lib/mongodb';
import { canManageAgencySettings } from '../../../../../../lib/auth/authorization';
import { getCurrentSession } from '../../../../../../lib/auth/session';

type WebhookEvent =
  | 'booking.created'
  | 'booking.updated'
  | 'booking.cancelled'
  | 'customer.created'
  | 'customer.updated'
  | 'service.created'
  | 'service.updated'
  | 'inventory.low';

type WebhookPayload = {
  name: string;
  url: string;
  events: WebhookEvent[];
  secret?: string;
  isActive?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseWebhookPayload(input: unknown): WebhookPayload {
  if (!isRecord(input)) {
    throw new Error('Invalid payload object');
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const url = typeof input.url === 'string' ? input.url.trim() : '';
  const secret = typeof input.secret === 'string' ? input.secret.trim() : '';
  const isActive = typeof input.isActive === 'boolean' ? input.isActive : true;

  if (name.length === 0) {
    throw new Error('Webhook name is required');
  }

  if (url.length === 0) {
    throw new Error('Webhook URL is required');
  }

  if (!Array.isArray(input.events) || input.events.length === 0 || input.events.some((event) => typeof event !== 'string')) {
    throw new Error('Webhook events are required');
  }

  return {
    name,
    url,
    events: input.events as WebhookEvent[],
    secret,
    isActive,
  };
}

function mapWebhookDto(webhook: {
  _id: { toString(): string };
  name: string;
  url: string;
  events: string[];
  secret?: string;
  isActive: boolean;
  lastTriggeredAt?: Date | null;
  lastStatus?: string | null;
  lastError?: string | null;
}) {
  return {
    id: webhook._id.toString(),
    name: webhook.name,
    url: webhook.url,
    events: webhook.events,
    secret: webhook.secret ? '***REDACTED***' : '',
    isActive: webhook.isActive,
    lastTriggeredAt: webhook.lastTriggeredAt?.toISOString() ?? null,
    lastStatus: webhook.lastStatus ?? null,
    lastError: webhook.lastError ?? null,
  };
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ webhookId: string }> },
): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageAgencySettings(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { webhookId } = await context.params;
    const payload = parseWebhookPayload(await request.json());
    await dbConnect();

    const existing = await WebhookModel.findOne({
      _id: webhookId,
      agencyId: session.actor.agencyId,
    }).lean();

    if (!existing) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    await WebhookModel.findByIdAndUpdate(webhookId, {
      $set: {
        name: payload.name,
        url: payload.url,
        events: payload.events,
        secret: payload.secret || existing.secret,
        isActive: payload.isActive ?? true,
      },
    });

    const updated = await WebhookModel.findById(webhookId).lean().exec();
    if (!updated) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    return NextResponse.json(mapWebhookDto(updated));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update webhook';
    const status = message.includes('required') || message.includes('Invalid payload') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ webhookId: string }> },
): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageAgencySettings(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { webhookId } = await context.params;
  await dbConnect();

  const result = await WebhookModel.deleteOne({
    _id: webhookId,
    agencyId: session.actor.agencyId,
  });

  if (result.deletedCount === 0) {
    return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
