import mongoose from 'mongoose';
import { AgencyModel, TenantModel, UserModel } from '@noxivo/database';
import {
  parseAgencyCreateInput,
  parseAgencyUpdateInput,
  parseTenantCreateInput,
  type AgencySummary,
} from '@noxivo/contracts';
import { dbConnect } from '../../lib/mongodb.js';
import { canCreateAgencies, canManageAgencySettings, canManageTargetAgency, isPlatformAdmin } from './authorization.js';
import { syncCustomDomainReservation } from './domain-reservations.js';
import { createOrRefreshAgencyInvitation } from './team-admin.service.js';
import type { SessionRecord } from './session-auth.js';

const PLAN_USAGE_LIMITS = {
  reseller_basic: { tenants: 5, activeSessions: 25 },
  reseller_pro: { tenants: 20, activeSessions: 100 },
  enterprise: { tenants: 100, activeSessions: 500 },
} as const;

interface AgencyAdminDetail {
  agency: AgencySummary;
  tenantCount: number;
  teamCount: number;
  tenants: Array<{
    id: string;
    agencyId: string;
    slug: string;
    name: string;
    region: string;
    status: string;
    billingMode: string;
    customDomain: string | null;
    createdAt: string;
  }>;
}

interface AgencySummarySource {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  plan: AgencySummary['plan'];
  status: AgencySummary['status'];
  whiteLabelDefaults?: unknown;
  createdAt: Date;
}

function getOptionalString(source: unknown, key: string): string | null {
  if (!source || typeof source !== 'object') {
    return null;
  }

  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function ensureAgencyIdInput(agencyId: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(agencyId)) {
    throw new Error('Agency not found');
  }

  return new mongoose.Types.ObjectId(agencyId);
}

function mapAgencySummary(input: {
  agency: AgencySummarySource;
  tenantCount: number;
  teamCount: number;
}): AgencySummary {
  const agency = input.agency;

  return {
    id: agency._id.toString(),
    name: agency.name,
    slug: agency.slug,
    customDomain: getOptionalString(agency.whiteLabelDefaults, 'customDomain'),
    supportEmail: getOptionalString(agency.whiteLabelDefaults, 'supportEmail'),
    primaryColor: getOptionalString(agency.whiteLabelDefaults, 'primaryColor'),
    plan: agency.plan,
    status: agency.status,
    tenantCount: input.tenantCount,
    teamCount: input.teamCount,
    createdAt: agency.createdAt.toISOString(),
  };
}

async function countAgencyDependents(agencyIds: mongoose.Types.ObjectId[]): Promise<{
  tenantCounts: Map<string, number>;
  teamCounts: Map<string, number>;
}> {
  const [tenantCounts, teamCounts] = await Promise.all([
    TenantModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { agencyId: { $in: agencyIds } } },
      { $group: { _id: '$agencyId', count: { $sum: 1 } } },
    ]),
    UserModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { agencyId: { $in: agencyIds } } },
      { $group: { _id: '$agencyId', count: { $sum: 1 } } },
    ]),
  ]);

  return {
    tenantCounts: new Map(tenantCounts.map((entry) => [entry._id.toString(), entry.count])),
    teamCounts: new Map(teamCounts.map((entry) => [entry._id.toString(), entry.count])),
  };
}

export async function listAccessibleAgencies(session: SessionRecord): Promise<AgencySummary[]> {
  await dbConnect();

  const agenciesRaw = isPlatformAdmin(session)
    ? await AgencyModel.find({}).sort({ createdAt: -1 }).lean()
    : await AgencyModel.find({ _id: session.actor.agencyId }).sort({ createdAt: -1 }).lean();

  const agencies = agenciesRaw as AgencySummarySource[];
  const agencyIds = agencies.map((agency) => agency._id);
  const { tenantCounts, teamCounts } = agencyIds.length > 0
    ? await countAgencyDependents(agencyIds)
    : { tenantCounts: new Map<string, number>(), teamCounts: new Map<string, number>() };

  return agencies.map((agency) => mapAgencySummary({
    agency,
    tenantCount: tenantCounts.get(agency._id.toString()) ?? 0,
    teamCount: teamCounts.get(agency._id.toString()) ?? 0,
  }));
}

