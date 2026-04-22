import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import {
  AgencyInvitationModel,
  AgencyModel,
  TenantModel,
  UserModel,
  hashPassword,
  mapScopeRoleToLegacyRole,
  normalizeStoredUserRole,
  verifyPassword,
  type User,
} from '@noxivo/database';
import {
  parseWhiteLabelConfig,
  parseLoginInput,
  parseSignupInput,
} from '@noxivo/contracts';
import { dbConnect } from '../../lib/mongodb.js';

export interface AuthenticatedUser {
  id: string;
  agencyId: string;
  tenantId: string;
  tenantIds: string[];
  email: string;
  fullName: string;
  role: 'platform_admin' | 'agency_owner' | 'agency_admin' | 'agency_member' | 'viewer';
  status: 'active' | 'suspended';
}

export interface AgencyBrandingPayload {
  agencyId: string;
  agencyName: string;
  agencySlug: string;
  branding: ReturnType<typeof parseWhiteLabelConfig>;
}

function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function mapAuthenticatedUser(user: User & { _id: mongoose.Types.ObjectId }): AuthenticatedUser {
  const scopeRole = normalizeStoredUserRole(user.role);
  const mappedRole = user.role === 'agency_owner'
    ? 'agency_owner'
    : mapScopeRoleToLegacyRole(scopeRole);
  const tenantIds = (user.tenantIds ?? []).map((tenantId) => tenantId.toString());
  let tenantId = user.defaultTenantId?.toString() ?? tenantIds[0];

  if (!tenantId && user.memberships && user.memberships.length > 0) {
    const membership = user.memberships[0];
    tenantId = membership?.defaultTenantId?.toString() ?? membership?.tenantIds?.[0]?.toString();
  }

  const agencyId = user.agencyId?.toString() ?? user.memberships?.[0]?.agencyId?.toString() ?? '';

  return {
    id: user._id.toString(),
    agencyId,
    tenantId: tenantId ?? '',
    tenantIds,
    email: user.email,
    fullName: user.fullName,
    role: mappedRole,
    status: user.status,
  };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function createUniqueAgencySlug(name: string): Promise<string> {
  const baseSlug = slugify(name) || 'agency';

  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`;
    const existing = await AgencyModel.findOne({ slug: candidate }).select({ _id: 1 }).lean();
    if (!existing) {
      return candidate;
    }
  }

  throw new Error('Unable to allocate a unique agency slug');
}

export async function signupWithAgency(input: unknown): Promise<AuthenticatedUser> {
  await dbConnect();
  const parsed = parseSignupInput(input);

  const existingUser = await UserModel.findOne({ email: parsed.email }).select({ _id: 1 }).lean();
  if (existingUser) {
    throw new Error('An account with this email already exists');
  }

  if (parsed.invitationToken) {
    const invitation = await AgencyInvitationModel.findOne({
      tokenHash: hashInvitationToken(parsed.invitationToken),
      status: 'pending',
      expiresAt: { $gt: new Date() },
    });

    if (!invitation) {
      throw new Error('Invitation is invalid or expired');
    }

    if (invitation.email !== parsed.email) {
      throw new Error('Invitation email does not match the signup email');
    }

    const defaultTenantId = invitation.tenantIds[0]
      ?? await TenantModel.findOne({ agencyId: invitation.agencyId })
        .sort({ createdAt: 1 })
        .select({ _id: 1 })
        .then((tenant) => tenant?._id ?? null);

    if (!defaultTenantId) {
      throw new Error('Invited agency has no available tenant access');
    }

    let createdUserId: mongoose.Types.ObjectId | null = null;

    try {
      const passwordHash = await hashPassword(parsed.password);
      const user = await UserModel.create({
        agencyId: invitation.agencyId,
        defaultTenantId,
        tenantIds: invitation.tenantIds.length > 0 ? invitation.tenantIds : [defaultTenantId],
        email: parsed.email,
        fullName: parsed.fullName,
        passwordHash,
        role: invitation.role,
        status: 'active',
        lastLoginAt: new Date(),
      });
      createdUserId = user._id;

      invitation.status = 'accepted';
      invitation.acceptedAt = new Date();
      await invitation.save();

      return mapAuthenticatedUser(user);
    } catch (error) {
      if (createdUserId) {
        await UserModel.deleteOne({ _id: createdUserId }).exec();
      }
      throw error;
    }
  }

  if (!parsed.agencyName) {
    throw new Error('Agency name is required');
  }

  const agencyId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const agencySlug = await createUniqueAgencySlug(parsed.agencyName);
  const tenantSlug = `${agencySlug}-main`;
  const passwordHash = await hashPassword(parsed.password);

  try {
    await AgencyModel.create({
      _id: agencyId,
      name: parsed.agencyName,
      slug: agencySlug,
      plan: 'reseller_basic',
      billingStripeCustomerId: null,
      billingStripeSubscriptionId: null,
      billingOwnerUserId: userId,
      whiteLabelDefaults: {
        customDomain: null,
        logoUrl: null,
        primaryColor: null,
        supportEmail: parsed.email,
        hidePlatformBranding: false,
      },
      usageLimits: {
        tenants: 5,
        activeSessions: 25,
      },
      status: 'trial',
    });

    await TenantModel.create({
      _id: tenantId,
      agencyId,
      slug: tenantSlug,
      name: `${parsed.agencyName} Workspace`,
      region: 'us-east-1',
      status: 'trial',
      billingMode: 'agency_pays',
      whiteLabelOverrides: {},
      effectiveBrandingCache: {
        customDomain: null,
        logoUrl: null,
        primaryColor: null,
        supportEmail: parsed.email,
        hidePlatformBranding: false,
      },
    });

    const user = await UserModel.create({
      _id: userId,
      agencyId,
      defaultTenantId: tenantId,
      tenantIds: [tenantId],
      email: parsed.email,
      fullName: parsed.fullName,
      passwordHash,
      role: 'agency_owner',
      status: 'active',
      lastLoginAt: new Date(),
    });

    return mapAuthenticatedUser(user);
  } catch (error) {
    await UserModel.deleteOne({ _id: userId }).exec();
    await TenantModel.deleteOne({ _id: tenantId }).exec();
    await AgencyModel.deleteOne({ _id: agencyId }).exec();
    throw error;
  }
}

export async function authenticateUser(input: unknown): Promise<AuthenticatedUser> {
  await dbConnect();
  const parsed = parseLoginInput(input);

  const user = await UserModel.findOne({ email: parsed.email });

  if (!user || user.status !== 'active') {
    throw new Error('Invalid email or password');
  }

  const isValidPassword = await verifyPassword(parsed.password, user.passwordHash);
  if (!isValidPassword) {
    throw new Error('Invalid email or password');
  }

  const authUser = mapAuthenticatedUser(user);

  if (!authUser.tenantId && authUser.agencyId) {
    const fallbackTenant = await TenantModel.findOne({ agencyId: authUser.agencyId }).lean();
    if (fallbackTenant) {
      authUser.tenantId = fallbackTenant._id.toString();
      if (!authUser.tenantIds.includes(authUser.tenantId)) {
        authUser.tenantIds.push(authUser.tenantId);
      }
    }
  }

  if (!authUser.tenantId) {
    throw new Error('No workspace assigned. Please contact your administrator.');
  }

  return authUser;
}

export async function getAgencyBrandingBySlug(agencySlug: string): Promise<AgencyBrandingPayload | null> {
  await dbConnect();
  const normalizedSlug = agencySlug.trim().toLowerCase();

  if (!normalizedSlug) {
    return null;
  }

  const agency = await AgencyModel.findOne({ slug: normalizedSlug }).lean();

  if (!agency) {
    return null;
  }

  return {
    agencyId: agency._id.toString(),
    agencyName: agency.name,
    agencySlug: agency.slug,
    branding: parseWhiteLabelConfig(agency.whiteLabelDefaults),
  };
}
