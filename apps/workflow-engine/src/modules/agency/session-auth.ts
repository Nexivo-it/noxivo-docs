import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import {
  AgencyModel,
  AuthSessionModel,
  TenantModel,
  UserModel,
  mapScopeRoleToLegacyRole,
  normalizeStoredUserRole,
  type ScopeRole,
  type SupportedUserRole,
} from '@noxivo/database';
import { dbConnect } from '../../lib/mongodb.js';

const AUTH_SESSION_COOKIE_NAME = 'noxivo_session';
const AGENCY_CONTEXT_HEADER = 'x-agency-context';
const TENANT_CONTEXT_HEADER = 'x-tenant-context';
const AGENCY_CONTEXT_COOKIE = 'nf_agency_context';
const TENANT_CONTEXT_COOKIE = 'nf_tenant_context';

type LegacyRole = 'platform_admin' | 'agency_owner' | 'agency_admin' | 'agency_member' | 'viewer';
type SessionMembershipRole = SupportedUserRole;

type IdLike = { toString(): string };

interface RawMembership {
  agencyId: IdLike | string;
  role: SessionMembershipRole | string;
  scopeRole?: ScopeRole | string;
  tenantIds?: Array<IdLike | string>;
  defaultTenantId?: IdLike | string;
  customRoleId?: IdLike | string;
}

interface UserWithSessionFields {
  _id: IdLike;
  email: string;
  fullName: string;
  role: SupportedUserRole | string;
  status: 'active' | 'suspended';
  agencyId?: IdLike | string;
  defaultTenantId?: IdLike | string;
  tenantIds?: Array<IdLike | string>;
  memberships?: RawMembership[];
}

interface ResolvedMembership {
  agencyId: string;
  role: SessionMembershipRole;
  scopeRole: ScopeRole;
  tenantIds: string[];
  defaultTenantId: string | null;
  customRoleId?: string;
}

export interface SessionMembership {
  agencyId: string;
  role: SessionMembershipRole;
  scopeRole?: ScopeRole;
  tenantIds: string[];
  defaultTenantId?: string | null;
  customRoleId?: string;
}

export interface SessionActor {
  userId: string;
  agencyId: string;
  tenantId: string;
  tenantIds: string[];
  email: string;
  fullName: string;
  role: LegacyRole;
  scopeRole?: ScopeRole;
  isClientContextActive?: boolean;
  status: 'active' | 'suspended';
  memberships?: SessionMembership[];
  accessibleAgencyIds?: string[];
}

export interface SessionRecord {
  id: string;
  actor: SessionActor;
  expiresAt: Date;
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toId(value: IdLike | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const id = value.toString().trim();
  return id.length > 0 ? id : null;
}

function toUniqueIds(values: Array<IdLike | string> | undefined): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const value of values ?? []) {
    const id = toId(value);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    deduped.push(id);
  }

  return deduped;
}

function toSupportedRole(value: string | null | undefined): SessionMembershipRole {
  switch (value) {
    case 'owner':
    case 'agency_admin':
    case 'client_admin':
    case 'agent':
    case 'platform_admin':
    case 'agency_owner':
    case 'agency_member':
    case 'viewer':
      return value;
    default:
      return 'agency_member';
  }
}

function toLegacyRoleFromScope(scopeRole: ScopeRole, role: SessionMembershipRole): LegacyRole {
  if (role === 'agency_owner') {
    return 'agency_owner';
  }

  return mapScopeRoleToLegacyRole(scopeRole);
}

