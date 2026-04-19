import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const AgencyInvitationSchema = new Schema({
  agencyId: {
    type: Schema.Types.ObjectId,
    ref: 'Agency',
    required: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 160
  },
  fullName: {
    type: String,
    default: null,
    trim: true,
    maxlength: 120
  },
  role: {
    type: String,
    required: true,
    enum: ['agency_owner', 'agency_admin', 'agency_member', 'viewer']
  },
  tenantIds: {
    type: [{
      type: Schema.Types.ObjectId,
      ref: 'Tenant'
    }],
    default: []
  },
  invitedByUserId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'accepted', 'expired', 'revoked'],
    default: 'pending'
  },
  expiresAt: {
    type: Date,
    required: true
  },
  acceptedAt: {
    type: Date,
    default: null
  },
  revokedAt: {
    type: Date,
    default: null
  },
  lastSentAt: {
    type: Date,
    required: true,
    default: () => new Date()
  }
}, {
  collection: 'agency_invitations',
  timestamps: true
});

AgencyInvitationSchema.index(
  { agencyId: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: 'pending'
    }
  }
);

export type AgencyInvitation = InferSchemaType<typeof AgencyInvitationSchema>;

export const AgencyInvitationModel =
  (models.AgencyInvitation as Model<AgencyInvitation> | undefined) ||
  model<AgencyInvitation>('AgencyInvitation', AgencyInvitationSchema);
