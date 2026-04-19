import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { Schema, model, models } = mongoose;

const InternalInboxSendReservationSchema = new Schema({
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  agencyId: {
    type: String,
    required: true,
    index: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  operatorUserId: {
    type: String,
    required: true
  },
  content: {
    type: String,
    default: ''
  },
  payloadSignature: {
    type: String,
    required: true
  },
  idempotencyKey: {
    type: String,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  messageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  messagingMessageId: {
    type: String,
    default: null
  },
  error: {
    type: String,
    default: null
  }
}, {
  collection: 'internal_inbox_send_reservations',
  timestamps: true
});

InternalInboxSendReservationSchema.index({ conversationId: 1, idempotencyKey: 1 }, { unique: true });

export type InternalInboxSendReservation = InferSchemaType<typeof InternalInboxSendReservationSchema>;

export const InternalInboxSendReservationModel =
  (models.InternalInboxSendReservation as Model<InternalInboxSendReservation> | undefined) ||
  model<InternalInboxSendReservation>('InternalInboxSendReservation', InternalInboxSendReservationSchema);
