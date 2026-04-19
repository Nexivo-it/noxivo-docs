import { CrmSyncJobModel } from '@noxivo/database';
import { z } from 'zod';
import { CrmSyncService } from './sync.service.js';

export const CRM_EXPORT_JOB_NAME = 'crm.sync.export';

const CrmExportJobDataSchema = z.object({
  syncJobId: z.string().min(1),
  connectionId: z.string().min(1),
  contactId: z.string().min(1)
}).strict();

export type CrmExportJobData = z.infer<typeof CrmExportJobDataSchema>;

export class CrmExportWorker {
  constructor(private readonly syncService: CrmSyncService) {}

  async processJob(input: CrmExportJobData) {
    const parsed = CrmExportJobDataSchema.parse(input);
    await CrmSyncJobModel.findByIdAndUpdate(parsed.syncJobId, {
      status: 'running',
      startedAt: new Date(),
      error: null
    }).exec();

    try {
      const result = await this.syncService.exportContact({
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
        error: error instanceof Error ? error.message : 'CRM export failed'
      }).exec();
      throw error;
    }
  }
}

export function createCrmExportProcessor(worker: CrmExportWorker) {
  return async (job: { data: CrmExportJobData }) => worker.processJob(job.data);
}
