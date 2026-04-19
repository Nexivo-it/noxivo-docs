import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { Schema, model, models } = mongoose;

const MediaStorageConfigSchema = new Schema({
  agencyId: {
    type: Schema.Types.ObjectId,
    ref: 'Agency',
    required: true,
    index: true,
  },
  provider: {
    type: String,
    required: true,
    enum: ['s3', 'google_drive', 'imagekit', 'cloudinary'],
  },
  isActive: {
    type: Boolean,
    required: true,
    default: true,
  },
  publicBaseUrl: {
    type: String,
    default: null,
  },
  publicConfig: {
    type: Schema.Types.Mixed,
    default: {},
  },
  secretConfig: {
    type: Schema.Types.Mixed,
    default: {},
  },
  pathPrefix: {
    type: String,
    default: '',
  },
}, {
  collection: 'media_storage_configs',
  timestamps: true,
});

export type MediaStorageConfig = InferSchemaType<typeof MediaStorageConfigSchema>;

export const MediaStorageConfigModel =
  (models.MediaStorageConfig as Model<MediaStorageConfig> | undefined) ||
  model<MediaStorageConfig>('MediaStorageConfig', MediaStorageConfigSchema);
