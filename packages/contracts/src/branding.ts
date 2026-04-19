import { z } from 'zod';

export const WhiteLabelConfigSchema = z.object({
  customDomain: z.string().min(1).transform((value) => value.trim().toLowerCase()).nullable().default(null),
  logoUrl: z.string().url().nullable().default(null),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().default(null),
  supportEmail: z.string().email().nullable().default(null),
  hidePlatformBranding: z.boolean().default(false)
}).strict();

export type WhiteLabelConfig = z.infer<typeof WhiteLabelConfigSchema>;

export function parseWhiteLabelConfig(input: unknown): WhiteLabelConfig {
  return WhiteLabelConfigSchema.parse(input ?? {});
}

export function normalizeCustomDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

