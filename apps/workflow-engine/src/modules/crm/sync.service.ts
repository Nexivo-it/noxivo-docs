import {
  ContactProfileModel,
  CrmConnectionModel,
  CrmExternalRecordLinkModel
} from '@noxivo/database';
import {
  type CrmConnectionStatus,
  type CrmNote,
  type CrmOwner,
  type CrmPipelineStage,
  type CrmProvider,
  type CrmSyncDirection,
  type CrmTag
} from '@noxivo/contracts';
import { CrmActivityProjectionService } from './activity-projection.service.js';

type ContactProfileRecord = {
  agencyId: string;
  tenantId: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string | null;
  crmOwner: CrmOwner | null;
  crmPipelineStage: CrmPipelineStage | null;
  crmTags: CrmTag[];
  crmNotes: CrmNote[];
};

type CrmConnectionRecord = {
  id: string;
  agencyId: string;
  tenantId: string;
  provider: CrmProvider;
  displayName: string;
  status: CrmConnectionStatus;
  syncDirection: CrmSyncDirection;
  config: Record<string, unknown>;
};

type CrmExternalRecordLinkRecord = {
  externalRecordId: string;
  externalUrl: string | null;
  objectType: 'contact' | 'deal' | 'note' | 'activity';
};

export interface CrmSyncResult {
  externalRecordId: string;
  externalUrl?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  owner?: CrmOwner | null;
  pipelineStage?: CrmPipelineStage | null;
  tags?: CrmTag[];
  notes?: CrmNote[];
  summary?: string;
  cursor?: string | null;
}

export interface CrmSyncAdapter {
  importContact(input: {
    connection: CrmConnectionRecord;
    contactId: string;
    existingLink: CrmExternalRecordLinkRecord | null;
    existingProfile: ContactProfileRecord | null;
  }): Promise<CrmSyncResult>;
  exportContact(input: {
    connection: CrmConnectionRecord;
    contactProfile: ContactProfileRecord;
    existingLink: CrmExternalRecordLinkRecord | null;
  }): Promise<CrmSyncResult>;
}

export interface CrmSyncServiceOptions {
  adapterFactory: (provider: CrmProvider) => CrmSyncAdapter;
  activityProjectionService?: CrmActivityProjectionService;
}

type ConnectionDocumentLike = {
  _id: { toString(): string };
  agencyId: { toString(): string };
  tenantId: { toString(): string };
  provider: CrmProvider;
  displayName: string;
  status: CrmConnectionStatus;
  syncDirection: CrmSyncDirection;
  config?: unknown;
};

type ContactProfileDocumentLike = {
  agencyId: { toString(): string };
  tenantId: { toString(): string };
  contactId: string;
  contactName?: string | null;
  contactPhone?: string | null;
  crmOwner?: CrmOwner | null;
  crmPipelineStage?: CrmPipelineStage | null;
  crmTags?: CrmTag[];
  crmNotes?: CrmNote[];
};

type ExternalRecordLinkDocumentLike = {
  externalRecordId: string;
  externalUrl?: string | null;
  objectType: 'contact' | 'deal' | 'note' | 'activity';
};

function toConnectionRecord(connection: ConnectionDocumentLike | null): CrmConnectionRecord {
  if (!connection) {
    throw new Error('CRM connection not found');
  }

  return {
    id: connection._id.toString(),
    agencyId: connection.agencyId.toString(),
    tenantId: connection.tenantId.toString(),
    provider: connection.provider,
    displayName: connection.displayName,
    status: connection.status,
    syncDirection: connection.syncDirection,
    config: (connection.config ?? {}) as Record<string, unknown>
  };
}

function toProfileRecord(profile: ContactProfileDocumentLike | null): ContactProfileRecord | null {
  if (!profile) {
    return null;
  }

  return {
    agencyId: profile.agencyId.toString(),
    tenantId: profile.tenantId.toString(),
    contactId: profile.contactId,
    contactName: profile.contactName ?? null,
    contactPhone: profile.contactPhone ?? null,
    crmOwner: profile.crmOwner ?? null,
    crmPipelineStage: profile.crmPipelineStage ?? null,
    crmTags: [...(profile.crmTags ?? [])],
    crmNotes: [...(profile.crmNotes ?? [])]
  };
}

function toExternalLinkRecord(link: ExternalRecordLinkDocumentLike | null): CrmExternalRecordLinkRecord | null {
  if (!link) {
    return null;
  }

  return {
    externalRecordId: link.externalRecordId,
    externalUrl: link.externalUrl ?? null,
    objectType: link.objectType
  };
}

