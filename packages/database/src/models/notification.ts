import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

export const NotificationSchema = new Schema({
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
  type: {
    type: String,
    required: true,
    enum: ['workflow_failure', 'workflow_completed', 'handoff_requested', 'usage_limit_warning', 'session_disconnected'],
    index: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    required: true,
    enum: ['info', 'warning', 'error', 'critical'],
    default: 'info'
  },
  workflowId: {
    type: Schema.Types.ObjectId,
    index: true,
    default: null
  },
  workflowName: {
    type: String,
    default: null
  },
  nodeId: {
    type: String,
    default: null
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  isRead: {
    type: Boolean,
    required: true,
    default: false
  },
  readAt: {
    type: Date,
    default: null
  }
}, {
  collection: 'notifications',
  timestamps: true
});

NotificationSchema.index({ agencyId: 1, tenantId: 1, createdAt: -1 });
NotificationSchema.index({ agencyId: 1, isRead: 1, createdAt: -1 });

export type Notification = InferSchemaType<typeof NotificationSchema>;

export const NotificationModel =
  (models.Notification as Model<Notification> | undefined) ||
  model<Notification>('Notification', NotificationSchema);
