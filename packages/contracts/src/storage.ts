import { z } from 'zod';

export const MediaProviderSchema = z.enum(['s3', 'google_drive', 'imagekit', 'cloudinary', 'bunny', 'cloudflare_r2', 'local']);

export const MediaStorageConfigSchema = z.object({
  provider: MediaProviderSchema,
  isActive: z.boolean().default(true),
  publicBaseUrl: z.string().url(),
  publicConfig: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  secretConfig: z.record(z.string()).default({}),
  pathPrefix: z.string().max(200).default(''),
}).strict();

export type MediaStorageConfigInput = z.infer<typeof MediaStorageConfigSchema>;
