import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { Schema, model, models } = mongoose;

const SpaSiteSettingsSchema = new Schema({
  agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
  salonName: { type: String, required: true, trim: true, maxlength: 160 },
  tagline: { type: String, default: '' },
  phone: { type: String, default: '' },
  whatsapp: { type: String, default: '' },
  email: { type: String, default: '' },
  address: { type: String, default: '' },
  hours: { type: Schema.Types.Mixed, default: [] },
  googleMapsUrl: { type: String, default: '' },
  googleMapsEmbed: { type: String, default: '' },
  socialLinks: { type: Schema.Types.Mixed, default: {} },
  metaDescription: { type: String, default: '' },
}, {
  collection: 'spa_site_settings',
  timestamps: true,
});

export type SpaSiteSettings = InferSchemaType<typeof SpaSiteSettingsSchema>;

export const SpaSiteSettingsModel =
  (models.SpaSiteSettings as Model<SpaSiteSettings> | undefined) ||
  model<SpaSiteSettings>('SpaSiteSettings', SpaSiteSettingsSchema);