function normalizeMemberships(user: UserWithSessionFields): ResolvedMembership[] {
  const userAgencyId = toId(user.agencyId);
  const userTenantIds = toUniqueIds(user.tenantIds);
  const userDefaultTenantId = toId(user.defaultTenantId);
  const fallbackRole = toSupportedRole(user.role);

  const rawMemberships = user.memberships && user.memberships.length > 0
    ? user.memberships
    : userAgencyId
      ? [{
          agencyId: userAgencyId,
          role: fallbackRole,
          scopeRole: normalizeStoredUserRole(fallbackRole),
          tenantIds: userTenantIds,
          defaultTenantId: userDefaultTenantId,
        }]
      : [];

  return rawMemberships
    .map((membership): ResolvedMembership | null => {
      const agencyId = toId(membership.agencyId);
      if (!agencyId) {
        return null;
      }

      const role = toSupportedRole(typeof membership.role === 'string' ? membership.role : fallbackRole);
      const scopeRole = normalizeStoredUserRole(
        typeof membership.scopeRole === 'string' ? membership.scopeRole : role,
      );

      const explicitTenantIds = toUniqueIds(membership.tenantIds);
      const tenantIds = explicitTenantIds.length > 0
        ? explicitTenantIds
        : (agencyId === userAgencyId ? userTenantIds : []);

      const explicitDefaultTenantId = toId(membership.defaultTenantId);
      const fallbackDefaultTenantId = agencyId === userAgencyId ? userDefaultTenantId : null;
      const defaultTenantId = explicitDefaultTenantId ?? fallbackDefaultTenantId;

      const normalizedMembership: ResolvedMembership = {
        agencyId,
        role,
        scopeRole,
        tenantIds,
        defaultTenantId,
      };

      const customRoleId = toId('customRoleId' in membership ? membership.customRoleId : undefined);
      if (customRoleId) {
        normalizedMembership.customRoleId = customRoleId;
      }

      return normalizedMembership;
    })
    .filter((membership): membership is ResolvedMembership => membership !== null);
}

function pickMembershipForAgency(
  memberships: ResolvedMembership[],
  requestedAgencyId: string | null,
  fallbackAgencyId: string,
): ResolvedMembership | null {
  if (requestedAgencyId) {
    const target = memberships.find((membership) => membership.agencyId === requestedAgencyId);
    if (target) {
      return target;
    }
  }

  return memberships.find((membership) => membership.agencyId === fallbackAgencyId) ?? memberships[0] ?? null;
}

async function resolveAllowedTenantIds(membership: ResolvedMembership): Promise<string[]> {
  if (membership.scopeRole === 'owner' || membership.scopeRole === 'agency_admin') {
    const allAgencyTenants = await TenantModel.find({ agencyId: membership.agencyId }, '_id').lean();
    return toUniqueIds(allAgencyTenants.map((tenant) => tenant._id));
  }

  if (membership.tenantIds.length === 0) {
    return [];
  }

  const scopedTenants = await TenantModel.find(
    {
      agencyId: membership.agencyId,
      _id: { $in: membership.tenantIds },
    },
    '_id',
  ).lean();

  return toUniqueIds(scopedTenants.map((tenant) => tenant._id));
}

function selectTenantId(input: {
  requestedTenantId: string | null;
  allowedTenantIds: string[];
  membershipDefaultTenantId: string | null;
}): string | null {
  if (input.requestedTenantId && input.allowedTenantIds.includes(input.requestedTenantId)) {
    return input.requestedTenantId;
  }

  if (
    input.membershipDefaultTenantId
    && input.allowedTenantIds.includes(input.membershipDefaultTenantId)
  ) {
    return input.membershipDefaultTenantId;
  }

  return input.allowedTenantIds[0] ?? null;
}

function getRequestedAgencyId(request: FastifyRequest): string | null {
  const headerValue = request.headers[AGENCY_CONTEXT_HEADER];
  if (typeof headerValue === 'string') {
    return toId(headerValue);
  }

  return toId(request.cookies?.[AGENCY_CONTEXT_COOKIE]);
}

function getRequestedTenantId(request: FastifyRequest): string | null {
  const headerValue = request.headers[TENANT_CONTEXT_HEADER];
  if (typeof headerValue === 'string') {
    return toId(headerValue);
  }

  return toId(request.cookies?.[TENANT_CONTEXT_COOKIE]);
}

