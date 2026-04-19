import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { Schema, model, models } = mongoose;

const WebhookInboxSourceSchema = new Schema({
  agencyId: {
    type: Schema.Types.ObjectId,
    ref: 'Agency',
    required: true,
    index: true,
  },
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'disabled'],
    default: 'active',
  },
  inboundPath: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  inboundSecretHash: {
    type: String,
    required: true,
    trim: true,
    maxlength: 128,
  },
  outboundUrl: {
    type: String,
    required: true,
    trim: true,
  },
  outboundHeaders: {
    type: Schema.Types.Mixed,
    default: () => ({}),
  },
  disabledAt: {
    type: Date,
    default: null,
  },
}, {
  collection: 'webhook_inbox_sources',
  timestamps: true,
});

WebhookInboxSourceSchema.index({ agencyId: 1, tenantId: 1, createdAt: -1 });
WebhookInboxSourceSchema.index({ agencyId: 1, tenantId: 1, status: 1, createdAt: -1 });

export type WebhookInboxSource = InferSchemaType<typeof WebhookInboxSourceSchema>;

export const WebhookInboxSourceModel =
  (models.WebhookInboxSource as Model<WebhookInboxSource> | undefined) ||
  model<WebhookInboxSource>('WebhookInboxSource', WebhookInboxSourceSchema);
