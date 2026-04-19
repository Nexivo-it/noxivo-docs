import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { Schema, model, models } = mongoose;

const SpaMemberSchema = new Schema({
  agencyId: {
    type: Schema.Types.ObjectId,
    ref: 'Agency',
    required: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 160,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 120,
  },
  phone: {
    type: String,
    default: null,
  },
  role: {
    type: String,
    required: true,
    enum: ['member', 'admin'],
    default: 'member',
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'suspended'],
    default: 'active',
  },
  avatarUrl: {
    type: String,
    default: null,
  },
  lastLoginAt: {
    type: Date,
    default: null,
  },
}, {
  collection: 'spa_members',
  timestamps: true,
});

SpaMemberSchema.index({ agencyId: 1, email: 1 }, { unique: true });

export type SpaMember = InferSchemaType<typeof SpaMemberSchema>;

export const SpaMemberModel =
  (models.SpaMember as Model<SpaMember> | undefined) ||
  model<SpaMember>('SpaMember', SpaMemberSchema);
