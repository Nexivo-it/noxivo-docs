import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { Schema, model, models } = mongoose;

const SpaMediaStorageConfigSchema = new Schema({
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
  collection: 'spa_media_storage_configs',
  timestamps: true,
});

export type SpaMediaStorageConfig = InferSchemaType<typeof SpaMediaStorageConfigSchema>;

export const SpaMediaStorageConfigModel =
  (models.SpaMediaStorageConfig as Model<SpaMediaStorageConfig> | undefined) ||
  model<SpaMediaStorageConfig>('SpaMediaStorageConfig', SpaMediaStorageConfigSchema);
