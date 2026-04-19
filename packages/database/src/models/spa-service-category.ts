import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { Schema, model, models } = mongoose;

const SpaServiceCategorySchema = new Schema({
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
  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 120,
  },
  description: {
    type: String,
    default: null,
  },
  sortOrder: {
    type: Number,
    required: true,
    default: 0,
  },
  isActive: {
    type: Boolean,
    required: true,
    default: true,
  },
}, {
  collection: 'spa_service_categories',
  timestamps: true,
});

SpaServiceCategorySchema.index({ agencyId: 1, slug: 1 }, { unique: true });

export type SpaServiceCategory = InferSchemaType<typeof SpaServiceCategorySchema>;

export const SpaServiceCategoryModel =
  (models.SpaServiceCategory as Model<SpaServiceCategory> | undefined) ||
  model<SpaServiceCategory>('SpaServiceCategory', SpaServiceCategorySchema);
