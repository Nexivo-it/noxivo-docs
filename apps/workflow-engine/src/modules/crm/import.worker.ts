import { CrmSyncJobModel } from '@noxivo/database';
import { z } from 'zod';
import { CrmSyncService } from './sync.service.js';

export const CRM_IMPORT_JOB_NAME = 'crm.sync.import';

const CrmImportJobDataSchema = z.object({
  syncJobId: z.string().min(1),
  connectionId: z.string().min(1),
  contactId: z.string().min(1)
}).strict();

export type CrmImportJobData = z.infer<typeof CrmImportJobDataSchema>;

export class CrmImportWorker {
  constructor(private readonly syncService: CrmSyncService) {}

  async processJob(input: CrmImportJobData) {
    const parsed = CrmImportJobDataSchema.parse(input);
    await CrmSyncJobModel.findByIdAndUpdate(parsed.syncJobId, {
      status: 'running',
      startedAt: new Date(),
      error: null
    }).exec();

    try {
      const result = await this.syncService.importContact({
        connectionId: parsed.connectionId,
        contactId: parsed.contactId
      });

      await CrmSyncJobModel.findByIdAndUpdate(parsed.syncJobId, {
        status: 'completed',
        cursor: result.cursor ?? null,
        finishedAt: new Date(),
        error: null
      }).exec();

      return result;
    } catch (error) {
      await CrmSyncJobModel.findByIdAndUpdate(parsed.syncJobId, {
        status: 'failed',
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : 'CRM import failed'
      }).exec();
      throw error;
    }
  }
}

export function createCrmImportProcessor(worker: CrmImportWorker) {
  return async (job: { data: CrmImportJobData }) => worker.processJob(job.data);
}
