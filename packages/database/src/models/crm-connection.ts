import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const CrmOwnerSubSchema = new Schema({
  externalOwnerId: { type: String, required: true, trim: true },
  displayName: { type: String, default: null, trim: true },
  email: { type: String, default: null, trim: true }
}, { _id: false });

const CrmTagSubSchema = new Schema({
  id: { type: String, default: null, trim: true },
  label: { type: String, required: true, trim: true }
}, { _id: false });

const CrmPipelineStageSubSchema = new Schema({
  pipelineId: { type: String, required: true, trim: true },
  stageId: { type: String, required: true, trim: true },
  stageName: { type: String, required: true, trim: true }
}, { _id: false });

const CrmConnectionSchema = new Schema({
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
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'disabled', 'error'],
    default: 'active'
  },
  syncDirection: {
    type: String,
    required: true,
    enum: ['import', 'export', 'bidirectional']
  },
  config: {
    type: Schema.Types.Mixed,
    required: true,
    default: () => ({})
  },
  defaultOwner: {
    type: CrmOwnerSubSchema,
    default: null
  },
  defaultPipelineStage: {
    type: CrmPipelineStageSubSchema,
    default: null
  },
  defaultTags: {
    type: [CrmTagSubSchema],
    default: () => []
  },
  lastSyncedAt: {
    type: Date,
    default: null
  }
}, {
  collection: 'crm_connections',
  timestamps: true
});

CrmConnectionSchema.index({ tenantId: 1, provider: 1 }, { unique: true });

export type CrmConnection = InferSchemaType<typeof CrmConnectionSchema>;

export const CrmConnectionModel =
  (models.CrmConnection as Model<CrmConnection> | undefined) ||
  model<CrmConnection>('CrmConnection', CrmConnectionSchema);
