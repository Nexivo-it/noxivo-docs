import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const UsageMeterEventSchema = new Schema({
  agencyId: {
    type: String,
    required: true,
    index: true
  },
  tenantId: {
    type: String,
    default: null,
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
  value: {
    type: Number,
    required: true,
    min: 1
  },
  idempotencyKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  }
}, {
  collection: 'usage_meter_events',
  timestamps: true
});

UsageMeterEventSchema.index({ agencyId: 1, metric: 1, windowStart: 1 });

export type UsageMeterEvent = InferSchemaType<typeof UsageMeterEventSchema>;

export const UsageMeterEventModel =
  (models.UsageMeterEvent as Model<UsageMeterEvent> | undefined) ||
  model<UsageMeterEvent>('UsageMeterEvent', UsageMeterEventSchema);
