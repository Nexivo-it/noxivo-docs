import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ContactProfileModel,
  CrmActivityEventModel,
  CrmConnectionModel,
  CrmExternalRecordLinkModel,
  CrmSyncJobModel
} from '@noxivo/database';
import { CrmExportWorker } from '../src/modules/crm/export.worker.js';
import { CrmImportWorker } from '../src/modules/crm/import.worker.js';
import { CrmSyncService, type CrmSyncAdapter } from '../src/modules/crm/sync.service.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('CRM sync service', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-crm-sync-tests' });
    await Promise.all([
      ContactProfileModel.init(),
      CrmActivityEventModel.init(),
      CrmConnectionModel.init(),
      CrmExternalRecordLinkModel.init(),
      CrmSyncJobModel.init()
    ]);
  });

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('imports CRM profile state, notes, tags, owner, and stage into the persisted contact profile', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const connection = await CrmConnectionModel.create({
      agencyId,
      tenantId,
      provider: 'hubspot',
      displayName: 'HubSpot CRM',
      syncDirection: 'bidirectional',
      config: { portalId: 'portal-123' }
    });

    const importAdapter: CrmSyncAdapter = {
      importContact: vi.fn(async () => ({
        externalRecordId: 'hs-contact-1',
        externalUrl: 'https://app.hubspot.com/contacts/1',
        contactName: 'Alice CRM',
        contactPhone: '+1 555-000-1111',
        owner: {
          externalOwnerId: 'owner-1',
          displayName: 'Sales Owner',
          email: 'owner@example.com'
        },
        pipelineStage: {
          pipelineId: 'sales',
          stageId: 'qualified',
          stageName: 'Qualified'
        },
        tags: [{ label: 'vip' }, { label: 'priority' }],
        notes: [{
          body: 'Qualified lead during discovery call',
          authorUserId: 'user-1',
          createdAt: new Date('2026-04-12T09:00:00.000Z')
        }],
        summary: 'Imported CRM profile from HubSpot',
        cursor: 'cursor-import-1'
      })),
      exportContact: vi.fn(async () => {
        throw new Error('Not implemented in this test');
      })
    };

    const service = new CrmSyncService({
      adapterFactory: () => importAdapter
    });

    const result = await service.importContact({
      connectionId: connection._id.toString(),
      contactId: '15550001111@c.us'
    });

    const [profile, link, events] = await Promise.all([
      ContactProfileModel.findOne({ tenantId, contactId: '15550001111@c.us' }).lean().exec(),
      CrmExternalRecordLinkModel.findOne({ tenantId, contactId: '15550001111@c.us', provider: 'hubspot' }).lean().exec(),
      CrmActivityEventModel.find({ tenantId, contactId: '15550001111@c.us' }).sort({ occurredAt: 1 }).lean().exec()
    ]);

    expect(result.externalRecordId).toBe('hs-contact-1');
    expect(profile).toMatchObject({
      contactName: 'Alice CRM',
      contactPhone: '+1 555-000-1111',
      crmOwner: expect.objectContaining({ externalOwnerId: 'owner-1' }),
      crmPipelineStage: expect.objectContaining({ stageId: 'qualified' }),
      crmTags: [
        expect.objectContaining({ label: 'vip' }),
        expect.objectContaining({ label: 'priority' })
      ],
      crmNotes: [expect.objectContaining({ body: 'Qualified lead during discovery call' })]
    });
    expect(profile?.lastCrmSyncedAt).toBeTruthy();
    expect(link).toMatchObject({
      externalRecordId: 'hs-contact-1',
      externalUrl: 'https://app.hubspot.com/contacts/1'
    });
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      'owner_updated',
      'stage_updated',
      'tag_updated',
      'note_added',
      'sync_imported'
    ]));
    expect(events).toHaveLength(5);
  });

  it('exports CRM profile state and keeps external record linking idempotent across repeated syncs', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const connection = await CrmConnectionModel.create({
      agencyId,
      tenantId,
      provider: 'salesforce',
      displayName: 'Salesforce CRM',
      syncDirection: 'bidirectional',
      config: { instanceUrl: 'https://example.my.salesforce.com' }
    });

    await ContactProfileModel.create({
      agencyId,
      tenantId,
      contactId: '15550002222@c.us',
      contactName: 'Bob Export',
      contactPhone: '+1 555-000-2222',
      crmOwner: {
        externalOwnerId: 'owner-2',
        displayName: 'Account Exec',
        email: 'ae@example.com'
      },
      crmPipelineStage: {
        pipelineId: 'pipeline-1',
        stageId: 'proposal',
        stageName: 'Proposal'
      },
      crmTags: [{ label: 'renewal' }],
      crmNotes: [{
        body: 'Requested pricing proposal',
        authorUserId: 'user-2',
        createdAt: new Date('2026-04-12T10:00:00.000Z')
      }],
      totalMessages: 3,
      inboundMessages: 2,
      outboundMessages: 1
    });

    const exportContact = vi.fn(async () => ({
      externalRecordId: 'sf-contact-1',
      externalUrl: 'https://example.my.salesforce.com/lightning/r/Contact/1/view',
      summary: 'Exported CRM profile to Salesforce',
      cursor: 'cursor-export-1'
    }));

    const service = new CrmSyncService({
      adapterFactory: () => ({
        importContact: vi.fn(async () => {
          throw new Error('Not implemented in this test');
        }),
        exportContact
      })
    });

    await service.exportContact({
      connectionId: connection._id.toString(),
      contactId: '15550002222@c.us'
    });
    await service.exportContact({
      connectionId: connection._id.toString(),
      contactId: '15550002222@c.us'
    });

    const [links, activities] = await Promise.all([
      CrmExternalRecordLinkModel.find({ tenantId, provider: 'salesforce', contactId: '15550002222@c.us' }).lean().exec(),
      CrmActivityEventModel.find({ tenantId, contactId: '15550002222@c.us', type: 'sync_exported' }).lean().exec()
    ]);

    expect(exportContact).toHaveBeenCalledTimes(2);
    expect(exportContact).toHaveBeenCalledWith(expect.objectContaining({
      contactProfile: expect.objectContaining({
        contactName: 'Bob Export',
        crmOwner: expect.objectContaining({ externalOwnerId: 'owner-2' }),
        crmPipelineStage: expect.objectContaining({ stageId: 'proposal' }),
        crmTags: [expect.objectContaining({ label: 'renewal' })],
        crmNotes: [expect.objectContaining({ body: 'Requested pricing proposal' })]
      })
    }));
    expect(links).toHaveLength(1);
    expect(links[0]?.externalRecordId).toBe('sf-contact-1');
    expect(activities).toHaveLength(2);
  });

  it('marks CRM sync jobs complete through the import and export workers', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const connection = await CrmConnectionModel.create({
      agencyId,
      tenantId,
      provider: 'custom',
      displayName: 'Custom CRM',
      syncDirection: 'bidirectional',
      config: { endpoint: 'https://crm.internal/api' }
    });

    await ContactProfileModel.create({
      agencyId,
      tenantId,
      contactId: '15550003333@c.us',
      contactName: 'Charlie Worker',
      totalMessages: 1,
      inboundMessages: 1,
      outboundMessages: 0
    });

    const service = new CrmSyncService({
      adapterFactory: () => ({
        importContact: vi.fn(async () => ({
          externalRecordId: 'custom-contact-1',
          summary: 'Imported contact from Custom CRM',
          cursor: 'import-worker-cursor'
        })),
        exportContact: vi.fn(async () => ({
          externalRecordId: 'custom-contact-1',
          summary: 'Exported contact to Custom CRM',
          cursor: 'export-worker-cursor'
        }))
      })
    });

    const [importJob, exportJob] = await Promise.all([
      CrmSyncJobModel.create({
        agencyId,
        tenantId,
        provider: 'custom',
        direction: 'import',
        status: 'pending'
      }),
      CrmSyncJobModel.create({
        agencyId,
        tenantId,
        provider: 'custom',
        direction: 'export',
        status: 'pending'
      })
    ]);

    const importWorker = new CrmImportWorker(service);
    const exportWorker = new CrmExportWorker(service);

    await importWorker.processJob({
      syncJobId: importJob._id.toString(),
      connectionId: connection._id.toString(),
      contactId: '15550003333@c.us'
    });
    await exportWorker.processJob({
      syncJobId: exportJob._id.toString(),
      connectionId: connection._id.toString(),
      contactId: '15550003333@c.us'
    });

    const [updatedImportJob, updatedExportJob] = await Promise.all([
      CrmSyncJobModel.findById(importJob._id).lean().exec(),
      CrmSyncJobModel.findById(exportJob._id).lean().exec()
    ]);

    expect(updatedImportJob).toMatchObject({
      status: 'completed',
      cursor: 'import-worker-cursor'
    });
    expect(updatedImportJob?.startedAt).toBeTruthy();
    expect(updatedImportJob?.finishedAt).toBeTruthy();
    expect(updatedExportJob).toMatchObject({
      status: 'completed',
      cursor: 'export-worker-cursor'
    });
  });
});
