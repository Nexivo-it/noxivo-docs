import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const TenantCredentialSchema = new Schema({
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
    enum: ['google_sheets', 'airtable', 'slack', 'hubspot', 'shopify', 'woocommerce'],
    index: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  // Encrypted payload (e.g. JSON string containing keys)
  encryptedData: {
    type: String,
    required: true
  },
  // Non-sensitive integration defaults
  config: {
    type: Schema.Types.Mixed,
    default: () => ({})
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'error', 'expired'],
    default: 'active'
  }
}, {
  collection: 'tenant_credentials',
  timestamps: true
});

// Ensure only one credential set per provider per tenant
TenantCredentialSchema.index({ tenantId: 1, provider: 1 }, { unique: true });

export type TenantCredential = InferSchemaType<typeof TenantCredentialSchema>;

export const TenantCredentialModel =
  (models.TenantCredential as Model<TenantCredential> | undefined) ||
  model<TenantCredential>('TenantCredential', TenantCredentialSchema);
