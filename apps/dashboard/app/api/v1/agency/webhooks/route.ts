import { NextResponse } from 'next/server';
import { WebhookModel } from '@noxivo/database';
import dbConnect from '../../../../../lib/mongodb';
import { canManageAgencySettings } from '../../../../../lib/auth/authorization';
import { getCurrentSession } from '../../../../../lib/auth/session';

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

export async function GET(): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageAgencySettings(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await dbConnect();

  const webhooks = await WebhookModel.find({ agencyId: session.actor.agencyId })
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  return NextResponse.json(webhooks.map((webhook) => mapWebhookDto(webhook)));
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageAgencySettings(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const payload = parseWebhookPayload(await request.json());
    await dbConnect();

    const webhook = await WebhookModel.create({
      agencyId: session.actor.agencyId,
      name: payload.name,
      url: payload.url,
      events: payload.events,
      secret: payload.secret ?? '',
      isActive: payload.isActive ?? true,
    });

    return NextResponse.json(mapWebhookDto(webhook), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create webhook';
    const status = message.includes('required') || message.includes('Invalid payload') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
