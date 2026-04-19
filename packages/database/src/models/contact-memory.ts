import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const ContactMemorySchema = new Schema({
  agencyId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  },
  tenantId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  },
  contactId: {
    type: String,
    required: true,
    index: true
  },
  fact: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  category: {
    type: String,
    required: true,
    enum: ['preference', 'context', 'history', 'note', 'custom'],
    default: 'custom'
  },
  source: {
    type: String,
    required: true,
    enum: ['ai_extracted', 'agent_added', 'workflow_learned', 'manual'],
    default: 'workflow_learned'
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 1
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  collection: 'contact_memories',
  timestamps: true
});

ContactMemorySchema.index({ agencyId: 1, tenantId: 1, contactId: 1, createdAt: -1 });
ContactMemorySchema.index({ agencyId: 1, tenantId: 1, category: 1 });

export type ContactMemory = InferSchemaType<typeof ContactMemorySchema>;

export const ContactMemoryModel =
  (models.ContactMemory as Model<ContactMemory> | undefined) ||
  model<ContactMemory>('ContactMemory', ContactMemorySchema);
