import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { Schema, model, models } = mongoose;

const SpaCustomerProfileSchema = new Schema({
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
  email: {
    type: String,
    default: null,
    trim: true,
    lowercase: true,
    maxlength: 160,
    index: true,
  },
  phone: {
    type: String,
    default: null,
    trim: true,
    maxlength: 40,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },
  bookingCount: {
    type: Number,
    required: true,
    default: 0,
  },
  lastBookingAt: {
    type: Date,
    default: null,
  },
  lastBookingLabel: {
    type: String,
    default: '',
  },
  lastBookingStatus: {
    type: String,
    default: 'pending',
  },
  notes: {
    type: String,
    default: '',
  },
  tags: {
    type: [String],
    default: [],
  },
}, {
  collection: 'spa_customer_profiles',
  timestamps: true,
});

export type SpaCustomerProfile = InferSchemaType<typeof SpaCustomerProfileSchema>;

export const SpaCustomerProfileModel =
  (models.SpaCustomerProfile as Model<SpaCustomerProfile> | undefined) ||
  model<SpaCustomerProfile>('SpaCustomerProfile', SpaCustomerProfileSchema);
