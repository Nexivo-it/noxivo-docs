import mongoose from 'mongoose';
import {
  AgencyInvitationModel,
  AgencyModel,
  AuthSessionModel,
  TenantModel,
  UserModel
} from '@noxivo/database';
import {
  parseTeamInvitationCreateInput,
  parseTeamMemberUpdateInput,
  type AgencyInvitationRecord,
  type AgencyTeamRole,
  type TeamMemberRecord
} from '@noxivo/contracts';
import { buildInvitationSignupPath } from '../auth/paths';
import { canManageAgencyTeam, canManageTargetAgency, isPlatformAdmin } from '../auth/authorization';
import { createInvitationExpiryDate, createInvitationToken, hashInvitationToken } from '../auth/invitations';
import type { SessionRecord } from '../auth/session';
import dbConnect from '../mongodb';

interface AgencyTeamResult {
  members: TeamMemberRecord[];
  invitations: AgencyInvitationRecord[];
}

function ensureAgencyIdInput(agencyId: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(agencyId)) {
    throw new Error('Agency not found');
  }

  return new mongoose.Types.ObjectId(agencyId);
}

function ensureUserIdInput(userId: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('User not found');
  }

  return new mongoose.Types.ObjectId(userId);
}

function ensureInvitationIdInput(invitationId: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(invitationId)) {
    throw new Error('Invitation not found');
  }

  return new mongoose.Types.ObjectId(invitationId);
}

function assertAgencyAccess(session: SessionRecord, agencyId: string): void {
  if (!canManageTargetAgency(session, agencyId) && session.actor.agencyId !== agencyId) {
    throw new Error('Forbidden');
  }
}

export function describeTenantAccess(input: {
  role: AgencyTeamRole | 'platform_admin';
  tenantIds: string[];
  tenantNamesById: Map<string, string>;
  totalTenantCount: number;
}): string {
  if (input.role === 'platform_admin') {
    return 'Platform-wide access';
  }

  if (input.role === 'agency_owner' || input.role === 'agency_admin') {
    return input.totalTenantCount === 1 ? 'All tenants' : `All ${input.totalTenantCount} tenants`;
  }

  if (input.tenantIds.length === 0) {
    return 'No tenant access';
  }

  const names = input.tenantIds
    .map((tenantId) => input.tenantNamesById.get(tenantId))
    .filter((tenantName): tenantName is string => Boolean(tenantName));

  if (names.length === 0) {
    return `${input.tenantIds.length} assigned tenant${input.tenantIds.length === 1 ? '' : 's'}`;
  }

  if (names.length <= 2) {
    return names.join(', ');
  }

  return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
}

async function getAgencySlug(agencyId: mongoose.Types.ObjectId): Promise<string> {
  const agency = await AgencyModel.findById(agencyId).select({ slug: 1 }).lean();

  if (!agency) {
    throw new Error('Agency not found');
  }

  return agency.slug;
}

export async function createOrRefreshAgencyInvitation(input: {
  agencyId: string;
  invitedByUserId: string;
  email: string;
  fullName?: string;
  role: AgencyTeamRole;
  tenantIds?: string[];
}): Promise<{ invitation: AgencyInvitationRecord; signupUrl: string }> {
  await dbConnect();

  const agencyObjectId = ensureAgencyIdInput(input.agencyId);
  const tenantIds = (input.tenantIds ?? [])
    .filter((tenantId) => mongoose.Types.ObjectId.isValid(tenantId))
    .map((tenantId) => new mongoose.Types.ObjectId(tenantId));

  const existingUser = await UserModel.findOne({ email: input.email }).select({ agencyId: 1 }).lean();
  if (existingUser) {
    if (existingUser.agencyId?.toString() === input.agencyId) {
      throw new Error('User already belongs to this agency');
    }

    throw new Error('User already belongs to another agency');
  }

  const token = createInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const expiresAt = createInvitationExpiryDate();
  const agencySlug = await getAgencySlug(agencyObjectId);

  const invitation = await AgencyInvitationModel.findOneAndUpdate(
    {
      agencyId: agencyObjectId,
      email: input.email,
      status: 'pending'
    },
    {
      $set: {
        fullName: input.fullName ?? null,
        role: input.role,
        tenantIds,
        invitedByUserId: new mongoose.Types.ObjectId(input.invitedByUserId),
        tokenHash,
        expiresAt,
        lastSentAt: new Date()
      },
      $setOnInsert: {
        agencyId: agencyObjectId,
        email: input.email,
        status: 'pending'
      }
    },
    {
      new: true,
      upsert: true,
      runValidators: true
    }
  ).lean();

  if (!invitation) {
    throw new Error('Failed to persist invitation');
  }

  return {
    invitation: {
      id: invitation._id.toString(),
      agencyId: invitation.agencyId.toString(),
      email: invitation.email,
      fullName: invitation.fullName ?? null,
      role: invitation.role,
      status: invitation.status,
      tenantIds: invitation.tenantIds.map((tenantId) => tenantId.toString()),
      invitedAt: invitation.createdAt.toISOString(),
      expiresAt: invitation.expiresAt.toISOString()
    },
    signupUrl: buildInvitationSignupPath(`/${agencySlug}/auth`, token)
  };
}

