import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

/**
 * AI Sales Agent runtime state per tenant/conversation.
 *
 * Tracks whether AI Sales Agent is activated and in which mode:
 * - bot_active: automation is running
 * - human_takeover: human has taken over, AI is paused
 *
 * This model is separate from PluginInstallationModel because it tracks
 * runtime execution state (mode), not installation status (enabled).
 */
const PluginStateSchema = new Schema({
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
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    default: null,
    index: true
  },
  pluginId: {
    type: String,
    required: true,
    default: 'ai-sales-agent',
    trim: true
  },
  enabled: {
    type: Boolean,
    required: true,
    default: false
  },
  mode: {
    type: String,
    required: true,
    enum: ['bot_active', 'human_takeover'],
    default: 'bot_active'
  },
  pausedByUserId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  pausedAt: {
    type: Date,
    default: null
  },
  resumeAt: {
    type: Date,
    default: null
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: () => ({})
  }
}, {
  collection: 'ai_agent_plugin_states',
  timestamps: true
});

// Unique: one state record per tenant/conversation combination
PluginStateSchema.index({ agencyId: 1, tenantId: 1, pluginId: 1, conversationId: 1 }, { unique: true });
// Query index for efficient tenant-mode lookups
PluginStateSchema.index({ tenantId: 1, pluginId: 1, mode: 1 });

export type PluginState = InferSchemaType<typeof PluginStateSchema>;

export const PluginStateModel =
  (models.PluginState as Model<PluginState> | undefined) ||
  model<PluginState>('PluginState', PluginStateSchema);