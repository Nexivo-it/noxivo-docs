import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { Schema, model, models } = mongoose;

const SpaWebhookSchema = new Schema({
  agencyId: {
    type: Schema.Types.ObjectId,
    ref: 'Agency',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },
  url: {
    type: String,
    required: true,
  },
  events: {
    type: [String],
    required: true,
    enum: [
      'booking.created',
      'booking.updated',
      'booking.cancelled',
      'customer.created',
      'customer.updated',
      'service.created',
      'service.updated',
      'inventory.low',
    ],
  },
  secret: {
    type: String,
    default: '',
    maxlength: 200,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastTriggeredAt: {
    type: Date,
    default: null,
  },
  lastStatus: {
    type: String,
    default: null,
    enum: ['success', 'failed', null],
  },
  lastError: {
    type: String,
    default: null,
    maxlength: 500,
  },
}, {
  timestamps: true,
});

SpaWebhookSchema.index({ agencyId: 1, isActive: 1 });

export type SpaWebhook = InferSchemaType<typeof SpaWebhookSchema>;

export const SpaWebhookModel =
  (models.SpaWebhook as Model<SpaWebhook> | undefined) ||
  model<SpaWebhook>('SpaWebhook', SpaWebhookSchema);