import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const DashboardConfigSchema = new Schema({
  agencyId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    description: 'Unique agency identifier from the dashboard'
  },
  dashboardName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120
  },
  dashboardUrl: {
    type: String,
    required: true,
    trim: true,
    description: 'Base URL of the dashboard for webhooks and API callbacks'
  },
  webhookSecret: {
    type: String,
    required: true,
    description: 'Secret for validating webhooks coming from this dashboard'
  },
  apiKey: {
    type: String,
    required: true,
    unique: true,
    description: 'API key this dashboard uses to authenticate with the engine'
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'disconnected'],
    default: 'active'
  },
  lastSyncAt: {
    type: Date,
    default: null
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
    description: 'Additional metadata from the dashboard (plan, features, etc.)'
  }
}, {
  collection: 'dashboard_configs',
  timestamps: true
});

export type DashboardConfig = InferSchemaType<typeof DashboardConfigSchema>;

export const DashboardConfigModel =
  (models.DashboardConfig as Model<DashboardConfig> | undefined) ||
  model<DashboardConfig>('DashboardConfig', DashboardConfigSchema);