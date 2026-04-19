import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const MessagingClusterSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  region: {
    type: String,
    required: true,
    index: true
  },
  baseUrl: {
    type: String,
    required: true
  },
  dashboardUrl: {
    type: String,
    required: true
  },
  swaggerUrl: {
    type: String,
    required: true
  },
  capacity: {
    type: Number,
    required: true,
    min: 1
  },
  activeSessionCount: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'maintenance', 'offline'],
    default: 'active'
  },
  secretRefs: {
    webhookSecretVersion: {
      type: String,
      required: true
    }
  }
}, {
  collection: 'messaging_clusters',
  timestamps: true
});

export type MessagingCluster = InferSchemaType<typeof MessagingClusterSchema>;

export const MessagingClusterModel =
  (models.MessagingCluster as Model<MessagingCluster> | undefined) ||
  model<MessagingCluster>('MessagingCluster', MessagingClusterSchema);
