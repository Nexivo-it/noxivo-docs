import { z } from 'zod';
import {
  parsePluginManifest,
  type PluginDefinition,
  type PluginManifest,
  type PluginExecutionContext,
  type PluginExecutionResult
} from '@noxivo/contracts';
import { AgentPersonaModel, PluginStateModel } from '@noxivo/database';
import { toolRegistry } from '../../agents/tools/tool-registry.js';

const AgenticAiPayloadSchema = z.object({
  action: z.enum(['execute', 'checkMode']),
  message: z.string().optional()
}).strict();

const AgenticAiConfigSchema = z.object({
  personaId: z.string().optional(),
  dataSourceId: z.string().optional()
}).strict();

export function createAiSalesAgentPlugin(): PluginDefinition {
  const manifest: PluginManifest = parsePluginManifest({
    id: 'ai-sales-agent',
    version: '1.0.0',
    displayName: 'AI Sales Agent',
    category: 'messaging',
    configSchema: {
      personaId: { type: 'string' },
      dataSourceId: { type: 'string' }
    },
    actionSchema: {
      execute: { message: 'string' },
      checkMode: {}
    }
  });

  return {
    manifest,
    configParser: AgenticAiConfigSchema,
    payloadParser: AgenticAiPayloadSchema,
    async execute(context: PluginExecutionContext): Promise<PluginExecutionResult> {
      const payload = AgenticAiPayloadSchema.parse(context.payload);
      const config = AgenticAiConfigSchema.parse(context.config || {});

      if (payload.action === 'checkMode') {
        const state = await PluginStateModel.findOne({
          tenantId: context.tenantId,
          pluginId: 'ai-sales-agent'
        }).lean().exec();

        return {
          success: true,
          output: { mode: state?.mode || 'bot_active', enabled: state?.enabled || false },
          error: null,
          executedAt: new Date().toISOString()
        };
      }

      if (payload.action === 'execute') {
        const state = await PluginStateModel.findOne({
          tenantId: context.tenantId,
          pluginId: 'ai-sales-agent'
        }).lean().exec();

        if (!state?.enabled || state.mode === 'human_takeover') {
          return {
            success: true,
            output: { decision: 'noop', reason: 'human_takeover' },
            error: null,
            executedAt: new Date().toISOString()
          };
        }

        const persona = await AgentPersonaModel.findOne({
          tenantId: context.tenantId,
          pluginId: 'ai-sales-agent',
          active: true
        }).lean().exec();

        if (!persona) {
          return {
            success: false,
            output: null,
            error: 'No active persona configured',
            executedAt: new Date().toISOString()
          };
        }

        const toolCtx = {
          agencyId: context.agencyId,
          tenantId: context.tenantId,
          conversationId: '',
          pluginId: 'ai-sales-agent'
        };

        let replyText = '';
        let decision: 'reply' | 'handoff' | 'noop' = 'noop';

        if (payload.message?.toLowerCase().includes('iphone') || payload.message?.toLowerCase().includes('apple')) {
          const toolResult = await toolRegistry.execute(
            'search_store',
            toolCtx,
            { query: payload.message, limit: 3 }
          );

          if (toolResult.success && toolResult.result) {
            const result = toolResult.result as { items: Array<{ title: string; price: number; currency: string }> };
            const items = result.items;
            if (items.length > 0) {
              const formatted = items.map(i => `• ${i.title} - $${i.price} ${i.currency}`).join('\n');
              replyText = `Here are some options:\n${formatted}\n\nWould you like more details?`;
              decision = 'reply';
            }
          }
        }

        if (!replyText) {
          replyText = persona.fallbackMessage;
          decision = 'reply';
        }

        return {
          success: true,
          output: { decision, replyText, toolTrace: [] },
          error: null,
          executedAt: new Date().toISOString()
        };
      }

      return {
        success: false,
        output: null,
        error: 'Unknown action',
        executedAt: new Date().toISOString()
      };
    }
  };
}
