import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const MessageAttachmentSchema = new Schema({
  kind: {
    type: String,
    required: true,
    enum: ['image', 'video', 'audio', 'document']
  },
  url: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    default: null
  },
  caption: {
    type: String,
    default: null
  },
  sizeBytes: {
    type: Number,
    default: null,
    min: 0
  }
}, { _id: false });

const MessageSchema = new Schema({
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  role: {
    type: String,
    required: true,
    enum: ['user', 'assistant', 'system']
  },
  content: {
    type: String,
    required(this: { attachments?: Array<unknown> }) {
      return (this.attachments?.length ?? 0) === 0;
    },
    default: ''
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  messagingMessageId: {
    type: String,
    sparse: true,
    index: true
  },
  providerMessageId: {
    type: String,
    default: null,
    sparse: true,
    index: true
  },
  providerAck: {
    type: Number,
    default: null
  },
  providerAckName: {
    type: String,
    default: null
  },
  replyToMessageId: {
    type: String,
    default: null
  },
  deliveryStatus: {
    type: String,
    enum: ['queued', 'sent', 'delivered', 'read', 'failed', 'revoked'],
    default: null,
    index: true
  },
  attachments: {
    type: [MessageAttachmentSchema],
    default: []
  },
  error: {
    type: String,
    default: null
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  collection: 'messages',
  timestamps: true
});

// Ensure efficient history retrieval
MessageSchema.index({ conversationId: 1, timestamp: -1 });

export type Message = InferSchemaType<typeof MessageSchema>;

export const MessageModel =
  (models.Message as Model<Message> | undefined) ||
  model<Message>('Message', MessageSchema);
