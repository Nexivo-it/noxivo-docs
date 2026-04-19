import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const CrmSyncJobSchema = new Schema({
  agencyId: {
    type: Schema.Types.ObjectId,
    ref: 'Agency',
    required: true,
    index: true
  },
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  provider: {
    type: String,
    required: true,
    enum: ['hubspot', 'salesforce', 'pipedrive', 'custom']
  },
  direction: {
    type: String,
    required: true,
    enum: ['import', 'export', 'bidirectional']
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending'
  },
  cursor: {
    type: String,
    default: null,
    trim: true
  },
  error: {
    type: String,
    default: null,
    trim: true
  },
  startedAt: {
    type: Date,
    default: null
  },
  finishedAt: {
    type: Date,
    default: null
  }
}, {
  collection: 'crm_sync_jobs',
  timestamps: true
});

CrmSyncJobSchema.index({ tenantId: 1, provider: 1, status: 1, createdAt: -1 });

export type CrmSyncJob = InferSchemaType<typeof CrmSyncJobSchema>;

export const CrmSyncJobModel =
  (models.CrmSyncJob as Model<CrmSyncJob> | undefined) ||
  model<CrmSyncJob>('CrmSyncJob', CrmSyncJobSchema);