export async function getSessionFromRequest(request: FastifyRequest): Promise<SessionRecord | null> {
  const sessionToken = request.cookies?.[AUTH_SESSION_COOKIE_NAME];
  if (!sessionToken) {
    return null;
  }

  await dbConnect();

  const session = await AuthSessionModel.findOne({
    sessionTokenHash: hashSessionToken(sessionToken),
    expiresAt: { $gt: new Date() },
  }).lean();

  if (!session) {
    return null;
  }

  const user = await UserModel.findById(session.userId).lean();
  if (!user || user.status !== 'active') {
    return null;
  }

  await AuthSessionModel.findByIdAndUpdate(session._id, { lastSeenAt: new Date() }).exec();

  const normalizedMemberships = normalizeMemberships(user as UserWithSessionFields);
  if (normalizedMemberships.length === 0) {
    return null;
  }

  const requestedAgencyId = getRequestedAgencyId(request);
  const requestedTenantId = getRequestedTenantId(request);
  const fallbackAgencyId = toId(user.agencyId) ?? normalizedMemberships[0]?.agencyId ?? '';
  if (!fallbackAgencyId) {
    return null;
  }

  const baselineMembership = pickMembershipForAgency(normalizedMemberships, fallbackAgencyId, fallbackAgencyId);
  if (!baselineMembership) {
    return null;
  }

  const baselineScopeRole = normalizeStoredUserRole(user.role ?? baselineMembership.role);
  const ownerSession = baselineScopeRole === 'owner';
  let activeMembership = baselineMembership;

  if (requestedAgencyId && requestedAgencyId !== baselineMembership.agencyId) {
    if (ownerSession) {
      const targetAgency = await AgencyModel.findById(requestedAgencyId).lean();
      if (targetAgency) {
        const ownerAgencyMembership = normalizedMemberships.find(
          (membership) => membership.agencyId === requestedAgencyId,
        );
        activeMembership = ownerAgencyMembership ?? {
          agencyId: requestedAgencyId,
          role: 'owner',
          scopeRole: 'owner',
          tenantIds: [],
          defaultTenantId: null,
        };
      }
    } else {
      const matchedMembership = pickMembershipForAgency(
        normalizedMemberships,
        requestedAgencyId,
        baselineMembership.agencyId,
      );
      if (matchedMembership && matchedMembership.agencyId === requestedAgencyId) {
        activeMembership = matchedMembership;
      }
    }
  }

  const allowedTenantIds = await resolveAllowedTenantIds(activeMembership);
  const activeTenantId = selectTenantId({
    requestedTenantId,
    allowedTenantIds,
    membershipDefaultTenantId: activeMembership.defaultTenantId,
  }) ?? '';

  const scopeRole = activeMembership.scopeRole;
  const requestedTenantInScope = requestedTenantId ? allowedTenantIds.includes(requestedTenantId) : false;
  const forcedClientScope = scopeRole === 'client_admin' || scopeRole === 'agent';
  const isClientContextActive = forcedClientScope || requestedTenantInScope;
  const role = toLegacyRoleFromScope(scopeRole, activeMembership.role);
  const accessibleAgencyIds = toUniqueIds(normalizedMemberships.map((membership) => membership.agencyId));

  return {
    id: session._id.toString(),
    actor: {
      userId: user._id.toString(),
      agencyId: activeMembership.agencyId,
      tenantId: activeTenantId,
      tenantIds: allowedTenantIds,
      email: user.email,
      fullName: user.fullName,
      role,
      scopeRole,
      isClientContextActive,
      status: user.status,
      memberships: normalizedMemberships.map((membership) => ({
        agencyId: membership.agencyId,
        role: membership.role,
        scopeRole: membership.scopeRole,
        tenantIds: membership.tenantIds,
        defaultTenantId: membership.defaultTenantId,
        ...(membership.customRoleId ? { customRoleId: membership.customRoleId } : {}),
      })),
      accessibleAgencyIds,
    },
    expiresAt: session.expiresAt,
  };
}
