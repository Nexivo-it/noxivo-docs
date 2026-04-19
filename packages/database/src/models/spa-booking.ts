import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { Schema, model, models } = mongoose;

const SpaBookingServiceSnapshotSchema = new Schema({
  serviceId: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  duration: {
    type: String,
    required: true,
  },
}, { _id: false });

const SpaBookingSchema = new Schema({
  agencyId: {
    type: Schema.Types.ObjectId,
    ref: 'Agency',
    required: true,
    index: true,
  },
  memberId: {
    type: Schema.Types.ObjectId,
    ref: 'SpaMember',
    default: null,
    index: true,
  },
  customerName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },
  customerEmail: {
    type: String,
    default: null,
    trim: true,
    lowercase: true,
    maxlength: 160,
    index: true,
  },
  customerPhone: {
    type: String,
    default: null,
    trim: true,
    maxlength: 40,
  },
  appointmentDateIso: {
    type: String,
    required: true,
  },
  appointmentDateLabel: {
    type: String,
    required: true,
  },
  appointmentTime: {
    type: String,
    required: true,
  },
  selectedServices: {
    type: [SpaBookingServiceSnapshotSchema],
    default: [],
  },
  totalPrice: {
    type: Number,
    required: true,
    default: 0,
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'confirmed', 'completed', 'cancelled'],
    default: 'pending',
  },
  notes: {
    type: String,
    default: '',
  },
  source: {
    type: String,
    required: true,
    enum: ['guest', 'member', 'admin', 'whatsapp'],
    default: 'guest',
  },
}, {
  collection: 'spa_bookings',
  timestamps: true,
});

export type SpaBooking = InferSchemaType<typeof SpaBookingSchema>;

export const SpaBookingModel =
  (models.SpaBooking as Model<SpaBooking> | undefined) ||
  model<SpaBooking>('SpaBooking', SpaBookingSchema);
