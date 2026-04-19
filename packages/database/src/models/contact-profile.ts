import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const CrmOwnerSubSchema = new Schema({
  externalOwnerId: {
    type: String,
    required: true,
    trim: true
  },
  displayName: {
    type: String,
    default: null,
    trim: true
  },
  email: {
    type: String,
    default: null,
    trim: true
  }
}, { _id: false });

const CrmPipelineStageSubSchema = new Schema({
  pipelineId: {
    type: String,
    required: true,
    trim: true
  },
  stageId: {
    type: String,
    required: true,
    trim: true
  },
  stageName: {
    type: String,
    required: true,
    trim: true
  }
}, { _id: false });

const CrmTagSubSchema = new Schema({
  id: {
    type: String,
    default: null,
    trim: true
  },
  label: {
    type: String,
    required: true,
    trim: true
  }
}, { _id: false });

const CrmNoteSubSchema = new Schema({
  id: {
    type: String,
    default: null,
    trim: true
  },
  body: {
    type: String,
    required: true,
    trim: true
  },
  authorUserId: {
    type: String,
    required: true,
    trim: true
  },
  createdAt: {
    type: Date,
    required: true,
    default: () => new Date()
  },
  externalRecordId: {
    type: String,
    default: null,
    trim: true
  }
}, { _id: false });

const ContactProfileSchema = new Schema({
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
  contactId: {
    type: String,
    required: true,
    index: true
  },
  contactName: {
    type: String,
    default: null,
    trim: true
  },
  contactPhone: {
    type: String,
    default: null,
    trim: true
  },
  firstSeenAt: {
    type: Date,
    default: null
  },
  lastInboundAt: {
    type: Date,
    default: null
  },
  lastOutboundAt: {
    type: Date,
    default: null
  },
  crmOwner: {
    type: CrmOwnerSubSchema,
    default: null
  },
  crmPipelineStage: {
    type: CrmPipelineStageSubSchema,
    default: null
  },
  crmTags: {
    type: [CrmTagSubSchema],
    default: () => []
  },
  crmNotes: {
    type: [CrmNoteSubSchema],
    default: () => []
  },
  lastCrmSyncedAt: {
    type: Date,
    default: null
  },
  totalMessages: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  inboundMessages: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  outboundMessages: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  }
}, {
  collection: 'contact_profiles',
  timestamps: true
});

ContactProfileSchema.index({ tenantId: 1, contactId: 1 }, { unique: true });

export type ContactProfile = InferSchemaType<typeof ContactProfileSchema>;

export const ContactProfileModel =
  (models.ContactProfile as Model<ContactProfile> | undefined) ||
  model<ContactProfile>('ContactProfile', ContactProfileSchema);
