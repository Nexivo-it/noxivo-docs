import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const MessageDeliveryEventSchema = new Schema({
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
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  messageId: {
    type: String,
    required: true,
    index: true
  },
  providerMessageId: {
    type: String,
    default: null,
    index: true
  },
  deliveryStatus: {
    type: String,
    required: true,
    enum: ['queued', 'sent', 'delivered', 'read', 'failed']
  },
  providerAck: {
    type: Number,
    default: null
  },
  providerAckName: {
    type: String,
    default: null
  },
  error: {
    type: String,
    default: null
  },
  source: {
    type: String,
    required: true,
    enum: ['message_create', 'webhook_message', 'webhook_ack', 'retry_worker', 'manual_resend']
  },
  occurredAt: {
    type: Date,
    required: true,
    default: () => new Date(),
    index: true
  },
  metadata: {
    type: Schema.Types.Mixed,
    required: true,
    default: () => ({})
  }
}, {
  collection: 'message_delivery_events',
  timestamps: true
});

MessageDeliveryEventSchema.index({ messageId: 1, occurredAt: 1 });
MessageDeliveryEventSchema.index({ tenantId: 1, deliveryStatus: 1, occurredAt: -1 });

export type MessageDeliveryEvent = InferSchemaType<typeof MessageDeliveryEventSchema>;

export const MessageDeliveryEventModel =
  (models.MessageDeliveryEvent as Model<MessageDeliveryEvent> | undefined) ||
  model<MessageDeliveryEvent>('MessageDeliveryEvent', MessageDeliveryEventSchema);

export { MessageDeliveryEventSchema };
