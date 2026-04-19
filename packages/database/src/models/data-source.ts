import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const DataSourceSchema = new Schema({
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
  pluginId: {
    type: String,
    required: true,
    default: 'ai-sales-agent',
    trim: true
  },
  providerType: {
    type: String,
    required: true,
    enum: ['mock', 'shopify', 'woocommerce'],
    index: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  enabled: {
    type: Boolean,
    required: true,
    default: true
  },
  credentialRef: {
    type: Schema.Types.ObjectId,
    ref: 'TenantCredential',
    default: null
  },
  encryptedSecret: {
    type: String,
    default: null
  },
  config: {
    type: Schema.Types.Mixed,
    default: () => ({})
  },
  lastSyncedAt: {
    type: Date,
    default: null
  },
  healthStatus: {
    type: String,
    enum: ['healthy', 'error', 'disabled'],
    default: 'disabled'
  }
}, {
  collection: 'ai_agent_data_sources',
  timestamps: true
});

DataSourceSchema.index(
  { agencyId: 1, tenantId: 1, pluginId: 1, providerType: 1, displayName: 1 },
  { unique: true }
);
DataSourceSchema.index({ tenantId: 1, pluginId: 1, enabled: 1 });

export type DataSource = InferSchemaType<typeof DataSourceSchema>;

export const DataSourceModel =
  (models.DataSource as Model<DataSource> | undefined) ||
  model<DataSource>('DataSource', DataSourceSchema);