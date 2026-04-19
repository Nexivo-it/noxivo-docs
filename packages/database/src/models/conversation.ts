import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const ConversationSchema = new Schema({
  agencyId: {
    type: Schema.Types.ObjectId,
    ref: 'Agency',
    required: true,
    index: true
  },
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  contactId: {
    type: String,
    required: true,
    index: true
  },
  contactName: {
    type: String,
    trim: true
  },
  contactPhone: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    required: true,
    enum: ['open', 'assigned', 'handoff', 'resolved', 'closed', 'deleted'],
    default: 'open',
    index: true
  },
  assignedTo: {
    type: Schema.Types.ObjectId,
    default: null,
    index: true
  },
  lastMessageContent: {
    type: String,
    default: null
  },
  lastMessageAt: {
    type: Date,
    default: null,
    index: true
  },
  unreadCount: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  collection: 'conversations',
  timestamps: true
});

// Indexes for common queries
ConversationSchema.index({ tenantId: 1, contactId: 1 }, { unique: true });
ConversationSchema.index({ lastMessageAt: -1 });

export type Conversation = InferSchemaType<typeof ConversationSchema>;

export const ConversationModel =
  (models.Conversation as Model<Conversation> | undefined) ||
  model<Conversation>('Conversation', ConversationSchema);
