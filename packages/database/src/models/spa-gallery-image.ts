import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { Schema, model, models } = mongoose;

const SpaGalleryImageSchema = new Schema({
  agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
  url: { type: String, required: true },
  alt: { type: String, default: '' },
  category: { type: String, default: 'General' },
  sortOrder: { type: Number, required: true, default: 0 },
  isActive: { type: Boolean, required: true, default: true },
}, {
  collection: 'spa_gallery_images',
  timestamps: true,
});

export type SpaGalleryImage = InferSchemaType<typeof SpaGalleryImageSchema>;

export const SpaGalleryImageModel =
  (models.SpaGalleryImage as Model<SpaGalleryImage> | undefined) ||
  model<SpaGalleryImage>('SpaGalleryImage', SpaGalleryImageSchema);
