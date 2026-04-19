import { NextResponse } from 'next/server';
import { WebhookInboxActivationModel } from '@noxivo/database';
import dbConnect from '../../../../lib/mongodb';
import { canManageCredentials } from '../../../../lib/auth/authorization';
import { getCurrentSession } from '../../../../lib/auth/session';
import { resolveActorTenantId } from '../../../../lib/auth/tenant-context';
import {
  activateWebhookInbox,
  deactivateWebhookInbox,
  getWebhookInboxStatus,
} from '../../../../lib/settings/webhook-inbox-activation';

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

  const status = await getWebhookInboxStatus(
    session.actor.agencyId.toString(),
    tenantId.toString()
  );

  return NextResponse.json({
    isActive: status.isActive,
    webhookUrl: status.webhookUrl,
    activatedAt: status.activatedAt,
    deactivatedAt: status.deactivatedAt,
  });
}

export async function POST(): Promise<NextResponse> {
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

  const result = await activateWebhookInbox(
    session.actor.agencyId.toString(),
    tenantId.toString()
  );

  return NextResponse.json({
    isActive: result.isActive,
    webhookUrl: result.webhookUrl,
    apiKey: result.apiKey,
    activatedAt: result.activatedAt,
  });
}

export async function DELETE(): Promise<NextResponse> {
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

  await deactivateWebhookInbox(
    session.actor.agencyId.toString(),
    tenantId.toString()
  );

  return NextResponse.json({ isActive: false });
}