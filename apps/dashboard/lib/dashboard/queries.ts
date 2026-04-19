import {
  AgencyModel,
  ConversationModel,
  TenantModel,
  UserModel,
  MessagingSessionBindingModel,
  WorkflowDefinitionModel,
  WorkflowRunModel,
  WorkflowExecutionEventModel,
  UsageMeterEventModel
} from '@noxivo/database';
import type { AgencySummary, AgencyTeamRole } from '@noxivo/contracts';
import { getAgencyAdministrationDetail, listAccessibleAgencies } from './agency-admin';
import { listAgencyTeam } from './team-admin';
import { formatPlanLabel } from '../../components/dashboard-workspace-ui';
import dbConnect from '../mongodb';
import type { SessionRecord } from '../auth/session';
import { buildWorkflowTenantFilter } from '../workflows/scope';

export interface DashboardShellData {
  user: {
    fullName: string;
    email: string;
    role: AgencyTeamRole | 'platform_admin';
    scopeRole?: 'owner' | 'agency_admin' | 'client_admin' | 'agent';
    isClientContextActive?: boolean;
    memberships?: Array<{
      agencyId: string;
      role: AgencyTeamRole | 'platform_admin';
    }>;
  };
  agency: {
    id: string;
    name: string;
    slug: string;
    plan: AgencySummary['plan'];
  };
  // ADR-001 Phase 1 & 3: populated for platform_admin or multi-agency members
  allAgencies?: Array<{ id: string; name: string; slug: string; plan: AgencySummary['plan']; }>;
  clientTenants?: Array<{ id: string; name: string; slug: string; status?: string }>;
  activeClientTenant?: { id: string; name: string; slug: string } | null;
}

export interface DashboardOverviewData {
  stats: {
    conversations: number;
    activeTenants: number;
    activeWorkflows: number;
    workflowCount: number;
    activeSessions: number;
    totalUsageEvents: number;
    healthScore: number;
    uptime: number;
  };
  recentActivity: Array<{
    id: string;
    message: string;
    timeLabel: string;
    type: 'workflow' | 'message' | 'system';
    status: 'success' | 'failed' | 'running';
  }>;
  activeWorkflows: Array<{
    id: string;
    name: string;
    status: string;
    tone: 'success' | 'warning' | 'neutral';
  }>;
}

export type AgencyListItem = AgencySummary;