export async function listAgencyTeam(session: SessionRecord, agencyId: string): Promise<AgencyTeamResult> {
  await dbConnect();
  assertAgencyAccess(session, agencyId);

  const agencyObjectId = ensureAgencyIdInput(agencyId);
  const [tenants, users, invitations] = await Promise.all([
    TenantModel.find({ agencyId: agencyObjectId }).sort({ name: 1 }).lean(),
    UserModel.find({ agencyId: agencyObjectId, role: { $ne: 'platform_admin' } }).sort({ createdAt: 1 }).lean(),
    AgencyInvitationModel.find({ agencyId: agencyObjectId, status: 'pending' }).sort({ createdAt: -1 }).lean()
  ]);

  const tenantNamesById = new Map(tenants.map((tenant) => [tenant._id.toString(), tenant.name]));
  const totalTenantCount = tenants.length;

  return {
    members: users.map((user) => {
      const role = user.role as AgencyTeamRole;
      const tenantIds = (user.tenantIds || []).map((tenantId) => tenantId.toString());

      return {
        id: user._id.toString(),
        userId: user._id.toString(),
        email: user.email,
        fullName: user.fullName,
        role,
        status: user.status,
        tenantIds,
        defaultTenantId: user.defaultTenantId?.toString() || '',
        createdAt: user.createdAt.toISOString(),
        tenantAccessSummary: describeTenantAccess({
          role,
          tenantIds,
          tenantNamesById,
          totalTenantCount
        })
      };
    }),
    invitations: invitations.map((invitation) => ({
      id: invitation._id.toString(),
      agencyId: invitation.agencyId.toString(),
      email: invitation.email,
      fullName: invitation.fullName ?? null,
      role: invitation.role,
      status: invitation.status,
      tenantIds: invitation.tenantIds.map((tenantId) => tenantId.toString()),
      invitedAt: invitation.createdAt.toISOString(),
      expiresAt: invitation.expiresAt.toISOString()
    }))
  };
}

export async function inviteAgencyTeamMember(
  session: SessionRecord,
  agencyId: string,
  payload: unknown
): Promise<{ invitation: AgencyInvitationRecord; signupUrl: string }> {
  const parsed = parseTeamInvitationCreateInput(payload);

  if (!canManageAgencyTeam(session) || !canManageTargetAgency(session, agencyId)) {
    throw new Error('Forbidden');
  }

  return createOrRefreshAgencyInvitation({
    agencyId,
    invitedByUserId: session.actor.userId,
    email: parsed.email,
    ...(parsed.fullName ? { fullName: parsed.fullName } : {}),
    role: parsed.role,
    tenantIds: parsed.tenantIds
  });
}

async function countAgencyOwners(agencyId: string): Promise<number> {
  return UserModel.countDocuments({ agencyId, role: 'agency_owner', status: 'active' });
}

