import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;
import {
  WhiteLabelConfigSchema,
  type WhiteLabelConfig,
  parseWhiteLabelConfig
} from '@noxivo/contracts';

function validateWhiteLabelConfig(value: unknown): boolean {
  return WhiteLabelConfigSchema.safeParse(value).success;
}

function normalizeWhiteLabelConfig(value: unknown): WhiteLabelConfig {
  return parseWhiteLabelConfig(value);
}

const TenantSchema = new Schema({
  agencyId: {
    type: Schema.Types.ObjectId,
    ref: 'Agency',
    required: true,
    index: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[a-z0-9-]{3,48}$/
  },
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 120
  },
  region: {
    type: String,
    required: true,
    enum: ['eu-west-1', 'me-central-1', 'us-east-1']
  },
  status: {
    type: String,
    required: true,
    enum: ['trial', 'active', 'suspended', 'cancelled'],
    default: 'trial'
  },
  billingMode: {
    type: String,
    required: true,
    enum: ['agency_pays', 'tenant_pays']
  },
  whiteLabelOverrides: {
    type: Schema.Types.Mixed,
    default: () => parseWhiteLabelConfig({}),
    set: normalizeWhiteLabelConfig,
    validate: {
      validator: validateWhiteLabelConfig,
      message: 'whiteLabelOverrides must match WhiteLabelConfigSchema'
    }
  },
  effectiveBrandingCache: {
    type: Schema.Types.Mixed,
    default: () => parseWhiteLabelConfig({}),
    set: normalizeWhiteLabelConfig,
    validate: {
      validator: validateWhiteLabelConfig,
      message: 'effectiveBrandingCache must match WhiteLabelConfigSchema'
    }
  }
}, {
  collection: 'tenants',
  timestamps: true
});

TenantSchema.index({ agencyId: 1, slug: 1 }, { unique: true });

export type Tenant = InferSchemaType<typeof TenantSchema>;

export const TenantModel =
  (models.Tenant as Model<Tenant> | undefined) ||
  model<Tenant>('Tenant', TenantSchema);
