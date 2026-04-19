import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { WebhookInboxSourceModel } from '@noxivo/database';
import dbConnect from '../../../../lib/mongodb';
import { canManageCredentials } from '../../../../lib/auth/authorization';
import { getCurrentSession } from '../../../../lib/auth/session';
import { resolveActorTenantId } from '../../../../lib/auth/tenant-context';
import {
  hashWebhookInboundSecret,
  isWebhookInboxSourceValidationError,
  mapWebhookInboxSourceDto,
  parseCreateWebhookInboxSourcePayload,
} from '../../../../lib/settings/webhook-inbox-sources';

export async function GET(): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageCredentials(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenantId = resolveActorTenantId(session.actor);
  if (!tenantId) {
    return NextResponse.json(
      { error: 'No tenant workspace available for this agency context' },
      { status: 409 },
    );
  }

  await dbConnect();

  const sources = await WebhookInboxSourceModel.find(
    { agencyId: session.actor.agencyId, tenantId },
    { inboundSecretHash: 0 },
  )
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  return NextResponse.json({
    sources: sources.map((source) => mapWebhookInboxSourceDto(source)),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageCredentials(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenantId = resolveActorTenantId(session.actor);
  if (!tenantId) {
    return NextResponse.json(
      { error: 'No tenant workspace available for this agency context' },
      { status: 409 },
    );
  }

  try {
    const payload = parseCreateWebhookInboxSourcePayload(await request.json());
    await dbConnect();

    const source = await WebhookInboxSourceModel.create({
      agencyId: session.actor.agencyId,
      tenantId,
      name: payload.name,
      status: 'active',
      inboundPath: randomUUID(),
      inboundSecretHash: hashWebhookInboundSecret(payload.inboundSecret),
      outboundUrl: payload.outboundUrl,
      outboundHeaders: payload.outboundHeaders,
      disabledAt: null,
    });

    return NextResponse.json(
      { source: mapWebhookInboxSourceDto(source) },
      { status: 201 },
    );
  } catch (error) {
    if (isWebhookInboxSourceValidationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to create webhook inbox source' }, { status: 500 });
  }
}
