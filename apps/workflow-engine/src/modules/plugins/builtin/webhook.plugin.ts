import { z } from 'zod';
import {
  parsePluginManifest,
  type PluginDefinition,
  type PluginManifest
} from '@noxivo/contracts';

const WebhookConfigSchema = z.object({
  url: z.string().url().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
  headers: z.record(z.string(), z.string()).optional(),
}).strict();

const WebhookPayloadSchema = z.object({
  url: z.string().url().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
}).strict();

export function createWebhookPlugin(): PluginDefinition {
  const manifest: PluginManifest = parsePluginManifest({
    id: 'webhook',
    version: '1.0.0',
    displayName: 'Outgoing Webhook',
    category: 'custom',
    configSchema: {
      url: { type: 'string', format: 'url' },
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      headers: { type: 'object' }
    },
    actionSchema: {
      execute: { body: 'any' }
    }
  });

  return {
    manifest,
    configParser: WebhookConfigSchema,
    payloadParser: WebhookPayloadSchema,
    async execute(context) {
      const config = WebhookConfigSchema.parse(context.config);
      const payload = WebhookPayloadSchema.parse(context.payload);

      const url = payload.url || config.url;
      const method = payload.method || config.method;
      const headers = { ...config.headers, ...payload.headers };

      if (!url) {
        return {
          success: false,
          output: null,
          error: 'Webhook URL is missing',
          executedAt: new Date().toISOString()
        };
      }

      try {
        const fetchOptions: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers
          }
        };

        if (method !== 'GET') {
          fetchOptions.body = JSON.stringify(payload.body || context.payload);
        }

        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
          const errorText = await response.text();
          return {
            success: false,
            output: null,
            error: `Webhook failed: ${response.status} - ${errorText}`,
            executedAt: new Date().toISOString()
          };
        }

        const contentType = response.headers.get('content-type');
        let output: unknown;
        if (contentType && contentType.includes('application/json')) {
          output = await response.json();
        } else {
          output = await response.text();
        }

        return {
          success: true,
          output,
          error: null,
          executedAt: new Date().toISOString()
        };

      } catch (error) {
        return {
          success: false,
          output: null,
          error: error instanceof Error ? error.message : 'Unknown Webhook error',
          executedAt: new Date().toISOString()
        };
      }
    }
  };
}
