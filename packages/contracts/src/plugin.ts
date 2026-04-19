import { z } from 'zod';

export const PluginCategorySchema = z.enum(['crm', 'booking', 'payments', 'messaging', 'ai', 'custom']);

export const PluginManifestSchema = z.object({
  id: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  displayName: z.string().min(1),
  configSchema: z.record(z.string(), z.unknown()),
  actionSchema: z.record(z.string(), z.unknown()),
  category: PluginCategorySchema
}).strict();

export const PluginExecutionResultSchema = z.object({
  success: z.boolean(),
  output: z.unknown(),
  error: z.string().nullable().default(null),
  executedAt: z.string().datetime()
}).strict();

export type PluginCategory = z.infer<typeof PluginCategorySchema>;
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
export type PluginExecutionResult = z.infer<typeof PluginExecutionResultSchema>;

export type PluginValidationSchema = z.ZodType<unknown>;

export const AirtableCredentialSchema = z.object({
  apiKey: z.string().min(1),
}).strict();

export const GoogleSheetsCredentialSchema = z.object({
  clientEmail: z.string().email(),
  privateKey: z.string().min(1),
}).strict();

export const ShopifyCredentialSchema = z.object({
  accessToken: z.string().min(1),
}).strict();

export const WooCommerceCredentialSchema = z.object({
  consumerKey: z.string().min(1),
  consumerSecret: z.string().min(1),
}).strict();

export interface PluginExecutionContext {
  agencyId: string;
  tenantId: string;
  config: unknown;
  payload: unknown;
}

export interface PluginDefinition {
  manifest: PluginManifest;
  configParser: PluginValidationSchema;
  payloadParser: PluginValidationSchema;
  execute(context: PluginExecutionContext): Promise<PluginExecutionResult>;
}

export function parsePluginManifest(input: unknown): PluginManifest {
  return PluginManifestSchema.parse(input);
}

export function parsePluginExecutionResult(input: unknown): PluginExecutionResult {
  return PluginExecutionResultSchema.parse(input);
}
