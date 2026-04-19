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

const AgencySchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 120
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[a-z0-9-]{3,48}$/
  },
  plan: {
    type: String,
    required: true,
    enum: ['reseller_basic', 'reseller_pro', 'enterprise']
  },
  billingStripeCustomerId: {
    type: String,
    default: null
  },
  billingStripeSubscriptionId: {
    type: String,
    default: null
  },
  billingOwnerUserId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  },
  whiteLabelDefaults: {
    type: Schema.Types.Mixed,
    required: true,
    set: normalizeWhiteLabelConfig,
    validate: {
      validator: validateWhiteLabelConfig,
      message: 'whiteLabelDefaults must match WhiteLabelConfigSchema'
    }
  },
  usageLimits: {
    tenants: {
      type: Number,
      required: true,
      min: 1
    },
    activeSessions: {
      type: Number,
      required: true,
      min: 1
    }
  },
  status: {
    type: String,
    required: true,
    enum: ['trial', 'active', 'suspended', 'cancelled']
  }
}, {
  collection: 'agencies',
  timestamps: true
});

export type Agency = InferSchemaType<typeof AgencySchema>;

export const AgencyModel =
  (models.Agency as Model<Agency> | undefined) ||
  model<Agency>('Agency', AgencySchema);
