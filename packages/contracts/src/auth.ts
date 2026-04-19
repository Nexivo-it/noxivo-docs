import { z } from 'zod';

export const UserRoleSchema = z.enum([
  'platform_admin',
  'agency_owner',
  'agency_admin',
  'agency_member',
  'viewer'
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserStatusSchema = z.enum(['active', 'suspended']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const LoginInputSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128)
}).strict();

export type LoginInput = z.infer<typeof LoginInputSchema>;

export const SignupInputSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
  fullName: z.string().min(2).max(120).transform((value) => value.trim()),
  agencyName: z.string().min(2).max(120).transform((value) => value.trim()).optional(),
  invitationToken: z.string().min(1).optional()
}).strict().superRefine((value, ctx) => {
  if (!value.agencyName && !value.invitationToken) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['agencyName'],
      message: 'Agency name is required when invitation token is not provided'
    });
  }
});

export type SignupInput = z.infer<typeof SignupInputSchema>;

export const AgencyMembershipSchema = z.object({
  agencyId: z.string().min(1),
  role: UserRoleSchema,
  customRoleId: z.string().optional()
}).strict();

export type AgencyMembership = z.infer<typeof AgencyMembershipSchema>;

export const SessionUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  fullName: z.string().min(2),
  memberships: z.array(AgencyMembershipSchema).default([]),
  agencyId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  tenantIds: z.array(z.string().min(1)).default([]),
  role: UserRoleSchema.optional(),
  status: UserStatusSchema
}).strict();

export type SessionUser = z.infer<typeof SessionUserSchema>;

export const AuthSessionRecordSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  agencyId: z.string().min(1),
  tenantId: z.string().min(1),
  expiresAt: z.date()
}).strict();

export type AuthSessionRecord = z.infer<typeof AuthSessionRecordSchema>;

export const AuthResponseSchema = z.object({
  user: SessionUserSchema
}).strict();

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const AuthErrorResponseSchema = z.object({
  error: z.string().min(1)
}).strict();

export type AuthErrorResponse = z.infer<typeof AuthErrorResponseSchema>;

export function parseLoginInput(input: unknown): LoginInput {
  return LoginInputSchema.parse(input);
}

export function parseSignupInput(input: unknown): SignupInput {
  return SignupInputSchema.parse(input);
}
