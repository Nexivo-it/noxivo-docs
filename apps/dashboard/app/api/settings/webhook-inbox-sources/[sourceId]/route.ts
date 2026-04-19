import { NextResponse } from 'next/server';
import { WebhookInboxSourceModel } from '@noxivo/database';
import dbConnect from '../../../../../lib/mongodb';
import { canManageCredentials } from '../../../../../lib/auth/authorization';
import { getCurrentSession } from '../../../../../lib/auth/session';
import { resolveActorTenantId } from '../../../../../lib/auth/tenant-context';
import {
  hashWebhookInboundSecret,
  isWebhookInboxSourceValidationError,
  mapWebhookInboxSourceDto,
  parseUpdateWebhookInboxSourcePayload,
} from '../../../../../lib/settings/webhook-inbox-sources';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ sourceId: string }> },
): Promise<NextResponse> {
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
    const payload = parseUpdateWebhookInboxSourcePayload(await request.json());
    const { sourceId } = await context.params;
    await dbConnect();

    const update: {
      name?: string;
      outboundUrl?: string;
      outboundHeaders?: Record<string, string>;
      inboundSecretHash?: string;
      status?: 'active' | 'disabled';
      disabledAt?: Date | null;
    } = {};

    if (payload.name) {
      update.name = payload.name;
    }

    if (payload.outboundUrl) {
      update.outboundUrl = payload.outboundUrl;
    }

    if (payload.outboundHeaders) {
      update.outboundHeaders = payload.outboundHeaders;
    }

    if (payload.inboundSecret) {
      update.inboundSecretHash = hashWebhookInboundSecret(payload.inboundSecret);
    }

    if (payload.status) {
      update.status = payload.status;
      update.disabledAt = payload.status === 'disabled' ? new Date() : null;
    }

    const source = await WebhookInboxSourceModel.findOneAndUpdate(
      {
        _id: sourceId,
        agencyId: session.actor.agencyId,
        tenantId,
      },
      { $set: update },
      {
        new: true,
      },
    )
      .lean()
      .exec();

    if (!source) {
      return NextResponse.json({ error: 'Webhook inbox source not found' }, { status: 404 });
    }

    return NextResponse.json({ source: mapWebhookInboxSourceDto(source) });
  } catch (error) {
    if (isWebhookInboxSourceValidationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to update webhook inbox source' }, { status: 500 });
  }
}
