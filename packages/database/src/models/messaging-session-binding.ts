import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const MessagingSessionBindingSchema = new Schema({
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
  accountName: {
    type: String,
    trim: true,
    default: null
  },
  clusterId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  },
  sessionName: {
    type: String,
    required: true,
    trim: true
  },
  messagingSessionName: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  routingMetadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'active', 'failed', 'stopped'],
    default: 'pending'
  }
}, {
  collection: 'messaging_session_bindings',
  timestamps: true
});

// Compound index for querying a tenant's sessions
MessagingSessionBindingSchema.index({ agencyId: 1, tenantId: 1, status: 1 });
MessagingSessionBindingSchema.index(
  { agencyId: 1, tenantId: 1, accountName: 1 },
  {
    unique: true,
    partialFilterExpression: {
      accountName: { $type: 'string' }
    }
  }
);

export type MessagingSessionBinding = InferSchemaType<typeof MessagingSessionBindingSchema>;

export const MessagingSessionBindingModel =
  (models.MessagingSessionBinding as Model<MessagingSessionBinding> | undefined) ||
  model<MessagingSessionBinding>('MessagingSessionBinding', MessagingSessionBindingSchema);
