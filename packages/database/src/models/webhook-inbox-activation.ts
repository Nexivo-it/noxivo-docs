import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { Schema, model, models } = mongoose;

function generateWebhookUrl(agencyId: string, tenantId: string): string {
  const encoded = Buffer.from(`${agencyId}:${tenantId}:${Date.now()}`).toString('base64url');
  return `/api/webhook-inbox/${encoded}`;
}

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'wbi_';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

const WebhookInboxActivationSchema = new Schema({
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
  isActive: {
    type: Boolean,
    required: true,
    default: false,
  },
  webhookUrl: {
    type: String,
    required: true,
    unique: true,
  },
  apiKey: {
    type: String,
    required: true,
    unique: true,
    maxlength: 64,
  },
  activatedAt: {
    type: Date,
    default: null,
  },
  deactivatedAt: {
    type: Date,
    default: null,
  },
}, {
  collection: 'webhook_inbox_activations',
  timestamps: true,
});

WebhookInboxActivationSchema.index({ agencyId: 1, tenantId: 1 });

WebhookInboxActivationSchema.statics.activate = async function(
  agencyId: string,
  tenantId: string
) {
  const existing = await this.findOne({ agencyId, tenantId });

  if (existing) {
    if (existing.isActive) {
      existing.webhookUrl = generateWebhookUrl(agencyId, tenantId);
      existing.apiKey = generateApiKey();
      await existing.save();
      return existing;
    }
    // Reactivate
existing.isActive = true;
      existing.webhookUrl = generateWebhookUrl(agencyId, tenantId);
      existing.apiKey = generateApiKey();
      existing.activatedAt = new Date();
      existing.deactivatedAt = null;
      await existing.save();
      return existing;
  }

  return this.create({
    agencyId,
    tenantId,
    isActive: true,
    webhookUrl: generateWebhookUrl(agencyId, tenantId),
    apiKey: generateApiKey(),
    activatedAt: new Date(),
  });
};

WebhookInboxActivationSchema.statics.deactivate = async function(
  agencyId: string,
  tenantId: string
) {
  const existing = await this.findOne({ agencyId, tenantId });

  if (!existing) {
    return null;
  }

  existing.isActive = false;
  existing.deactivatedAt = new Date();
  await existing.save();
  return existing;
};

WebhookInboxActivationSchema.statics.getStatus = async function(
  agencyId: string,
  tenantId: string
) {
  const existing = await this.findOne({ agencyId, tenantId });

  if (!existing) {
    return { isActive: false, webhookUrl: null, apiKey: null };
  }

  return {
    isActive: existing.isActive,
    webhookUrl: existing.isActive ? existing.webhookUrl : null,
    apiKey: existing.isActive ? existing.apiKey : null,
    activatedAt: existing.activatedAt,
    deactivatedAt: existing.deactivatedAt,
  };
};

type WebhookInboxActivationModelType = Model<WebhookInboxActivation> & {
  activate(agencyId: string, tenantId: string): Promise<WebhookInboxActivation>;
  deactivate(agencyId: string, tenantId: string): Promise<WebhookInboxActivation | null>;
  getStatus(agencyId: string, tenantId: string): Promise<{
    isActive: boolean;
    webhookUrl: string | null;
    apiKey: string | null;
    activatedAt: Date | null;
    deactivatedAt: Date | null;
  }>;
};

export type WebhookInboxActivation = InferSchemaType<typeof WebhookInboxActivationSchema>;

export const WebhookInboxActivationModel =
  (models.WebhookInboxActivation as WebhookInboxActivationModelType | undefined) ||
  model<WebhookInboxActivation>('WebhookInboxActivation', WebhookInboxActivationSchema) as WebhookInboxActivationModelType;