export async function getAgencyAdministrationDetail(session: SessionRecord, agencyId: string): Promise<AgencyAdminDetail> {
  await dbConnect();

  if (!canManageTargetAgency(session, agencyId) && session.actor.agencyId !== agencyId) {
    throw new Error('Forbidden');
  }

  const agencyObjectId = ensureAgencyIdInput(agencyId);
  const [agencyRaw, tenants, tenantCount, teamCount] = await Promise.all([
    AgencyModel.findById(agencyObjectId).lean(),
    TenantModel.find({ agencyId: agencyObjectId }).sort({ createdAt: 1 }).lean(),
    TenantModel.countDocuments({ agencyId: agencyObjectId }),
    UserModel.countDocuments({ agencyId: agencyObjectId }),
  ]);

  if (!agencyRaw) {
    throw new Error('Agency not found');
  }

  const agency = agencyRaw as AgencySummarySource;

  return {
    agency: mapAgencySummary({ agency, tenantCount, teamCount }),
    tenantCount,
    teamCount,
    tenants: tenants.map((tenant) => ({
      id: tenant._id.toString(),
      agencyId: tenant.agencyId.toString(),
      slug: tenant.slug,
      name: tenant.name,
      region: tenant.region,
      status: tenant.status,
      billingMode: tenant.billingMode,
      customDomain: getOptionalString(tenant.whiteLabelOverrides, 'customDomain'),
      createdAt: tenant.createdAt.toISOString(),
    })),
  };
}

export async function getAgencyTenantDetail(
  session: SessionRecord,
  agencyId: string,
  tenantId: string,
): Promise<AgencyAdminDetail['tenants'][number]> {
  const detail = await getAgencyAdministrationDetail(session, agencyId);
  const tenant = detail.tenants.find((entry) => entry.id === tenantId);

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  return tenant;
}

export async function createAgency(session: SessionRecord, payload: unknown): Promise<{
  agency: AgencySummary;
  ownerInvitation: { email: string; signupUrl: string } | null;
}> {
  await dbConnect();

  if (!canCreateAgencies(session)) {
    throw new Error('Forbidden');
  }

  const parsed = parseAgencyCreateInput(payload);
  const existingAgency = await AgencyModel.findOne({ slug: parsed.slug }).select({ _id: 1 }).lean();
  if (existingAgency) {
    throw new Error('Agency slug is already in use');
  }

  const existingOwner = parsed.ownerEmail
    ? await UserModel.findOne({ email: parsed.ownerEmail }).select({ _id: 1 }).lean()
    : null;
  if (existingOwner) {
    throw new Error('Owner email already belongs to another agency');
  }

  const agencyId = new mongoose.Types.ObjectId();
  const defaultTenantId = new mongoose.Types.ObjectId();
  const reservedCustomDomain = await syncCustomDomainReservation({
    ownerType: 'agency',
    ownerId: agencyId,
    nextDomain: parsed.customDomain,
  });

  const agency = await AgencyModel.create({
    _id: agencyId,
    name: parsed.name,
    slug: parsed.slug,
    plan: parsed.plan,
    billingStripeCustomerId: null,
    billingStripeSubscriptionId: null,
    billingOwnerUserId: new mongoose.Types.ObjectId(session.actor.userId),
    whiteLabelDefaults: {
      customDomain: reservedCustomDomain,
      logoUrl: null,
      primaryColor: parsed.primaryColor ?? null,
      supportEmail: parsed.supportEmail ?? null,
      hidePlatformBranding: false,
    },
    usageLimits: PLAN_USAGE_LIMITS[parsed.plan],
    status: 'trial',
  });

  await TenantModel.create({
    _id: defaultTenantId,
    agencyId,
    slug: `${parsed.slug}-main`,
    name: `${parsed.name} Main Workspace`,
    region: 'us-east-1',
    status: 'active',
    billingMode: 'agency_pays',
    whiteLabelOverrides: {},
    effectiveBrandingCache: agency.whiteLabelDefaults,
  });

  const ownerInvitation = parsed.ownerEmail
    ? await createOrRefreshAgencyInvitation({
        agencyId: agencyId.toString(),
        invitedByUserId: session.actor.userId,
        email: parsed.ownerEmail,
        ...(parsed.ownerFullName ? { fullName: parsed.ownerFullName } : {}),
        role: 'agency_owner',
        tenantIds: [defaultTenantId.toString()],
      })
    : null;

  return {
    agency: mapAgencySummary({
      agency: agency.toObject() as AgencySummarySource,
      tenantCount: 1,
      teamCount: 0,
    }),
    ownerInvitation: ownerInvitation ? { email: ownerInvitation.invitation.email, signupUrl: ownerInvitation.signupUrl } : null,
  };
}

