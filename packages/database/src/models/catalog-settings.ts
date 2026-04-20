import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { Schema, model, models } = mongoose;

const CatalogSettingsSchema = new Schema({
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    unique: true,
    index: true,
  },
  businessName: {
    type: String,
    trim: true,
    default: '',
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'VND', 'AUD', 'CAD'],
  },
  timezone: {
    type: String,
    default: 'UTC',
  },
  accentColor: {
    type: String,
    default: '#4F46E5',
    match: /^#[0-9A-Fa-f]{6}$/,
  },
  logoUrl: {
    type: String,
    default: '',
  },
  defaultDuration: {
    type: Number,
    default: 30,
  },
}, {
  collection: 'catalog_settings',
  timestamps: true,
});

export type CatalogSettings = InferSchemaType<typeof CatalogSettingsSchema>;

export const CatalogSettingsModel =
  (models.CatalogSettings as Model<CatalogSettings> | undefined) ||
  model<CatalogSettings>('CatalogSettings', CatalogSettingsSchema);
