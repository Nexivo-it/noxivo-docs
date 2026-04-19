import { z } from 'zod';

export const SpaRoleSchema = z.enum(['member', 'admin']);
export const SpaStatusSchema = z.enum(['active', 'suspended']);

export const SpaSignupInputSchema = z.object({
  agencyId: z.string().min(1),
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
  fullName: z.string().min(2).max(120).transform((value) => value.trim()),
  phone: z.string().trim().max(40).optional(),
}).strict();

export const SpaLoginInputSchema = z.object({
  agencyId: z.string().min(1),
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
}).strict();

export const SpaSessionUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  fullName: z.string().min(2),
  role: SpaRoleSchema,
  status: SpaStatusSchema,
}).strict();

export const SpaAuthResponseSchema = z.object({
  user: SpaSessionUserSchema,
}).strict();

export const SpaBookingCreateInputSchema = z.object({
  agencyId: z.string().min(1),
  customerName: z.string().min(2).max(120).transform((value) => value.trim()),
  customerEmail: z.string().email().transform((value) => value.trim().toLowerCase()).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  appointmentDateIso: z.string().min(1),
  appointmentDateLabel: z.string().min(1),
  appointmentTime: z.string().min(1),
  serviceIds: z.array(z.string().min(1)).min(1),
  notes: z.string().max(1000).optional(),
}).strict();

export const SpaAdminServiceInputSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(2).max(160).transform((value) => value.trim()),
  slug: z.string().min(2).max(160).transform((value) => value.trim().toLowerCase()),
  description: z.string().max(2000).default(''),
  price: z.number().min(0),
  duration: z.string().max(120).default(''),
  imageRef: z.string().max(500).optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  kind: z.enum(['service', 'product']).default('service'),
}).strict();

export const SpaMediaStorageConfigSchema = z.object({
  provider: SpaMediaProviderSchema,
  isActive: z.boolean().default(true),
  publicBaseUrl: z.string().url(),
  publicConfig: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  secretConfig: z.record(z.string()).default({}),
  pathPrefix: z.string().max(200).default(''),
}).strict();

export const SpaSiteSettingsInputSchema = z.object({
  salonName: z.string().min(2).max(160).transform((value) => value.trim()),
  tagline: z.string().max(200).default(''),
  phone: z.string().max(40).default(''),
  whatsapp: z.string().max(40).optional(),
  email: z.string().email().or(z.literal('')).default(''),
  address: z.string().max(300).default(''),
  hours: z.array(z.record(z.string())).optional(),
  googleMapsUrl: z.string().max(1000).optional(),
  googleMapsEmbed: z.string().max(2000).optional(),
  socialLinks: z.record(z.string()).optional(),
  metaDescription: z.string().max(300).optional(),
}).strict();

export const SpaGalleryImageInputSchema = z.object({
  url: z.string().min(1),
  alt: z.string().max(300).default(''),
  category: z.string().max(120).default('General'),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
}).strict();

export const SpaAiConciergeConfigInputSchema = z.object({
  personaName: z.string().min(2).max(120).transform((value) => value.trim()),
  openingMessage: z.string().max(1000).default(''),
  systemPrompt: z.string().max(8000).default(''),
  model: z.string().min(1).max(120),
  temperature: z.number().min(0).max(2),
  webhookUrl: z.string().url().or(z.literal('')).default(''),
  suggestedPrompts: z.array(z.string().max(300)).default([]),
  active: z.boolean().default(true),
}).strict();

export const SpaWebhookEventSchema = z.enum([
  'booking.created',
  'booking.updated',
  'booking.cancelled',
  'customer.created',
  'customer.updated',
  'service.created',
  'service.updated',
  'inventory.low',
]);

export const SpaWebhookInputSchema = z.object({
  name: z.string().min(2).max(120).transform((value) => value.trim()),
  url: z.string().url(),
  events: z.array(SpaWebhookEventSchema).min(1),
  secret: z.string().max(200).default(''),
  isActive: z.boolean().default(true),
}).strict();

export const SpaWebhookUpdateSchema = z.object({
  name: z.string().min(2).max(120).transform((value) => value.trim()),
  url: z.string().url(),
  events: z.array(SpaWebhookEventSchema).min(1),
  secret: z.string().max(200).default(''),
  isActive: z.boolean().default(true),
}).strict();

export type SpaWebhookInput = z.infer<typeof SpaWebhookInputSchema>;
export type SpaWebhookUpdate = z.infer<typeof SpaWebhookUpdateSchema>;
export type SpaWebhookEvent = z.infer<typeof SpaWebhookEventSchema>;

export type SpaSignupInput = z.infer<typeof SpaSignupInputSchema>;
export type SpaLoginInput = z.infer<typeof SpaLoginInputSchema>;
export type SpaSessionUser = z.infer<typeof SpaSessionUserSchema>;
export type SpaBookingCreateInput = z.infer<typeof SpaBookingCreateInputSchema>;
export type SpaAdminServiceInput = z.infer<typeof SpaAdminServiceInputSchema>;
