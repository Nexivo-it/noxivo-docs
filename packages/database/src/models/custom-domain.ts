import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;
import { normalizeCustomDomain } from '@noxivo/contracts';

const CustomDomainReservationSchema = new Schema({
  domain: {
    type: String,
    required: true,
    set: normalizeCustomDomain
  },
  ownerType: {
    type: String,
    enum: ['agency', 'tenant'],
    required: true
  },
  ownerId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  }
}, {
  collection: 'customDomainReservations',
  timestamps: true
});

CustomDomainReservationSchema.index({ domain: 1 }, { unique: true });

export type CustomDomainReservation = InferSchemaType<typeof CustomDomainReservationSchema>;

export const CustomDomainReservationModel =
  (models.CustomDomainReservation as Model<CustomDomainReservation> | undefined) ||
  model<CustomDomainReservation>('CustomDomainReservation', CustomDomainReservationSchema);
