import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const ApiKeySchema = new Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
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
  name: {
    type: String,
    required: true,
    default: 'Default API Key',
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'revoked'],
    default: 'active',
    required: true
  },
  lastUsedAt: {
    type: Date,
    default: null
  }
}, {
  collection: 'api_keys',
  timestamps: true
});

ApiKeySchema.index({ agencyId: 1, tenantId: 1 });

export type ApiKey = InferSchemaType<typeof ApiKeySchema>;

export const ApiKeyModel =
  (models.ApiKey as Model<ApiKey> | undefined) ||
  model<ApiKey>('ApiKey', ApiKeySchema);
