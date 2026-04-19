import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const AuthSessionSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
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
  sessionTokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  lastSeenAt: {
    type: Date,
    required: true,
    default: () => new Date()
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  }
}, {
  collection: 'auth_sessions',
  timestamps: true
});

AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AuthSession = InferSchemaType<typeof AuthSessionSchema>;

export const AuthSessionModel =
  (models.AuthSession as Model<AuthSession> | undefined) ||
  model<AuthSession>('AuthSession', AuthSessionSchema);
