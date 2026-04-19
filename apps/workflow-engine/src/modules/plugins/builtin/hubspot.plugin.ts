import { z } from 'zod';
import {
  parsePluginManifest,
  type PluginDefinition,
  type PluginManifest
} from '@noxivo/contracts';
import { TenantCredentialModel } from '@noxivo/database';

const HubSpotConfigSchema = z.object({
  accessToken: z.string().optional(), // Can be provided in config or resolved from credentials
}).strict();

const HubSpotPayloadSchema = z.object({
  action: z.enum(['createContact', 'updateContact', 'getContact', 'searchContact']),
  email: z.string().email().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  contactId: z.string().optional(),
  query: z.string().optional(),
}).strict();

export function createHubSpotPlugin(): PluginDefinition {
  const manifest: PluginManifest = parsePluginManifest({
    id: 'hubspot',
    version: '1.0.0',
    displayName: 'HubSpot CRM',
    category: 'crm',
    configSchema: {
      accessToken: { type: 'string' }
    },
    actionSchema: {
      createContact: { email: 'string', properties: 'object' },
      updateContact: { contactId: 'string', properties: 'object' },
      getContact: { contactId: 'string' },
      searchContact: { query: 'string' }
    }
  });

  return {
    manifest,
    configParser: HubSpotConfigSchema,
    payloadParser: HubSpotPayloadSchema,
    async execute(context) {
      const config = HubSpotConfigSchema.parse(context.config);
      const payload = HubSpotPayloadSchema.parse(context.payload);

      // 1. Resolve Access Token
      let accessToken = config.accessToken;
      if (!accessToken) {
        const credential = await TenantCredentialModel.findOne({
          tenantId: context.tenantId,
          provider: 'hubspot'
        }).lean().exec();

        if (credential) {
          try {
            const auth = JSON.parse(credential.encryptedData);
            accessToken = auth.accessToken || auth.apiKey;
          } catch (e) {
            // ignore
          }
        }
      }

      if (!accessToken) {
        return {
          success: false,
          output: null,
          error: 'HubSpot access token not found',
          executedAt: new Date().toISOString()
        };
      }

      // 2. Execute Action
      try {
        const baseUrl = 'https://api.hubapi.com/crm/v3/objects/contacts';
        let url = baseUrl;
        let method = 'GET';
        let body: any = null;

        if (payload.action === 'createContact') {
          method = 'POST';
          body = { properties: { email: payload.email, ...payload.properties } };
        } else if (payload.action === 'updateContact') {
          if (!payload.contactId) throw new Error('contactId is required for updateContact');
          url = `${baseUrl}/${payload.contactId}`;
          method = 'PATCH';
          body = { properties: payload.properties };
        } else if (payload.action === 'getContact') {
          if (!payload.contactId) throw new Error('contactId is required for getContact');
          url = `${baseUrl}/${payload.contactId}`;
          method = 'GET';
        } else if (payload.action === 'searchContact') {
          url = `${baseUrl}/search`;
          method = 'POST';
          body = {
            filterGroups: [
              {
                filters: [
                  {
                    propertyName: 'email',
                    operator: 'EQ',
                    value: payload.email || payload.query
                  }
                ]
              }
            ]
          };
        }

        const fetchOptions: RequestInit = {
          method,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        };

        if (body) {
          fetchOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
          const errorText = await response.text();
          return {
            success: false,
            output: null,
            error: `HubSpot API error: ${response.status} - ${errorText}`,
            executedAt: new Date().toISOString()
          };
        }

        const data = await response.json();
        
        // Flatten output
        const output = payload.action === 'searchContact'
          ? (data.results?.[0] || null)
          : data;

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
          error: error instanceof Error ? error.message : 'Unknown HubSpot error',
          executedAt: new Date().toISOString()
        };
      }
    }
  };
}
