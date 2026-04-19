import { NextResponse } from 'next/server';
import { ContactProfileModel, ConversationModel } from '@noxivo/database';
import dbConnect from '../../../../../lib/mongodb';
import { getCurrentSession } from '../../../../../lib/auth/session';
import { resolveActorTenantCandidates, resolveActorTenantId } from '../../../../../lib/auth/tenant-context';

const LEAD_TAG_LABEL = 'lead';

function normalizeTagLabel(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeTags(input: Array<{ id?: string | null; label: string }>): Array<{ id?: string | null; label: string }> {
  const seen = new Set<string>();
  const tags: Array<{ id?: string | null; label: string }> = [];

  for (const tag of input) {
    const normalizedLabel = normalizeTagLabel(tag.label);
    if (normalizedLabel.length === 0 || seen.has(normalizedLabel)) {
      continue;
    }

    seen.add(normalizedLabel);
    tags.push({
      ...(tag.id ? { id: tag.id } : {}),
      label: tag.label.trim()
    });
  }

  return tags;
}

function hasLeadTag(input: Array<{ id?: string | null; label: string }>): boolean {
  return input.some((tag) => normalizeTagLabel(tag.label) === LEAD_TAG_LABEL);
}

async function resolveConversationForRequest(conversationId: string) {
  const session = await getCurrentSession();
  if (!session) {
    return {
      session: null,
      conversation: null,
      requestedTenantId: null,
      status: 401 as const,
      error: 'Unauthorized'
    };
  }

  const requestedTenantId = resolveActorTenantId(session.actor);
  if (!requestedTenantId) {
    return {
      session,
      conversation: null,
      requestedTenantId: null,
      status: 409 as const,
      error: 'No tenant workspace available for this agency context'
    };
  }

  await dbConnect();
  const resolvedTenantCandidates = await resolveActorTenantCandidates(session.actor);
  const tenantCandidates = resolvedTenantCandidates.length > 0
    ? resolvedTenantCandidates
    : [requestedTenantId];

  const conversation = await ConversationModel.findOne({
    _id: conversationId,
    agencyId: session.actor.agencyId,
    tenantId: { $in: tenantCandidates }
  }).lean().exec();

  if (!conversation) {
    return {
      session,
      conversation: null,
      requestedTenantId,
      status: 404 as const,
      error: 'Conversation not found'
    };
  }

  return {
    session,
    conversation,
    requestedTenantId,
    status: 200 as const,
    error: null
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ conversationId: string }> }
): Promise<Response> {
  const { conversationId } = await context.params;
  const resolved = await resolveConversationForRequest(conversationId);

  if (!resolved.session || !resolved.conversation) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const profile = await ContactProfileModel.findOne({
    agencyId: resolved.session.actor.agencyId,
    tenantId: resolved.conversation.tenantId,
    contactId: resolved.conversation.contactId
  })
    .select({ crmTags: 1 })
    .lean()
    .exec();

  const tags = normalizeTags(
    Array.isArray(profile?.crmTags)
      ? profile.crmTags.map((tag) => ({
          id: typeof tag.id === 'string' ? tag.id : null,
          label: tag.label
        }))
      : []
  );

  return NextResponse.json({
    success: true,
    leadSaved: hasLeadTag(tags)
  });
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ conversationId: string }> }
): Promise<Response> {
  const { conversationId } = await context.params;
  const resolved = await resolveConversationForRequest(conversationId);

  if (!resolved.session || !resolved.conversation) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const profile = await ContactProfileModel.findOne({
    agencyId: resolved.session.actor.agencyId,
    tenantId: resolved.conversation.tenantId,
    contactId: resolved.conversation.contactId
  })
    .select({ crmTags: 1 })
    .lean()
    .exec();

  const currentTags = normalizeTags(
    Array.isArray(profile?.crmTags)
      ? profile.crmTags.map((tag) => ({
          id: typeof tag.id === 'string' ? tag.id : null,
          label: tag.label
        }))
      : []
  );

  const nextTags = hasLeadTag(currentTags)
    ? currentTags
    : [...currentTags, { label: 'Lead' }];

  await ContactProfileModel.findOneAndUpdate(
    {
      agencyId: resolved.session.actor.agencyId,
      tenantId: resolved.conversation.tenantId,
      contactId: resolved.conversation.contactId
    },
    {
      $set: {
        contactName: resolved.conversation.contactName ?? null,
        contactPhone: resolved.conversation.contactPhone ?? null,
        crmTags: normalizeTags(nextTags),
        lastCrmSyncedAt: new Date()
      },
      $setOnInsert: {
        agencyId: resolved.session.actor.agencyId,
        tenantId: resolved.conversation.tenantId,
        contactId: resolved.conversation.contactId
      }
    },
    { upsert: true, setDefaultsOnInsert: true, new: true }
  ).exec();

  return NextResponse.json({
    success: true,
    leadSaved: true,
    conversationId
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ conversationId: string }> }
): Promise<Response> {
  const { conversationId } = await context.params;
  const resolved = await resolveConversationForRequest(conversationId);

  if (!resolved.session || !resolved.conversation) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const profile = await ContactProfileModel.findOne({
    agencyId: resolved.session.actor.agencyId,
    tenantId: resolved.conversation.tenantId,
    contactId: resolved.conversation.contactId
  })
    .select({ crmTags: 1 })
    .lean()
    .exec();

  if (!profile) {
    return NextResponse.json({
      success: true,
      leadSaved: false,
      conversationId
    });
  }

  const nextTags = normalizeTags(
    (Array.isArray(profile.crmTags) ? profile.crmTags : [])
      .map((tag) => ({
        id: typeof tag.id === 'string' ? tag.id : null,
        label: tag.label
      }))
      .filter((tag) => normalizeTagLabel(tag.label) !== LEAD_TAG_LABEL)
  );

  await ContactProfileModel.updateOne(
    {
      agencyId: resolved.session.actor.agencyId,
      tenantId: resolved.conversation.tenantId,
      contactId: resolved.conversation.contactId
    },
    {
      $set: {
        crmTags: nextTags,
        lastCrmSyncedAt: new Date()
      }
    }
  ).exec();

  return NextResponse.json({
    success: true,
    leadSaved: false,
    conversationId
  });
}