export interface AgencyOverviewData {
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

export interface TeamManagementData {
  members: Awaited<ReturnType<typeof listAgencyTeam>>['members'];
  invitations: Awaited<ReturnType<typeof listAgencyTeam>>['invitations'];
}

export interface WorkflowsPageData {
  workflows: Array<{
    id: string;
    name: string;
    description: string;
    status: 'active' | 'paused';
    lastRun: string;
    executions: number;
    type: string;
  }>;
}

function formatRelativeTime(date: Date | null | undefined): string {
  if (!date) {
    return 'No recent activity';
  }

  const differenceMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(differenceMs / 60000));

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function resolveScopeRole(session: SessionRecord): 'owner' | 'agency_admin' | 'client_admin' | 'agent' {
  if (session.actor.scopeRole) {
    return session.actor.scopeRole;
  }

  switch (session.actor.role) {
    case 'platform_admin':
      return 'owner';
    case 'agency_owner':
    case 'agency_admin':
      return 'agency_admin';
    default:
      return 'agent';
  }
}

function buildTenantScopeFilter(session: SessionRecord): Record<string, string> | Record<string, { $in: string[] }> | null {
  const activeTenantId = session.actor.tenantId.trim();
  const scopedTenantIds = session.actor.tenantIds.filter((tenantId) => tenantId.length > 0);
  const scopeRole = resolveScopeRole(session);
  const clientContext = session.actor.isClientContextActive || scopeRole === 'client_admin' || scopeRole === 'agent';

  if (clientContext && activeTenantId.length > 0) {
    return { tenantId: activeTenantId };
  }

  if (clientContext && scopedTenantIds.length > 0) {
    return { tenantId: { $in: scopedTenantIds } };
  }

  return null;
}

export async function queryDashboardShellData(session: SessionRecord, targetAgencyId?: string): Promise<DashboardShellData> {
  await dbConnect();

  // Use the agencyId from URL if provided, otherwise fallback to session
  const effectiveAgencyId = targetAgencyId || session.actor.agencyId;
  const agency = await AgencyModel.findById(effectiveAgencyId).lean();

  let allAgencies: DashboardShellData['allAgencies'];
  if (session.actor.role === 'platform_admin') {
    const rawAgencies = await AgencyModel
      .find({}, 'name slug plan')
      .sort({ name: 1 })
      .lean();
    allAgencies = rawAgencies.map((a) => ({
      id: a._id.toString(),
      name: a.name,
      slug: a.slug,
      plan: a.plan as AgencySummary['plan']
    }));
  } else if (session.actor.memberships && session.actor.memberships.length > 1) {
    const agencyIds = session.actor.memberships.map(m => m.agencyId);
    const rawAgencies = await AgencyModel
      .find({ _id: { $in: agencyIds } }, 'name slug plan')
      .sort({ name: 1 })
      .lean();
    allAgencies = rawAgencies.map((a) => ({
      id: a._id.toString(),
      name: a.name,
      slug: a.slug,
      plan: a.plan as AgencySummary['plan']
    }));
  }

  const scopeRole = resolveScopeRole(session);
  const scopedTenantIds = session.actor.tenantIds.filter((tenantId) => tenantId.length > 0);
  const tenantFilter: { agencyId: string; _id?: { $in: string[] } } = { agencyId: effectiveAgencyId };

  if ((scopeRole === 'client_admin' || scopeRole === 'agent') && scopedTenantIds.length > 0) {
    tenantFilter._id = { $in: scopedTenantIds };
  }

  const tenants = await TenantModel.find(tenantFilter, 'name slug status').sort({ name: 1 }).lean();
  const clientTenants = tenants.map((tenant) => ({
    id: tenant._id.toString(),
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status
  }));
  const activeClientTenant = clientTenants.find((tenant) => tenant.id === session.actor.tenantId) ?? null;

  // Fallback for missing agency (e.g. invalid ID in URL)
  const userData: DashboardShellData['user'] = {
    fullName: session.actor.fullName,
    email: session.actor.email,
    role: session.actor.role as AgencyTeamRole | 'platform_admin',
    scopeRole,
  };

  if (typeof session.actor.isClientContextActive === 'boolean') {
    userData.isClientContextActive = session.actor.isClientContextActive;
  }

  if (session.actor.memberships && session.actor.memberships.length > 0) {
    userData.memberships = session.actor.memberships.map((membership) => ({
      agencyId: membership.agencyId,
      role: membership.role as AgencyTeamRole | 'platform_admin',
    }));
  }

  const data: DashboardShellData = {
    user: userData,
    agency: agency ? {
      id: agency._id.toString(),
      name: agency.name,
      slug: agency.slug,
      plan: agency.plan as AgencySummary['plan']
    } : {
      id: effectiveAgencyId,
      name: 'Agency Not Found',
      slug: 'not-found',
      plan: 'reseller_basic'
    },
    clientTenants,
    activeClientTenant
  };

  if (allAgencies) {
    data.allAgencies = allAgencies;
  }

  return data;
}

export async function queryDashboardOverview(session: SessionRecord): Promise<DashboardOverviewData> {
  await dbConnect();
  const agencyId = session.actor.agencyId;
  const tenantScopeFilter = buildTenantScopeFilter(session);
  const scopedFilter = tenantScopeFilter ?? {};
  const tenantIdsInScope = session.actor.tenantIds.filter((tenantId) => tenantId.length > 0);
  const activeTenantId = session.actor.tenantId.trim();
  const activeTenantCountFilter = tenantScopeFilter
    ? activeTenantId.length > 0
      ? { agencyId, _id: activeTenantId }
      : tenantIdsInScope.length > 0
        ? { agencyId, _id: { $in: tenantIdsInScope } }
        : { agencyId, _id: '__no_tenant_scope__' }
    : { agencyId, status: 'active' };

  // Calculate current month window
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    conversations,
    activeTenants,
    totalTenants,
    activeWorkflowsCount,
    totalWorkflowsCount,
    activeSessions,
    usageAgg,
    runStatsAgg,
    recentEvents,
    topWorkflows
  ] = await Promise.all([
    ConversationModel.countDocuments({ agencyId, ...scopedFilter }),
    TenantModel.countDocuments(activeTenantCountFilter),
    TenantModel.countDocuments({ agencyId }),
    WorkflowDefinitionModel.countDocuments({ agencyId, isActive: true, ...scopedFilter }),
    WorkflowDefinitionModel.countDocuments({ agencyId, ...scopedFilter }),
    MessagingSessionBindingModel.countDocuments({ agencyId, status: 'active', ...scopedFilter }),
    // Aggregate total usage events for current month
    UsageMeterEventModel.aggregate([
      { $match: { agencyId, windowStart: { $gte: monthStart }, ...scopedFilter } },
      { $group: { _id: null, total: { $sum: '$value' } } }
    ]),
    // Aggregate workflow success/fail for health score
    WorkflowRunModel.aggregate([
      { $match: { agencyId, startedAt: { $gte: monthStart }, ...scopedFilter } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }
        }
      }
    ]),
    // Fetch real recent activity from execution events
    WorkflowExecutionEventModel.find({ agencyId, ...scopedFilter })
      .sort({ startedAt: -1 })
      .limit(5)
      .lean(),
    // Fetch active workflows
    WorkflowDefinitionModel.find({ agencyId, ...scopedFilter })
      .sort({ updatedAt: -1 })
      .limit(4)
      .lean()
  ]);

  const totalUsageEvents = usageAgg[0]?.total || 0;
  const workflowTotal = runStatsAgg[0]?.total || 0;
  const workflowCompleted = runStatsAgg[0]?.completed || 0;

  const healthScore = workflowTotal > 0
    ? Math.round((workflowCompleted / workflowTotal) * 1000) / 10
    : 100;

  const uptime = totalTenants > 0
    ? Math.round((activeSessions / totalTenants) * 1000) / 10
    : 100;

  return {
    stats: {
      conversations,
      activeTenants,
      activeWorkflows: activeWorkflowsCount,
      workflowCount: totalWorkflowsCount,
      activeSessions,
      totalUsageEvents,
      healthScore,
      uptime
    },
    recentActivity: (recentEvents as any[]).map((event) => ({
      id: event._id.toString(),
      message: `Workflow node ${event.nodeId} ${event.status}`,
      timeLabel: formatRelativeTime(event.startedAt),
      type: 'workflow',
      status: event.status === 'completed' ? 'success' : event.status === 'failed' ? 'failed' : 'running'
    })),
    activeWorkflows: (topWorkflows as any[]).map((wf) => ({
      id: wf._id.toString(),
      name: wf.name || wf.key,
      status: wf.isActive ? 'Running' : 'Paused',
      tone: wf.isActive ? 'success' : 'warning'
    }))
  };
}

