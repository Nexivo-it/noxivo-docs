import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import {
  CrmActivityEventSchema,
  CrmConnectionSchema,
  CrmExternalRecordLinkSchema,
  CrmNoteSchema,
  CrmSyncJobSchema
} from '@noxivo/contracts';
import {
  CrmActivityEventModel,
  CrmConnectionModel,
  CrmExternalRecordLinkModel,
  CrmSyncJobModel
} from '@noxivo/database';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('CRM contracts and models', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-crm-contracts-tests' });
  });

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('validates and persists CRM connection, link, sync job, and activity records', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();
    const contactId = '15550001111@c.us';

    const connectionInput = CrmConnectionSchema.parse({
      agencyId,
      tenantId,
      provider: 'hubspot',
      displayName: 'HubSpot CRM',
      syncDirection: 'bidirectional',
      config: { portalId: 'portal-123' },
      defaultOwner: {
        externalOwnerId: 'owner-1',
        displayName: 'Sales Owner',
        email: 'owner@example.com'
      },
      defaultPipelineStage: {
        pipelineId: 'sales',
        stageId: 'qualified',
        stageName: 'Qualified'
      },
      defaultTags: [{ label: 'vip' }]
    });

    const linkInput = CrmExternalRecordLinkSchema.parse({
      agencyId,
      tenantId,
      contactId,
      provider: 'hubspot',
      objectType: 'contact',
      externalRecordId: 'hs-contact-1',
      externalUrl: 'https://app.hubspot.com/contacts/1'
    });

    const syncJobInput = CrmSyncJobSchema.parse({
      agencyId,
      tenantId,
      provider: 'hubspot',
      direction: 'bidirectional',
      status: 'pending'
    });

    const activityInput = CrmActivityEventSchema.parse({
      agencyId,
      tenantId,
      contactId,
      provider: 'hubspot',
      type: 'note_added',
      summary: 'Added qualification note',
      metadata: {
        note: CrmNoteSchema.parse({
          body: 'Qualified lead during discovery call',
          authorUserId: new mongoose.Types.ObjectId().toString()
        })
      }
    });

    const [connection, link, syncJob, activity] = await Promise.all([
      CrmConnectionModel.create(connectionInput),
      CrmExternalRecordLinkModel.create(linkInput),
      CrmSyncJobModel.create(syncJobInput),
      CrmActivityEventModel.create(activityInput)
    ]);

    expect(connection.provider).toBe('hubspot');
    expect(connection.defaultTags).toEqual([expect.objectContaining({ label: 'vip' })]);
    expect(link.externalRecordId).toBe('hs-contact-1');
    expect(syncJob.status).toBe('pending');
    expect(activity.type).toBe('note_added');
    expect(activity.metadata).toMatchObject({
      note: expect.objectContaining({ body: 'Qualified lead during discovery call' })
    });
  });

  it('rejects invalid CRM providers at the contract boundary', () => {
    expect(() => CrmConnectionSchema.parse({
      agencyId: 'agency-1',
      tenantId: 'tenant-1',
      provider: 'zoho',
      displayName: 'Zoho CRM',
      syncDirection: 'import'
    })).toThrow();
  });

  it('enforces unique external record links per tenant/provider/object type', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();

    await CrmExternalRecordLinkModel.init();

    await CrmExternalRecordLinkModel.create({
      agencyId,
      tenantId,
      contactId: 'contact-1',
      provider: 'salesforce',
      objectType: 'contact',
      externalRecordId: 'sf-contact-1'
    });

    await expect(CrmExternalRecordLinkModel.create({
      agencyId,
      tenantId,
      contactId: 'contact-2',
      provider: 'salesforce',
      objectType: 'contact',
      externalRecordId: 'sf-contact-1'
    })).rejects.toThrow();
  });
});
