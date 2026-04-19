import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { Schema, model, models } = mongoose;

const SpaSessionSchema = new Schema({
  agencyId: {
    type: Schema.Types.ObjectId,
    ref: 'Agency',
    required: true,
    index: true,
  },
  memberId: {
    type: Schema.Types.ObjectId,
    ref: 'SpaMember',
    required: true,
    index: true,
  },
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  revokedAt: {
    type: Date,
    default: null,
  },
  ipAddress: {
    type: String,
    default: null,
  },
  userAgent: {
    type: String,
    default: null,
  },
}, {
  collection: 'spa_sessions',
  timestamps: true,
});

SpaSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SpaSession = InferSchemaType<typeof SpaSessionSchema>;

export const SpaSessionModel =
  (models.SpaSession as Model<SpaSession> | undefined) ||
  model<SpaSession>('SpaSession', SpaSessionSchema);
