import { NextResponse } from 'next/server';
import { WORKFLOW_ENGINE_INTERNAL_PSK_HEADER } from '@noxivo/contracts';
import { ConversationModel } from '@noxivo/database';
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
  }).lean().exec();
  const scopedTenantId = conversation?.tenantId?.toString() ?? tenantCandidates[0] ?? requestedTenantId;

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const internalBaseUrl = process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL;
  const internalPsk = process.env.WORKFLOW_ENGINE_INTERNAL_PSK;

  if (!internalBaseUrl || !internalPsk) {
    return NextResponse.json({ error: 'Workflow engine internal CRM is not configured' }, { status: 500 });
  }

  try {
    const response = await fetch(
      `${internalBaseUrl.replace(/\/$/, '')}/v1/internal/crm/conversations/${conversationId}/profile?agencyId=${session.actor.agencyId}&tenantId=${scopedTenantId}`,
      {
        method: 'GET',
        headers: {
          [WORKFLOW_ENGINE_INTERNAL_PSK_HEADER]: internalPsk
        }
      }
    );

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to load CRM profile' }, { status: response.status });
    }

    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: 'Failed to load CRM profile' }, { status: 502 });
  }
}

export async function PATCH(
  request: Request,
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
  }).lean().exec();
  const scopedTenantId = conversation?.tenantId?.toString() ?? tenantCandidates[0] ?? requestedTenantId;

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const internalBaseUrl = process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL;
  const internalPsk = process.env.WORKFLOW_ENGINE_INTERNAL_PSK;

  if (!internalBaseUrl || !internalPsk) {
    return NextResponse.json({ error: 'Workflow engine internal CRM is not configured' }, { status: 500 });
  }

  const rawPayload = await request.json().catch(() => null);

  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return NextResponse.json({ error: 'Invalid CRM request' }, { status: 400 });
  }

  const payload = {
    ...(rawPayload as Record<string, unknown>),
    agencyId: session.actor.agencyId,
    tenantId: scopedTenantId,
    ...((rawPayload as Record<string, unknown>).action === 'add_note'
      ? {
          note: {
            ...(((rawPayload as Record<string, unknown>).note as Record<string, unknown> | undefined) ?? {}),
            authorUserId: session.actor.userId
          }
        }
      : {})
  };

  try {
    const response = await fetch(
      `${internalBaseUrl.replace(/\/$/, '')}/v1/internal/crm/conversations/${conversationId}/profile`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          [WORKFLOW_ENGINE_INTERNAL_PSK_HEADER]: internalPsk
        },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to update CRM profile' }, { status: response.status });
    }

    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: 'Failed to update CRM profile' }, { status: 502 });
  }
}
