import { NextResponse } from 'next/server';
import { ContactProfileModel, ConversationModel } from '@noxivo/database';
import dbConnect from '../../../../lib/mongodb';
import { getCurrentSession } from '../../../../lib/auth/session';
import { resolveActorTenantCandidates, resolveActorTenantId } from '../../../../lib/auth/tenant-context';

type LeadSummary = {
  contactId: string;
  contactName: string | null;
  contactPhone: string | null;
  totalMessages: number;
  inboundMessages: number;
  outboundMessages: number;
  firstSeenAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  conversationId: string | null;
  conversationStatus: string | null;
  avatarUrl: string | null;
};

function extractAvatarUrlFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const candidates = [
    record.contactPicture,
    record.profilePictureURL,
    record.profilePicture,
    record.profilePicUrl,
    record.avatarUrl
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

export async function GET(request: Request): Promise<Response> {
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

    await dbConnect();
    const resolvedTenantCandidates = await resolveActorTenantCandidates(session.actor);
    const tenantCandidates = resolvedTenantCandidates.length > 0
      ? resolvedTenantCandidates
      : [requestedTenantId];
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query')?.trim().toLowerCase() ?? '';

    const profiles = await ContactProfileModel.find({
      agencyId: session.actor.agencyId,
      tenantId: { $in: tenantCandidates },
      crmTags: {
        $elemMatch: {
          label: { $regex: '^lead$', $options: 'i' }
        }
      }
    })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    const filteredProfiles = query.length === 0
      ? profiles
      : profiles.filter((profile) => {
          const haystack = [
            profile.contactName ?? '',
            profile.contactPhone ?? '',
            profile.contactId
          ].join(' ').toLowerCase();
          return haystack.includes(query);
        });

    const conversations = await ConversationModel.find({
      agencyId: session.actor.agencyId,
      tenantId: { $in: tenantCandidates },
      contactId: { $in: filteredProfiles.map((profile) => profile.contactId) }
    })
      .sort({ lastMessageAt: -1 })
      .lean()
      .exec();

    const conversationsByContactId = new Map<string, (typeof conversations)[number]>();
    for (const conversation of conversations) {
      if (!conversationsByContactId.has(conversation.contactId)) {
        conversationsByContactId.set(conversation.contactId, conversation);
      }
    }

    const leads: LeadSummary[] = filteredProfiles.map((profile) => {
      const conversation = conversationsByContactId.get(profile.contactId) ?? null;
      return {
        contactId: profile.contactId,
        contactName: profile.contactName ?? null,
        contactPhone: profile.contactPhone ?? null,
        totalMessages: profile.totalMessages,
        inboundMessages: profile.inboundMessages,
        outboundMessages: profile.outboundMessages,
        firstSeenAt: profile.firstSeenAt ? profile.firstSeenAt.toISOString() : null,
        lastInboundAt: profile.lastInboundAt ? profile.lastInboundAt.toISOString() : null,
        lastOutboundAt: profile.lastOutboundAt ? profile.lastOutboundAt.toISOString() : null,
        conversationId: conversation?._id ? conversation._id.toString() : null,
        conversationStatus: conversation?.status ?? null,
        avatarUrl: extractAvatarUrlFromMetadata(conversation?.metadata ?? null)
      };
    });

    return NextResponse.json(leads);
  } catch {
    return NextResponse.json({ error: 'Failed to load leads' }, { status: 500 });
  }
}
