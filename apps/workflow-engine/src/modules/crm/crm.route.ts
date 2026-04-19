import { z } from 'zod';
import {
  CrmActivityEventModel,
  ContactProfileModel,
  ConversationModel,
  CrmExternalRecordLinkModel
} from '@noxivo/database';
import {
  CrmNoteSchema,
  CrmOwnerSchema,
  CrmPipelineStageSchema,
  CrmProviderSchema,
  CrmTagSchema
} from '@noxivo/contracts';
import { CrmActivityProjectionService } from './activity-projection.service.js';

const CrmConversationScopeSchema = z.object({
  agencyId: z.string().min(1),
  tenantId: z.string().min(1),
  conversationId: z.string().min(1)
}).strict();

const CrmRouteQuerySchema = z.object({
  agencyId: z.string().min(1),
  tenantId: z.string().min(1)
}).strict();

const CrmLinkRecordMutationSchema = z.object({
  action: z.literal('link_record'),
  provider: CrmProviderSchema,
  externalRecordId: z.string().min(1),
  externalUrl: z.string().url().nullable().optional()
}).strict();

const CrmUnlinkRecordMutationSchema = z.object({
  action: z.literal('unlink_record'),
  provider: CrmProviderSchema,
  externalRecordId: z.string().min(1)
}).strict();

const CrmUpdateProfileMutationSchema = z.object({
  action: z.literal('update_profile'),
  owner: CrmOwnerSchema.nullable().optional(),
  pipelineStage: CrmPipelineStageSchema.nullable().optional(),
  tags: z.array(CrmTagSchema).optional()
}).strict();

const CrmAddNoteMutationSchema = z.object({
  action: z.literal('add_note'),
  provider: CrmProviderSchema,
  note: CrmNoteSchema.omit({ createdAt: true }).extend({
    createdAt: z.date().optional()
  }).strict()
}).strict();

const CrmConversationMutationSchema = z.discriminatedUnion('action', [
  CrmLinkRecordMutationSchema,
  CrmUnlinkRecordMutationSchema,
  CrmUpdateProfileMutationSchema,
  CrmAddNoteMutationSchema
]);

function toIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export async function loadCrmConversationProfile(input: {
  agencyId: string;
  tenantId: string;
  conversationId: string;
}) {
  const parsed = CrmConversationScopeSchema.parse(input);
  const conversation = await ConversationModel.findOne({
    _id: parsed.conversationId,
    agencyId: parsed.agencyId,
    tenantId: parsed.tenantId
  }).lean().exec();

  if (!conversation) {
    throw new Error('Conversation not found');
  }

  const [profile, externalLinks, activityEvents] = await Promise.all([
    ContactProfileModel.findOne({ tenantId: parsed.tenantId, contactId: conversation.contactId }).lean().exec(),
    CrmExternalRecordLinkModel.find({ tenantId: parsed.tenantId, contactId: conversation.contactId }).lean().exec(),
    CrmActivityEventModel.find({ tenantId: parsed.tenantId, contactId: conversation.contactId })
      .sort({ occurredAt: -1, createdAt: -1 })
      .limit(50)
      .lean()
      .exec()
  ]);

  return {
    conversationId: conversation._id.toString(),
    contactId: conversation.contactId,
    contactName: profile?.contactName ?? conversation.contactName ?? null,
    contactPhone: profile?.contactPhone ?? conversation.contactPhone ?? null,
    crmOwner: profile?.crmOwner ?? null,
    crmPipelineStage: profile?.crmPipelineStage ?? null,
    crmTags: profile?.crmTags ?? [],
    crmNotes: (profile?.crmNotes ?? []).map((note) => ({
      ...note,
      createdAt: note.createdAt.toISOString()
    })),
    lastCrmSyncedAt: toIsoString(profile?.lastCrmSyncedAt ?? null),
    externalLinks: externalLinks.map((link) => ({
      provider: link.provider,
      objectType: link.objectType,
      externalRecordId: link.externalRecordId,
      externalUrl: link.externalUrl ?? null,
      linkedAt: link.linkedAt.toISOString()
    })),
    activity: activityEvents.map((event) => ({
      provider: event.provider,
      type: event.type,
      summary: event.summary,
      occurredAt: event.occurredAt.toISOString(),
      metadata: event.metadata ?? {}
    }))
  };
}

