import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PluginStateModel, AgentPersonaModel } from '@noxivo/database';

const AiAgentStateRequestSchema = z.object({
  agencyId: z.string(),
  tenantId: z.string()
});

const AiAgentStateUpdateSchema = z.object({
  agencyId: z.string(),
  tenantId: z.string(),
  enabled: z.boolean().optional(),
  mode: z.enum(['bot_active', 'human_takeover']).optional()
});

const AiAgentPersonaRequestSchema = z.object({
  agencyId: z.string(),
  tenantId: z.string()
});

const AiAgentPersonaUpdateSchema = z.object({
  agencyId: z.string(),
  tenantId: z.string(),
  agentName: z.string().optional(),
  modelChoice: z.string().optional(),
  systemPrompt: z.string().optional(),
  fallbackMessage: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(100).max(4096).optional(),
  active: z.boolean().optional()
});

export async function aiSalesAgentRoutes(fastify: FastifyInstance) {
  fastify.post<{ Reply: unknown }>(
    '/ai-sales-agent/state',
    {
      schema: {
        description: 'Get AI Sales Agent state (enabled/mode) for a specific tenant',
        tags: ['AI Sales Agent'],
        body: {
          type: 'object',
          required: ['agencyId', 'tenantId'],
          properties: {
            agencyId: { type: 'string', example: 'agency_123' },
            tenantId: { type: 'string', example: 'tenant_456' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              mode: { type: 'string', enum: ['bot_active', 'human_takeover'] }
            }
          }
        },
        security: [{ apiKey: [] }]
      }
    },
    async (request) => {
      const { agencyId, tenantId } = AiAgentStateRequestSchema.parse(request.body);
      const state = await PluginStateModel.findOne({
        agencyId,
        tenantId,
        pluginId: 'ai-sales-agent'
      }).lean().exec();
      return { enabled: state?.enabled ?? false, mode: state?.mode ?? 'bot_active' };
    }
  );

  fastify.put<{ Reply: unknown }>(
    '/ai-sales-agent/state',
    {
      schema: {
        description: 'Update AI Sales Agent state (enabled/mode) for a specific tenant',
        tags: ['AI Sales Agent'],
        body: {
          type: 'object',
          required: ['agencyId', 'tenantId'],
          properties: {
            agencyId: { type: 'string', example: 'agency_123' },
            tenantId: { type: 'string', example: 'tenant_456' },
            enabled: { type: 'boolean' },
            mode: { type: 'string', enum: ['bot_active', 'human_takeover'] }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' }
            }
          }
        },
        security: [{ apiKey: [] }]
      }
    },
    async (request) => {
      const { agencyId, tenantId, enabled, mode } = AiAgentStateUpdateSchema.parse(request.body);
      await PluginStateModel.findOneAndUpdate(
        { agencyId, tenantId, pluginId: 'ai-sales-agent' },
        { agencyId, tenantId, pluginId: 'ai-sales-agent', ...(enabled !== undefined && { enabled }), ...(mode && { mode }) },
        { upsert: true, new: true }
      );
      return { success: true };
    }
  );

  fastify.post<{ Reply: unknown }>(
    '/ai-sales-agent/persona',
    {
      schema: {
        description: 'Get AI Sales Agent persona configuration for a specific tenant',
        tags: ['AI Sales Agent'],
        body: {
          type: 'object',
          required: ['agencyId', 'tenantId'],
          properties: {
            agencyId: { type: 'string', example: 'agency_123' },
            tenantId: { type: 'string', example: 'tenant_456' }
          }
        },
        response: {
          200: {
            type: 'object',
            nullable: true,
            properties: {
              agentName: { type: 'string' },
              modelChoice: { type: 'string' },
              systemPrompt: { type: 'string' },
              fallbackMessage: { type: 'string' },
              temperature: { type: 'number' },
              maxTokens: { type: 'number' },
              active: { type: 'boolean' }
            }
          }
        },
        security: [{ apiKey: [] }]
      }
    },
    async (request, reply) => {
      const { agencyId, tenantId } = AiAgentPersonaRequestSchema.parse(request.body);
      const persona = await AgentPersonaModel.findOne({
        agencyId,
        tenantId,
        pluginId: 'ai-sales-agent'
      }).lean().exec();
      if (!persona) return reply.send(null);
      return {
        agentName: persona.agentName,
        modelChoice: persona.modelChoice,
        systemPrompt: persona.systemPrompt,
        fallbackMessage: persona.fallbackMessage,
        temperature: persona.temperature,
        maxTokens: persona.maxTokens,
        active: persona.active
      };
    }
  );

  fastify.put<{ Reply: unknown }>(
    '/ai-sales-agent/persona',
    {
      schema: {
        description: 'Update AI Sales Agent persona configuration for a specific tenant',
        tags: ['AI Sales Agent'],
        body: {
          type: 'object',
          required: ['agencyId', 'tenantId'],
          properties: {
            agencyId: { type: 'string', example: 'agency_123' },
            tenantId: { type: 'string', example: 'tenant_456' },
            agentName: { type: 'string' },
            modelChoice: { type: 'string' },
            systemPrompt: { type: 'string' },
            fallbackMessage: { type: 'string' },
            temperature: { type: 'number' },
            maxTokens: { type: 'number' },
            active: { type: 'boolean' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' }
            }
          }
        },
        security: [{ apiKey: [] }]
      }
    },
    async (request) => {
      const { agencyId, tenantId, ...updates } = AiAgentPersonaUpdateSchema.parse(request.body);
      await AgentPersonaModel.findOneAndUpdate(
        { agencyId, tenantId, pluginId: 'ai-sales-agent' },
        { agencyId, tenantId, pluginId: 'ai-sales-agent', ...updates },
        { upsert: true, new: true }
      );
      return { success: true };
    }
  );
}
