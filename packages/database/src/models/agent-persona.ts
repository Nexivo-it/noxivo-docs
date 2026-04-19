import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const AgentPersonaSchema = new Schema({
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
  pluginId: {
    type: String,
    required: true,
    default: 'ai-sales-agent',
    trim: true
  },
  agentName: {
    type: String,
    required: true,
    trim: true
  },
  modelChoice: {
    type: String,
    required: true,
    default: 'gpt-4o'
  },
  systemPrompt: {
    type: String,
    required: true,
    default: ''
  },
  fallbackMessage: {
    type: String,
    required: true,
    default: 'Thanks for your message! A team member will be with you shortly.'
  },
  temperature: {
    type: Number,
    min: 0,
    max: 2,
    default: 0.7
  },
  maxTokens: {
    type: Number,
    min: 100,
    max: 4096,
    default: 1024
  },
  active: {
    type: Boolean,
    required: true,
    default: true
  }
}, {
  collection: 'ai_agent_personas',
  timestamps: true
});

AgentPersonaSchema.index({ agencyId: 1, tenantId: 1, pluginId: 1 }, { unique: true });

export type AgentPersona = InferSchemaType<typeof AgentPersonaSchema>;

export const AgentPersonaModel =
  (models.AgentPersona as Model<AgentPersona> | undefined) ||
  model<AgentPersona>('AgentPersona', AgentPersonaSchema);