export interface BillingPageData {
  plan: {
    name: string;
    price: number;
    nextBillingDate: string;
    status: AgencySummary['status'];
  };
  usage: {
    messaging: {
      current: number;
      limit: number;
    };
    workflows: {
      current: number;
      limit: number;
    };
  };
}

export async function queryBillingData(session: SessionRecord): Promise<BillingPageData> {
  await dbConnect();
  const agencyId = session.actor.agencyId;

  const agency = await AgencyModel.findById(agencyId).lean().exec();
  if (!agency) {
    throw new Error('Agency not found');
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [messageCount, workflowCount] = await Promise.all([
    UsageMeterEventModel.aggregate([
      {
        $match: {
          agencyId,
          windowStart: { $gte: monthStart },
          metric: { $in: ['inbound_message', 'outbound_message'] }
        }
      },
      { $group: { _id: null, total: { $sum: '$value' } } }
    ]),
    WorkflowRunModel.countDocuments({
      agencyId,
      startedAt: { $gte: monthStart }
    })
  ]);

  // Map plan limits based on actual agency model or defaults
  const planLimits = {
    reseller_basic: { messaging: 10000, workflows: 500 },
    reseller_pro: { messaging: 50000, workflows: 2500 },
    enterprise: { messaging: 500000, workflows: 25000 }
  };

  const currentPlan = agency.plan as keyof typeof planLimits;
  const limits = planLimits[currentPlan] || planLimits.reseller_basic;

  // Next billing date is usually 1 month from createdAt or similar logic
  // For now, we'll project to the 1st of next month
  const nextBilling = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    plan: {
      name: formatPlanLabel(agency.plan as any),
      price: agency.plan === 'enterprise' ? 999 : agency.plan === 'reseller_pro' ? 299 : 99,
      nextBillingDate: nextBilling.toISOString(),
      status: agency.status
    },
    usage: {
      messaging: {
        current: messageCount[0]?.total || 0,
        limit: limits.messaging
      },
      workflows: {
        current: workflowCount,
        limit: limits.workflows
      }
    }
  };
}

export async function queryAgencies(session: SessionRecord): Promise<AgencyListItem[]> {
  return listAccessibleAgencies(session);
}

export async function queryAgencyOverview(session: SessionRecord, agencyId?: string): Promise<AgencyOverviewData> {
  return getAgencyAdministrationDetail(session, agencyId ?? session.actor.agencyId);
}

export async function queryTeamManagement(session: SessionRecord, agencyId?: string): Promise<TeamManagementData> {
  return listAgencyTeam(session, agencyId ?? session.actor.agencyId);
}

export async function queryAgencyCounts(session: SessionRecord): Promise<{ teamCount: number; tenantCount: number }> {
  await dbConnect();

  const [teamCount, tenantCount] = await Promise.all([
    UserModel.countDocuments({ agencyId: session.actor.agencyId, role: { $ne: 'platform_admin' } }),
    TenantModel.countDocuments({ agencyId: session.actor.agencyId })
  ]);

  return { teamCount, tenantCount };
}

export async function queryWorkflowsData(session: SessionRecord): Promise<WorkflowsPageData> {
  await dbConnect();
  const tenantFilter = buildWorkflowTenantFilter(session);

  const definitions = await WorkflowDefinitionModel.find({
      agencyId: session.actor.agencyId,
      ...tenantFilter
    })
    .sort({ updatedAt: -1 })
    .lean()
    .exec();

  return {
    workflows: definitions.map((def) => ({
      id: def._id.toString(),
      name: (def as any).name || def.key,
      description: (def as any).description || `Workflow for ${def.channel}`,
      status: def.isActive ? 'active' : 'paused',
      lastRun: 'No recent runs',
      executions: 0,
      type: def.channel
    }))
  };
}
