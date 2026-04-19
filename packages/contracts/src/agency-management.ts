import { z } from 'zod';
import { WhiteLabelConfigSchema } from './branding.js';

export const AgencyPlanSchema = z.enum(['reseller_basic', 'reseller_pro', 'enterprise']);
export type AgencyPlan = z.infer<typeof AgencyPlanSchema>;

export const AgencyStatusSchema = z.enum(['trial', 'active', 'suspended', 'cancelled']);
export type AgencyStatus = z.infer<typeof AgencyStatusSchema>;

export const AgencyTeamRoleSchema = z.enum(['agency_owner', 'agency_admin', 'agency_member', 'viewer']);
export type AgencyTeamRole = z.infer<typeof AgencyTeamRoleSchema>;

export const AgencyInvitationStatusSchema = z.enum(['pending', 'accepted', 'expired', 'revoked']);
export type AgencyInvitationStatus = z.infer<typeof AgencyInvitationStatusSchema>;

export const AgencyCreateInputSchema = z.object({
  name: z.string().min(2).max(120).transform((value) => value.trim()),
  slug: z.string().min(3).max(48).regex(/^[a-z0-9-]+$/).transform((value) => value.trim().toLowerCase()),
  customDomain: z.string().min(1).optional().nullable(),
  supportEmail: z.string().email().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  plan: AgencyPlanSchema,
  ownerEmail: z.string().email().optional(),
  ownerFullName: z.string().min(2).max(120).transform((value) => value.trim()).optional()
}).strict();
export type AgencyCreateInput = z.infer<typeof AgencyCreateInputSchema>;

export const AgencyUpdateInputSchema = z.object({
  name: z.string().min(2).max(120).transform((value) => value.trim()).optional(),
  customDomain: z.string().min(1).optional().nullable(),
  supportEmail: z.string().email().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  hidePlatformBranding: z.boolean().optional(),
  status: AgencyStatusSchema.optional(),
  plan: AgencyPlanSchema.optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one agency field must be provided'
});
export type AgencyUpdateInput = z.infer<typeof AgencyUpdateInputSchema>;

export const TenantCreateInputSchema = z.object({
  slug: z.string().min(3).max(48).regex(/^[a-z0-9-]+$/).transform((value) => value.trim().toLowerCase()),
  name: z.string().min(2).max(120).transform((value) => value.trim()),
  region: z.enum(['eu-west-1', 'me-central-1', 'us-east-1']),
  billingMode: z.enum(['agency_pays', 'tenant_pays']),
  whiteLabelOverrides: WhiteLabelConfigSchema.partial().optional().default({})
}).strict();
export type TenantCreateInput = z.infer<typeof TenantCreateInputSchema>;

export const TeamInvitationCreateInputSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  fullName: z.string().min(2).max(120).transform((value) => value.trim()).optional(),
  role: AgencyTeamRoleSchema.exclude(['agency_owner']),
  tenantIds: z.array(z.string().min(1)).optional().default([])
}).strict();
export type TeamInvitationCreateInput = z.infer<typeof TeamInvitationCreateInputSchema>;

export const TeamMemberUpdateInputSchema = z.object({
  role: AgencyTeamRoleSchema.optional(),
  status: z.enum(['active', 'suspended']).optional(),
  tenantIds: z.array(z.string().min(1)).optional(),
  defaultTenantId: z.string().min(1).optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one team field must be provided'
});
export type TeamMemberUpdateInput = z.infer<typeof TeamMemberUpdateInputSchema>;

export const AgencySummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2),
  slug: z.string().min(3),
  customDomain: z.string().nullable(),
  supportEmail: z.string().email().nullable(),
  primaryColor: z.string().nullable(),
  plan: AgencyPlanSchema,
  status: AgencyStatusSchema,
  tenantCount: z.number().int().nonnegative(),
  teamCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime()
}).strict();
export type AgencySummary = z.infer<typeof AgencySummarySchema>;

export const AgencyInvitationRecordSchema = z.object({
  id: z.string().min(1),
  agencyId: z.string().min(1),
  email: z.string().email(),
  fullName: z.string().nullable(),
  role: AgencyTeamRoleSchema,
  status: AgencyInvitationStatusSchema,
  tenantIds: z.array(z.string().min(1)),
  invitedAt: z.string().datetime(),
  expiresAt: z.string().datetime()
}).strict();
export type AgencyInvitationRecord = z.infer<typeof AgencyInvitationRecordSchema>;

export const TeamMemberRecordSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  email: z.string().email(),
  fullName: z.string().min(2),
  role: AgencyTeamRoleSchema,
  status: z.enum(['active', 'suspended']),
  tenantIds: z.array(z.string().min(1)),
  defaultTenantId: z.string().min(1),
  createdAt: z.string().datetime(),
  tenantAccessSummary: z.string().min(1)
}).strict();
export type TeamMemberRecord = z.infer<typeof TeamMemberRecordSchema>;

export function parseAgencyCreateInput(input: unknown): AgencyCreateInput {
  return AgencyCreateInputSchema.parse(input);
}

export function parseAgencyUpdateInput(input: unknown): AgencyUpdateInput {
  return AgencyUpdateInputSchema.parse(input);
}

export function parseTenantCreateInput(input: unknown): TenantCreateInput {
  return TenantCreateInputSchema.parse(input);
}

export function parseTeamInvitationCreateInput(input: unknown): TeamInvitationCreateInput {
  return TeamInvitationCreateInputSchema.parse(input);
}

export function parseTeamMemberUpdateInput(input: unknown): TeamMemberUpdateInput {
  return TeamMemberUpdateInputSchema.parse(input);
}
