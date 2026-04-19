import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const BillingMeterWindowSchema = new Schema({
  agencyId: {
    type: String,
    required: true,
    index: true
  },
  metric: {
    type: String,
    required: true,
    enum: [
      'inbound_message',
      'outbound_message',
      'plugin_execution',
      'ai_token_usage',
      'session_active_hour',
      'media_download'
    ],
    index: true
  },
  windowStart: {
    type: Date,
    required: true,
    index: true
  },
  usageTotal: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  syncStatus: {
    type: String,
    required: true,
    enum: ['pending', 'synced', 'failed'],
    default: 'pending',
    index: true
  },
  lastSyncedAt: {
    type: Date,
    default: null
  },
  stripeMeterEventId: {
    type: String,
    default: null
  }
}, {
  collection: 'billing_meter_windows',
  timestamps: true
});

BillingMeterWindowSchema.index({ agencyId: 1, metric: 1, windowStart: 1 }, { unique: true });

export type BillingMeterWindow = InferSchemaType<typeof BillingMeterWindowSchema>;

export const BillingMeterWindowModel =
  (models.BillingMeterWindow as Model<BillingMeterWindow> | undefined) ||
  model<BillingMeterWindow>('BillingMeterWindow', BillingMeterWindowSchema);