export async function updateAgencyUser(
  session: SessionRecord,
  agencyId: string,
  userId: string,
  payload: unknown
): Promise<TeamMemberRecord> {
  await dbConnect();

  if (!canManageAgencyTeam(session) || !canManageTargetAgency(session, agencyId)) {
    throw new Error('Forbidden');
  }

  const parsed = parseTeamMemberUpdateInput(payload);
  const userObjectId = ensureUserIdInput(userId);
  const targetUser = await UserModel.findOne({ _id: userObjectId, agencyId });

  if (!targetUser) {
    throw new Error('User not found');
  }

  if (parsed.role === 'agency_owner' && session.actor.role !== 'agency_owner' && !isPlatformAdmin(session)) {
    throw new Error('Forbidden');
  }

  const nextRole = (parsed.role ?? targetUser.role) as AgencyTeamRole;
  const nextStatus = parsed.status ?? targetUser.status;
  const nextTenantIds = parsed.tenantIds
    ? parsed.tenantIds
        .filter((tenantId) => mongoose.Types.ObjectId.isValid(tenantId))
        .map((tenantId) => new mongoose.Types.ObjectId(tenantId))
    : targetUser.tenantIds;
  const nextDefaultTenantId = parsed.defaultTenantId
    ? new mongoose.Types.ObjectId(parsed.defaultTenantId)
    : targetUser.defaultTenantId;

  if ((targetUser.role === 'agency_owner' && nextRole !== 'agency_owner') || (targetUser.role === 'agency_owner' && nextStatus !== 'active')) {
    const ownerCount = await countAgencyOwners(agencyId);

    if (ownerCount <= 1 && !isPlatformAdmin(session)) {
      throw new Error('Cannot modify the last agency owner');
    }
  }

  if (targetUser._id.toString() === session.actor.userId && targetUser.role === 'agency_owner' && nextRole !== 'agency_owner') {
    const ownerCount = await countAgencyOwners(agencyId);

    if (ownerCount <= 1 && !isPlatformAdmin(session)) {
      throw new Error('Cannot demote the last agency owner');
    }
  }

  targetUser.role = nextRole;
  targetUser.status = nextStatus;
  targetUser.tenantIds = nextTenantIds;
  const defaultId = nextTenantIds.find((id) => id.equals(nextDefaultTenantId))
    || nextTenantIds[0]
    || targetUser.defaultTenantId;

  if (defaultId) {
    targetUser.defaultTenantId = defaultId;
  }
  await targetUser.save();

  const tenants = await TenantModel.find({ agencyId }).select({ _id: 1, name: 1 }).lean();
  const tenantNamesById = new Map(tenants.map((tenant) => [tenant._id.toString(), tenant.name]));
  const targetRole = targetUser.role as AgencyTeamRole;
  const targetTenantIds = targetUser.tenantIds.map((tenantId) => tenantId.toString());

  return {
    id: targetUser._id.toString(),
    userId: targetUser._id.toString(),
    email: targetUser.email,
    fullName: targetUser.fullName,
    role: targetRole,
    status: targetUser.status,
    tenantIds: targetTenantIds,
    defaultTenantId: targetUser.defaultTenantId?.toString() || '',
    createdAt: targetUser.createdAt.toISOString(),
    tenantAccessSummary: describeTenantAccess({
      role: targetRole,
      tenantIds: targetTenantIds,
      tenantNamesById,
      totalTenantCount: tenants.length
    })
  };
}

export async function removeAgencyUser(session: SessionRecord, agencyId: string, userId: string): Promise<void> {
  await dbConnect();

  if (!canManageAgencyTeam(session) || !canManageTargetAgency(session, agencyId)) {
    throw new Error('Forbidden');
  }

  const userObjectId = ensureUserIdInput(userId);
  const targetUser = await UserModel.findOne({ _id: userObjectId, agencyId });

  if (!targetUser) {
    throw new Error('User not found');
  }

  if (targetUser.role === 'agency_owner') {
    const ownerCount = await countAgencyOwners(agencyId);

    if (ownerCount <= 1 && !isPlatformAdmin(session)) {
      throw new Error('Cannot remove the last agency owner');
    }
  }

  await Promise.all([
    AuthSessionModel.deleteMany({ userId: userObjectId }).exec(),
    UserModel.deleteOne({ _id: userObjectId }).exec()
  ]);
}

export async function revokeAgencyInvitation(session: SessionRecord, agencyId: string, invitationId: string): Promise<void> {
  await dbConnect();

  if (!canManageAgencyTeam(session) || !canManageTargetAgency(session, agencyId)) {
    throw new Error('Forbidden');
  }

  const invitationObjectId = ensureInvitationIdInput(invitationId);
  const invitation = await AgencyInvitationModel.findOne({ _id: invitationObjectId, agencyId });

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  invitation.status = 'revoked';
  invitation.revokedAt = new Date();
  await invitation.save();
}

export async function updateAgencyInvitation(
  session: SessionRecord,
  agencyId: string,
  invitationId: string,
  payload: unknown
): Promise<{ invitation: AgencyInvitationRecord; signupUrl: string }> {
  await dbConnect();

  if (!canManageAgencyTeam(session) || !canManageTargetAgency(session, agencyId)) {
    throw new Error('Forbidden');
  }

  const parsed = parseTeamInvitationCreateInput(payload);
  const invitationObjectId = ensureInvitationIdInput(invitationId);
  const invitation = await AgencyInvitationModel.findOne({ _id: invitationObjectId, agencyId, status: 'pending' }).lean();

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  return createOrRefreshAgencyInvitation({
    agencyId,
    invitedByUserId: session.actor.userId,
    email: parsed.email,
    ...(parsed.fullName ? { fullName: parsed.fullName } : {}),
    role: parsed.role,
    tenantIds: parsed.tenantIds
  });
}