function normalizeTags(tags: CrmTag[] | undefined): CrmTag[] {
  return [...(tags ?? [])].sort((left, right) => left.label.localeCompare(right.label));
}

function areTagsEqual(left: CrmTag[] | undefined, right: CrmTag[] | undefined): boolean {
  return JSON.stringify(normalizeTags(left)) === JSON.stringify(normalizeTags(right));
}

function buildNoteKey(note: CrmNote): string {
  return JSON.stringify([
    note.id ?? null,
    note.body,
    note.authorUserId,
    note.createdAt.toISOString(),
    note.externalRecordId ?? null
  ]);
}

export class CrmSyncService {
  private readonly activityProjectionService: CrmActivityProjectionService;

  constructor(private readonly options: CrmSyncServiceOptions) {
    this.activityProjectionService = options.activityProjectionService ?? new CrmActivityProjectionService();
  }

  async importContact(input: { connectionId: string; contactId: string }): Promise<CrmSyncResult> {
    const connectionDocument = await CrmConnectionModel.findById(input.connectionId).exec();
    const connection = toConnectionRecord(connectionDocument);
    const [existingProfileDocument, existingLinkDocument] = await Promise.all([
      ContactProfileModel.findOne({ tenantId: connection.tenantId, contactId: input.contactId }).exec(),
      CrmExternalRecordLinkModel.findOne({
        tenantId: connection.tenantId,
        contactId: input.contactId,
        provider: connection.provider,
        objectType: 'contact'
      }).exec()
    ]);

    const existingProfile = toProfileRecord(existingProfileDocument);
    const existingLink = toExternalLinkRecord(existingLinkDocument);
    const adapter = this.options.adapterFactory(connection.provider);
    const result = await adapter.importContact({
      connection,
      contactId: input.contactId,
      existingLink,
      existingProfile
    });

    const nextNotes = result.notes ?? existingProfile?.crmNotes ?? [];
    const nextTags = result.tags ?? existingProfile?.crmTags ?? [];
    const profile = await ContactProfileModel.findOneAndUpdate(
      {
        tenantId: connection.tenantId,
        contactId: input.contactId
      },
      {
        $setOnInsert: {
          agencyId: connection.agencyId,
          tenantId: connection.tenantId,
          contactId: input.contactId,
          totalMessages: 0,
          inboundMessages: 0,
          outboundMessages: 0,
          firstSeenAt: null,
          lastInboundAt: null,
          lastOutboundAt: null
        },
        $set: {
          ...(result.contactName !== undefined ? { contactName: result.contactName } : {}),
          ...(result.contactPhone !== undefined ? { contactPhone: result.contactPhone } : {}),
          crmOwner: result.owner ?? existingProfile?.crmOwner ?? null,
          crmPipelineStage: result.pipelineStage ?? existingProfile?.crmPipelineStage ?? null,
          crmTags: nextTags,
          crmNotes: nextNotes,
          lastCrmSyncedAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();

    await CrmExternalRecordLinkModel.findOneAndUpdate(
      {
        tenantId: connection.tenantId,
        provider: connection.provider,
        objectType: 'contact',
        externalRecordId: result.externalRecordId
      },
      {
        $setOnInsert: {
          agencyId: connection.agencyId,
          tenantId: connection.tenantId,
          provider: connection.provider,
          objectType: 'contact',
          externalRecordId: result.externalRecordId,
          linkedAt: new Date()
        },
        $set: {
          contactId: input.contactId,
          externalUrl: result.externalUrl ?? null
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();

    await this.projectProfileChanges({
      connection,
      contactId: input.contactId,
      existingProfile,
      nextProfile: toProfileRecord(profile),
      syncType: 'sync_imported',
      summary: result.summary ?? `Imported CRM profile from ${connection.displayName}`,
      notes: result.notes ?? []
    });

    return result;
  }

  async exportContact(input: { connectionId: string; contactId: string }): Promise<CrmSyncResult> {
    const connectionDocument = await CrmConnectionModel.findById(input.connectionId).exec();
    const connection = toConnectionRecord(connectionDocument);
    const profileDocument = await ContactProfileModel.findOne({
      tenantId: connection.tenantId,
      contactId: input.contactId
    }).exec();
    const profile = toProfileRecord(profileDocument);

    if (!profile) {
      throw new Error(`Contact profile not found for ${input.contactId}`);
    }

    const existingLinkDocument = await CrmExternalRecordLinkModel.findOne({
      tenantId: connection.tenantId,
      contactId: input.contactId,
      provider: connection.provider,
      objectType: 'contact'
    }).exec();
    const existingLink = toExternalLinkRecord(existingLinkDocument);
    const adapter = this.options.adapterFactory(connection.provider);
    const result = await adapter.exportContact({
      connection,
      contactProfile: profile,
      existingLink
    });

    await ContactProfileModel.findOneAndUpdate(
      { tenantId: connection.tenantId, contactId: input.contactId },
      {
        $set: {
          ...(result.contactName !== undefined ? { contactName: result.contactName } : {}),
          ...(result.contactPhone !== undefined ? { contactPhone: result.contactPhone } : {}),
          ...(result.owner !== undefined ? { crmOwner: result.owner } : {}),
          ...(result.pipelineStage !== undefined ? { crmPipelineStage: result.pipelineStage } : {}),
          ...(result.tags !== undefined ? { crmTags: result.tags } : {}),
          ...(result.notes !== undefined ? { crmNotes: result.notes } : {}),
          lastCrmSyncedAt: new Date()
        }
      },
      { new: true }
    ).exec();

    await CrmExternalRecordLinkModel.findOneAndUpdate(
      {
        tenantId: connection.tenantId,
        provider: connection.provider,
        objectType: 'contact',
        externalRecordId: result.externalRecordId
      },
      {
        $setOnInsert: {
          agencyId: connection.agencyId,
          tenantId: connection.tenantId,
          provider: connection.provider,
          objectType: 'contact',
          externalRecordId: result.externalRecordId,
          linkedAt: new Date()
        },
        $set: {
          contactId: input.contactId,
          externalUrl: result.externalUrl ?? null
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();

    await this.activityProjectionService.project({
      agencyId: connection.agencyId,
      tenantId: connection.tenantId,
      contactId: input.contactId,
      provider: connection.provider,
      type: 'sync_exported',
      summary: result.summary ?? `Exported CRM profile to ${connection.displayName}`,
      metadata: {
        externalRecordId: result.externalRecordId,
        externalUrl: result.externalUrl ?? null
      }
    });

    return result;
  }

  private async projectProfileChanges(input: {
    connection: CrmConnectionRecord;
    contactId: string;
    existingProfile: ContactProfileRecord | null;
    nextProfile: ContactProfileRecord | null;
    syncType: 'sync_imported' | 'sync_exported';
    summary: string;
    notes: CrmNote[];
  }): Promise<void> {
    if (!input.nextProfile) {
      return;
    }

    const baseEvent = {
      agencyId: input.connection.agencyId,
      tenantId: input.connection.tenantId,
      contactId: input.contactId,
      provider: input.connection.provider
    } as const;

    if (input.existingProfile?.crmOwner?.externalOwnerId !== input.nextProfile.crmOwner?.externalOwnerId
      && input.nextProfile.crmOwner) {
      await this.activityProjectionService.project({
        ...baseEvent,
        type: 'owner_updated',
        summary: `Assigned CRM owner ${input.nextProfile.crmOwner.displayName ?? input.nextProfile.crmOwner.externalOwnerId}`,
        metadata: { owner: input.nextProfile.crmOwner }
      });
    }

    if (input.existingProfile?.crmPipelineStage?.stageId !== input.nextProfile.crmPipelineStage?.stageId
      && input.nextProfile.crmPipelineStage) {
      await this.activityProjectionService.project({
        ...baseEvent,
        type: 'stage_updated',
        summary: `Moved CRM stage to ${input.nextProfile.crmPipelineStage.stageName}`,
        metadata: { pipelineStage: input.nextProfile.crmPipelineStage }
      });
    }

    if (!areTagsEqual(input.existingProfile?.crmTags, input.nextProfile.crmTags)) {
      await this.activityProjectionService.project({
        ...baseEvent,
        type: 'tag_updated',
        summary: `Updated CRM tags (${input.nextProfile.crmTags.map((tag) => tag.label).join(', ')})`,
        metadata: { tags: input.nextProfile.crmTags }
      });
    }

    const existingNoteKeys = new Set((input.existingProfile?.crmNotes ?? []).map((note) => buildNoteKey(note)));
    for (const note of input.notes) {
      if (existingNoteKeys.has(buildNoteKey(note))) {
        continue;
      }

      await this.activityProjectionService.project({
        ...baseEvent,
        type: 'note_added',
        occurredAt: note.createdAt,
        summary: note.body,
        metadata: { note }
      });
    }

    await this.activityProjectionService.project({
      ...baseEvent,
      type: input.syncType,
      summary: input.summary,
      metadata: {
        contactId: input.contactId
      }
    });
  }
}
