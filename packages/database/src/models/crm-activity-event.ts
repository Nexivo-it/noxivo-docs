import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const CrmActivityEventSchema = new Schema({
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
  type: {
    type: String,
    required: true,
    enum: [
      'message_inbound',
      'message_outbound',
      'note_added',
      'tag_updated',
      'stage_updated',
      'owner_updated',
      'sync_imported',
      'sync_exported'
    ]
  },
  occurredAt: {
    type: Date,
    required: true,
    default: () => new Date()
  },
  summary: {
    type: String,
    required: true,
    trim: true
  },
  metadata: {
    type: Schema.Types.Mixed,
    required: true,
    default: () => ({})
  }
}, {
  collection: 'crm_activity_events',
  timestamps: true
});

CrmActivityEventSchema.index({ tenantId: 1, contactId: 1, occurredAt: -1 });

export type CrmActivityEvent = InferSchemaType<typeof CrmActivityEventSchema>;

export const CrmActivityEventModel =
  (models.CrmActivityEvent as Model<CrmActivityEvent> | undefined) ||
  model<CrmActivityEvent>('CrmActivityEvent', CrmActivityEventSchema);
