import {
  AgencyModel,
  ConversationModel,
  MessagingSessionBindingModel,
  TenantModel,
  UsageMeterEventModel,
  WorkflowDefinitionModel,
  WorkflowExecutionEventModel,
  WorkflowRunModel,
} from '@noxivo/database';
import type { AgencySummary, AgencyTeamRole } from '@noxivo/contracts';
import { dbConnect } from '../../lib/mongodb.js';
import type { SessionRecord } from '../agency/session-auth.js';

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
  allAgencies?: Array<{ id: string; name: string; slug: string; plan: AgencySummary['plan'] }>;
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

interface ScopeFilter {
  tenantId: string | { $in: string[] };
}

interface UsageAggregation {
  _id: null;
  total: number;
}

interface WorkflowRunAggregation {
  _id: null;
  total: number;
  completed: number;
}

interface WorkflowExecutionEventView {
  _id: { toString(): string };
  nodeId: string;
  status: string;
  startedAt?: Date;
}

interface WorkflowDefinitionView {
  _id: { toString(): string };
  key: string;
  name?: string;
  isActive: boolean;
}

function formatPlanLabel(plan: AgencySummary['plan']): string {
  switch (plan) {
    case 'reseller_basic':
      return 'Reseller Basic';
    case 'reseller_pro':
      return 'Reseller Pro';
    case 'enterprise':
      return 'Enterprise';
    default:
      return plan;
  }
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

function buildTenantScopeFilter(session: SessionRecord): ScopeFilter | null {
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

export async function queryDashboardShellData(session: SessionRecord, targetAgencyId?: string): Promise<DashboardShellData> {
  await dbConnect();

  const effectiveAgencyId = targetAgencyId || session.actor.agencyId;
  const agency = await AgencyModel.findById(effectiveAgencyId).lean();

  let allAgencies: DashboardShellData['allAgencies'];
  if (session.actor.role === 'platform_admin') {
    const rawAgencies = await AgencyModel.find({}, 'name slug plan').sort({ name: 1 }).lean();
    allAgencies = rawAgencies.map((item) => ({
      id: item._id.toString(),
      name: item.name,
      slug: item.slug,
      plan: item.plan as AgencySummary['plan'],
    }));
  } else if (session.actor.memberships && session.actor.memberships.length > 1) {
    const agencyIds = session.actor.memberships.map((membership) => membership.agencyId);
    const rawAgencies = await AgencyModel.find({ _id: { $in: agencyIds } }, 'name slug plan').sort({ name: 1 }).lean();
    allAgencies = rawAgencies.map((item) => ({
      id: item._id.toString(),
      name: item.name,
      slug: item.slug,
      plan: item.plan as AgencySummary['plan'],
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
    status: tenant.status,
  }));
  const activeClientTenant = clientTenants.find((tenant) => tenant.id === session.actor.tenantId) ?? null;

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
    agency: agency
      ? {
          id: agency._id.toString(),
          name: agency.name,
          slug: agency.slug,
          plan: agency.plan as AgencySummary['plan'],
        }
      : {
          id: effectiveAgencyId,
          name: 'Agency Not Found',
          slug: 'not-found',
          plan: 'reseller_basic',
        },
    clientTenants,
    activeClientTenant,
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
    topWorkflows,
  ] = await Promise.all([
    ConversationModel.countDocuments({ agencyId, ...scopedFilter }),
    TenantModel.countDocuments(activeTenantCountFilter),
    TenantModel.countDocuments({ agencyId }),
    WorkflowDefinitionModel.countDocuments({ agencyId, isActive: true, ...scopedFilter }),
    WorkflowDefinitionModel.countDocuments({ agencyId, ...scopedFilter }),
    MessagingSessionBindingModel.countDocuments({ agencyId, status: 'active', ...scopedFilter }),
    UsageMeterEventModel.aggregate<UsageAggregation>([
      { $match: { agencyId, windowStart: { $gte: monthStart }, ...scopedFilter } },
      { $group: { _id: null, total: { $sum: '$value' } } },
    ]),
    WorkflowRunModel.aggregate<WorkflowRunAggregation>([
      { $match: { agencyId, startedAt: { $gte: monthStart }, ...scopedFilter } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        },
      },
    ]),
    WorkflowExecutionEventModel.find({ agencyId, ...scopedFilter }).sort({ startedAt: -1 }).limit(5).lean<WorkflowExecutionEventView[]>(),
    WorkflowDefinitionModel.find({ agencyId, ...scopedFilter }).sort({ updatedAt: -1 }).limit(4).lean<WorkflowDefinitionView[]>(),
  ]);

  const totalUsageEvents = usageAgg[0]?.total ?? 0;
  const workflowTotal = runStatsAgg[0]?.total ?? 0;
  const workflowCompleted = runStatsAgg[0]?.completed ?? 0;

  const healthScore = workflowTotal > 0 ? Math.round((workflowCompleted / workflowTotal) * 1000) / 10 : 100;
  const uptime = totalTenants > 0 ? Math.round((activeSessions / totalTenants) * 1000) / 10 : 100;

  return {
    stats: {
      conversations,
      activeTenants,
      activeWorkflows: activeWorkflowsCount,
      workflowCount: totalWorkflowsCount,
      activeSessions,
      totalUsageEvents,
      healthScore,
      uptime,
    },
    recentActivity: recentEvents.map((event) => ({
      id: event._id.toString(),
      message: `Workflow node ${event.nodeId} ${event.status}`,
      timeLabel: formatRelativeTime(event.startedAt),
      type: 'workflow',
      status: event.status === 'completed' ? 'success' : event.status === 'failed' ? 'failed' : 'running',
    })),
    activeWorkflows: topWorkflows.map((workflow) => ({
      id: workflow._id.toString(),
      name: workflow.name || workflow.key,
      status: workflow.isActive ? 'Running' : 'Paused',
      tone: workflow.isActive ? 'success' : 'warning',
    })),
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
    UsageMeterEventModel.aggregate<UsageAggregation>([
      {
        $match: {
          agencyId,
          windowStart: { $gte: monthStart },
          metric: { $in: ['inbound_message', 'outbound_message'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$value' } } },
    ]),
    WorkflowRunModel.countDocuments({
      agencyId,
      startedAt: { $gte: monthStart },
    }),
  ]);

  const planLimits = {
    reseller_basic: { messaging: 10000, workflows: 500 },
    reseller_pro: { messaging: 50000, workflows: 2500 },
    enterprise: { messaging: 500000, workflows: 25000 },
  } as const;

  const currentPlan = agency.plan as keyof typeof planLimits;
  const limits = planLimits[currentPlan] || planLimits.reseller_basic;
  const nextBilling = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    plan: {
      name: formatPlanLabel(agency.plan as AgencySummary['plan']),
      price: agency.plan === 'enterprise' ? 999 : agency.plan === 'reseller_pro' ? 299 : 99,
      nextBillingDate: nextBilling.toISOString(),
      status: agency.status,
    },
    usage: {
      messaging: {
        current: messageCount[0]?.total ?? 0,
        limit: limits.messaging,
      },
      workflows: {
        current: workflowCount,
        limit: limits.workflows,
      },
    },
  };
}