export async function updateAgency(session: SessionRecord, agencyId: string, payload: unknown): Promise<AgencySummary> {
  await dbConnect();

  if (!canManageAgencySettings(session) || !canManageTargetAgency(session, agencyId)) {
    throw new Error('Forbidden');
  }

  const parsed = parseAgencyUpdateInput(payload);
  const agencyObjectId = ensureAgencyIdInput(agencyId);
  const agency = await AgencyModel.findById(agencyObjectId);
  if (!agency) {
    throw new Error('Agency not found');
  }

  if (!isPlatformAdmin(session) && (parsed.plan !== undefined || parsed.status !== undefined)) {
    throw new Error('Forbidden');
  }

  const reservedCustomDomain = await syncCustomDomainReservation({
    ownerType: 'agency',
    ownerId: agencyObjectId,
    currentDomain: getOptionalString(agency.whiteLabelDefaults, 'customDomain'),
    nextDomain: parsed.customDomain ?? getOptionalString(agency.whiteLabelDefaults, 'customDomain'),
  });

  agency.name = parsed.name ?? agency.name;
  agency.plan = parsed.plan ?? agency.plan;
  agency.status = parsed.status ?? agency.status;
  agency.whiteLabelDefaults = {
    ...agency.whiteLabelDefaults,
    customDomain: reservedCustomDomain,
    supportEmail: parsed.supportEmail ?? getOptionalString(agency.whiteLabelDefaults, 'supportEmail'),
    primaryColor: parsed.primaryColor ?? getOptionalString(agency.whiteLabelDefaults, 'primaryColor'),
    logoUrl: parsed.logoUrl ?? getOptionalString(agency.whiteLabelDefaults, 'logoUrl'),
    hidePlatformBranding: parsed.hidePlatformBranding
      ?? Boolean((agency.whiteLabelDefaults as Record<string, unknown>)?.hidePlatformBranding),
  };
  await agency.save();

  const [tenantCount, teamCount] = await Promise.all([
    TenantModel.countDocuments({ agencyId: agencyObjectId }),
    UserModel.countDocuments({ agencyId: agencyObjectId }),
  ]);

  return mapAgencySummary({
    agency: agency.toObject() as AgencySummarySource,
    tenantCount,
    teamCount,
  });
}

export async function createAgencyTenant(session: SessionRecord, agencyId: string, payload: unknown): Promise<AgencyAdminDetail['tenants'][number]> {
  await dbConnect();

  if (!canManageAgencySettings(session) || !canManageTargetAgency(session, agencyId)) {
    throw new Error('Forbidden');
  }

  const parsed = parseTenantCreateInput(payload);
  const agencyObjectId = ensureAgencyIdInput(agencyId);
  const agency = await AgencyModel.findById(agencyObjectId);
  if (!agency) {
    throw new Error('Agency not found');
  }

  const existingCount = await TenantModel.countDocuments({ agencyId: agencyObjectId });
  const tenantLimit = agency.usageLimits?.tenants ?? PLAN_USAGE_LIMITS[agency.plan].tenants;
  if (existingCount >= tenantLimit) {
    throw new Error('Agency tenant limit reached');
  }

  const existingTenant = await TenantModel.findOne({ slug: parsed.slug }).select({ _id: 1 }).lean();
  if (existingTenant) {
    throw new Error('Tenant slug is already in use');
  }

  const tenantId = new mongoose.Types.ObjectId();
  const reservedCustomDomain = await syncCustomDomainReservation({
    ownerType: 'tenant',
    ownerId: tenantId,
    nextDomain: parsed.whiteLabelOverrides.customDomain ?? null,
  });

  const effectiveBrandingCache = {
    ...agency.whiteLabelDefaults,
    ...parsed.whiteLabelOverrides,
    customDomain: reservedCustomDomain,
  };

  const tenant = await TenantModel.create({
    _id: tenantId,
    agencyId: agencyObjectId,
    slug: parsed.slug,
    name: parsed.name,
    region: parsed.region,
    status: 'active',
    billingMode: parsed.billingMode,
    whiteLabelOverrides: {
      ...parsed.whiteLabelOverrides,
      customDomain: reservedCustomDomain,
    },
    effectiveBrandingCache,
  });

  return {
    id: tenant._id.toString(),
    agencyId: tenant.agencyId.toString(),
    slug: tenant.slug,
    name: tenant.name,
    region: tenant.region,
    status: tenant.status,
    billingMode: tenant.billingMode,
    customDomain: getOptionalString(tenant.whiteLabelOverrides, 'customDomain'),
    createdAt: tenant.createdAt.toISOString(),
  };
}
