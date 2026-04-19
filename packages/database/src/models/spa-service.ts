import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { Schema, model, models } = mongoose;

const SpaServiceSchema = new Schema({
  agencyId: {
    type: Schema.Types.ObjectId,
    ref: 'Agency',
    required: true,
    index: true,
  },
  categoryId: {
    type: Schema.Types.ObjectId,
    ref: 'SpaServiceCategory',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 160,
  },
  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 160,
  },
  description: {
    type: String,
    default: '',
  },
  price: {
    type: Number,
    required: true,
    default: 0,
  },
  durationLabel: {
    type: String,
    default: '',
  },
  imageRef: {
    type: String,
    default: null,
  },
  isActive: {
    type: Boolean,
    required: true,
    default: true,
  },
  sortOrder: {
    type: Number,
    required: true,
    default: 0,
  },
  kind: {
    type: String,
    required: true,
    enum: ['service', 'product'],
    default: 'service',
  },
}, {
  collection: 'spa_services',
  timestamps: true,
});

SpaServiceSchema.index({ agencyId: 1, slug: 1 }, { unique: true });

export type SpaService = InferSchemaType<typeof SpaServiceSchema>;

export const SpaServiceModel =
  (models.SpaService as Model<SpaService> | undefined) ||
  model<SpaService>('SpaService', SpaServiceSchema);
