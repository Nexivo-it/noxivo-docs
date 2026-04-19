import { z } from 'zod';
import {
  parsePluginManifest,
  type PluginDefinition,
  type PluginManifest,
  AirtableCredentialSchema
} from '@noxivo/contracts';
import { TenantCredentialModel } from '@noxivo/database';

const AirtableConfigSchema = z.object({
  baseId: z.string().min(1),
  tableId: z.string().min(1),
}).strict();

const AirtablePayloadSchema = z.object({
  action: z.enum(['createRecord', 'updateRecord', 'lookupRecord']),
  fields: z.record(z.string(), z.unknown()).optional(),
  recordId: z.string().optional(),
  filterByFormula: z.string().optional(),
}).strict();

export function createAirtablePlugin(): PluginDefinition {
  const manifest: PluginManifest = parsePluginManifest({
    id: 'airtable',
    version: '1.0.0',
    displayName: 'Airtable',
    category: 'crm',
    configSchema: {
      baseId: { type: 'string', minLength: 1 },
      tableId: { type: 'string', minLength: 1 }
    },
    actionSchema: {
      createRecord: { fields: 'object' },
      updateRecord: { recordId: 'string', fields: 'object' },
      lookupRecord: { filterByFormula: 'string' }
    }
  });

  return {
    manifest,
    configParser: AirtableConfigSchema,
    payloadParser: AirtablePayloadSchema,
    async execute(context) {
      const config = AirtableConfigSchema.parse(context.config);
      const payload = AirtablePayloadSchema.parse(context.payload);

      // 1. Retrieve Credential
      const credential = await TenantCredentialModel.findOne({
        tenantId: context.tenantId,
        provider: 'airtable'
      }).lean().exec();

      if (!credential) {
        return {
          success: false,
          output: null,
          error: 'Airtable credentials not found for this tenant',
          executedAt: new Date().toISOString()
        };
      }

      // In a real implementation, we would decrypt here.
      // For this implementation, we assume stored as JSON string.
      const auth = AirtableCredentialSchema.parse(JSON.parse(credential.encryptedData));

      // 2. Execute Action
      try {
        const baseUrl = `https://api.airtable.com/v0/${config.baseId}/${config.tableId}`;
        let response: Response;

        if (payload.action === 'createRecord') {
          response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${auth.apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fields: payload.fields || {} })
          });
        } else if (payload.action === 'updateRecord') {
          if (!payload.recordId) throw new Error('recordId is required for updateRecord');
          response = await fetch(`${baseUrl}/${payload.recordId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${auth.apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fields: payload.fields || {} })
          });
        } else {
          // lookupRecord
          const query = new URLSearchParams();
          if (payload.filterByFormula) query.append('filterByFormula', payload.filterByFormula);
          query.append('maxRecords', '1');
          
          response = await fetch(`${baseUrl}?${query.toString()}`, {
            headers: { 'Authorization': `Bearer ${auth.apiKey}` }
          });
        }

        if (!response.ok) {
          const errorText = await response.text();
          return {
            success: false,
            output: null,
            error: `Airtable API error: ${response.status} - ${errorText}`,
            executedAt: new Date().toISOString()
          };
        }

        const data = await response.json();
        
        // Flatten output for DAG readability
        const output = payload.action === 'lookupRecord' 
          ? (data.records?.[0] ? { id: data.records[0].id, ...data.records[0].fields } : null)
          : { id: data.id, ...data.fields };

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
          error: error instanceof Error ? error.message : 'Unknown Airtable error',
          executedAt: new Date().toISOString()
        };
      }
    }
  };
}
