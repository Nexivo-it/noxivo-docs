import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const CrmExternalRecordLinkSchema = new Schema({
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
  provider: {
    type: String,
    required: true,
    enum: ['hubspot', 'salesforce', 'pipedrive', 'custom']
  },
  objectType: {
    type: String,
    required: true,
    enum: ['contact', 'deal', 'note', 'activity']
  },
  externalRecordId: {
    type: String,
    required: true,
    trim: true
  },
  externalUrl: {
    type: String,
    default: null,
    trim: true
  },
  linkedAt: {
    type: Date,
    required: true,
    default: () => new Date()
  }
}, {
  collection: 'crm_external_record_links',
  timestamps: true
});

CrmExternalRecordLinkSchema.index({ tenantId: 1, provider: 1, objectType: 1, externalRecordId: 1 }, { unique: true });

export type CrmExternalRecordLink = InferSchemaType<typeof CrmExternalRecordLinkSchema>;

export const CrmExternalRecordLinkModel =
  (models.CrmExternalRecordLink as Model<CrmExternalRecordLink> | undefined) ||
  model<CrmExternalRecordLink>('CrmExternalRecordLink', CrmExternalRecordLinkSchema);
