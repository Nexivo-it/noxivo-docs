import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { Schema, model, models } = mongoose;

const SpaAiConciergeConfigSchema = new Schema({
  agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
  personaName: { type: String, required: true, trim: true, maxlength: 120 },
  openingMessage: { type: String, default: '' },
  systemPrompt: { type: String, default: '' },
  model: { type: String, default: 'gemini-pro' },
  temperature: { type: Number, default: 0.7 },
  webhookUrl: { type: String, default: '' },
  suggestedPrompts: { type: [String], default: [] },
  active: { type: Boolean, required: true, default: true },
}, {
  collection: 'spa_ai_concierge_configs',
  timestamps: true,
});

export type SpaAiConciergeConfig = InferSchemaType<typeof SpaAiConciergeConfigSchema>;

export const SpaAiConciergeConfigModel =
  (models.SpaAiConciergeConfig as Model<SpaAiConciergeConfig> | undefined) ||
  model<SpaAiConciergeConfig>('SpaAiConciergeConfig', SpaAiConciergeConfigSchema);
