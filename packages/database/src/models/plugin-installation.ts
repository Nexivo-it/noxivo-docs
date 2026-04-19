import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const PluginInstallationSchema = new Schema({
  agencyId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  },
  tenantId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  },
  pluginId: {
    type: String,
    required: true,
    trim: true
  },
  pluginVersion: {
    type: String,
    required: true,
    trim: true
  },
  enabled: {
    type: Boolean,
    required: true,
    default: false
  },
  config: {
    type: Schema.Types.Mixed,
    default: () => ({})
  }
}, {
  collection: 'plugin_installations',
  timestamps: true
});

PluginInstallationSchema.index({ agencyId: 1, tenantId: 1, pluginId: 1 }, { unique: true });

export type PluginInstallation = InferSchemaType<typeof PluginInstallationSchema>;

export const PluginInstallationModel =
  (models.PluginInstallation as Model<PluginInstallation> | undefined) ||
  model<PluginInstallation>('PluginInstallation', PluginInstallationSchema);