export async function mutateCrmConversationProfile(input: {
  agencyId: string;
  tenantId: string;
  conversationId: string;
  mutation: unknown;
}) {
  const parsedScope = CrmConversationScopeSchema.parse({
    agencyId: input.agencyId,
    tenantId: input.tenantId,
    conversationId: input.conversationId
  });
  const mutation = CrmConversationMutationSchema.parse(input.mutation);
  const conversation = await ConversationModel.findOne({
    _id: parsedScope.conversationId,
    agencyId: parsedScope.agencyId,
    tenantId: parsedScope.tenantId
  }).lean().exec();

  if (!conversation) {
    throw new Error('Conversation not found');
  }

  const activityProjection = new CrmActivityProjectionService();
  const contactFilter = {
    tenantId: parsedScope.tenantId,
    contactId: conversation.contactId
  };

  if (mutation.action === 'update_profile') {
    const existingProfile = await ContactProfileModel.findOne(contactFilter).lean().exec();
    await ContactProfileModel.findOneAndUpdate(
      contactFilter,
      {
        $setOnInsert: {
          agencyId: parsedScope.agencyId,
          tenantId: parsedScope.tenantId,
          contactId: conversation.contactId,
          contactName: conversation.contactName ?? null,
          contactPhone: conversation.contactPhone ?? null,
          totalMessages: 0,
          inboundMessages: 0,
          outboundMessages: 0,
          firstSeenAt: null,
          lastInboundAt: null,
          lastOutboundAt: null
        },
        $set: {
          ...(mutation.owner !== undefined ? { crmOwner: mutation.owner } : {}),
          ...(mutation.pipelineStage !== undefined ? { crmPipelineStage: mutation.pipelineStage } : {}),
          ...(mutation.tags !== undefined ? { crmTags: mutation.tags } : {})
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();

    if (mutation.owner !== undefined && JSON.stringify(existingProfile?.crmOwner ?? null) !== JSON.stringify(mutation.owner ?? null)) {
      await activityProjection.project({
        agencyId: parsedScope.agencyId,
        tenantId: parsedScope.tenantId,
        contactId: conversation.contactId,
        provider: 'custom',
        type: 'owner_updated',
        summary: mutation.owner
          ? `Assigned CRM owner ${mutation.owner.displayName ?? mutation.owner.externalOwnerId}`
          : 'Cleared CRM owner',
        metadata: { owner: mutation.owner ?? null }
      });
    }

    if (mutation.pipelineStage !== undefined && JSON.stringify(existingProfile?.crmPipelineStage ?? null) !== JSON.stringify(mutation.pipelineStage ?? null)) {
      await activityProjection.project({
        agencyId: parsedScope.agencyId,
        tenantId: parsedScope.tenantId,
        contactId: conversation.contactId,
        provider: 'custom',
        type: 'stage_updated',
        summary: mutation.pipelineStage
          ? `Moved CRM stage to ${mutation.pipelineStage.stageName}`
          : 'Cleared CRM pipeline stage',
        metadata: { pipelineStage: mutation.pipelineStage ?? null }
      });
    }

    if (mutation.tags !== undefined && JSON.stringify(existingProfile?.crmTags ?? []) !== JSON.stringify(mutation.tags)) {
      await activityProjection.project({
        agencyId: parsedScope.agencyId,
        tenantId: parsedScope.tenantId,
        contactId: conversation.contactId,
        provider: 'custom',
        type: 'tag_updated',
        summary: `Updated CRM tags (${mutation.tags.map((tag) => tag.label).join(', ')})`,
        metadata: { tags: mutation.tags }
      });
    }
  }

  if (mutation.action === 'add_note') {
    const note = {
      ...mutation.note,
      createdAt: mutation.note.createdAt ?? new Date()
    };

    await ContactProfileModel.findOneAndUpdate(
      contactFilter,
      {
        $setOnInsert: {
          agencyId: parsedScope.agencyId,
          tenantId: parsedScope.tenantId,
          contactId: conversation.contactId,
          contactName: conversation.contactName ?? null,
          contactPhone: conversation.contactPhone ?? null,
          totalMessages: 0,
          inboundMessages: 0,
          outboundMessages: 0,
          firstSeenAt: null,
          lastInboundAt: null,
          lastOutboundAt: null
        },
        $push: {
          crmNotes: note
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();

    await activityProjection.project({
      agencyId: parsedScope.agencyId,
      tenantId: parsedScope.tenantId,
      contactId: conversation.contactId,
      provider: mutation.provider,
      type: 'note_added',
      occurredAt: note.createdAt,
      summary: note.body,
      metadata: { note }
    });
  }

  if (mutation.action === 'link_record') {
    await CrmExternalRecordLinkModel.findOneAndUpdate(
      {
        tenantId: parsedScope.tenantId,
        provider: mutation.provider,
        objectType: 'contact',
        externalRecordId: mutation.externalRecordId
      },
      {
        $setOnInsert: {
          agencyId: parsedScope.agencyId,
          tenantId: parsedScope.tenantId,
          provider: mutation.provider,
          objectType: 'contact',
          externalRecordId: mutation.externalRecordId,
          linkedAt: new Date()
        },
        $set: {
          contactId: conversation.contactId,
          externalUrl: mutation.externalUrl ?? null
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();
  }

  if (mutation.action === 'unlink_record') {
    await CrmExternalRecordLinkModel.deleteOne({
      tenantId: parsedScope.tenantId,
      contactId: conversation.contactId,
      provider: mutation.provider,
      externalRecordId: mutation.externalRecordId
    }).exec();
  }

  return loadCrmConversationProfile(parsedScope);
}

export function parseCrmRouteQuery(value: unknown) {
  return CrmRouteQuerySchema.parse(value);
}
