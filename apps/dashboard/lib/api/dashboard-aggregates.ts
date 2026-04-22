import type {
  AgencyInvitationRecord,
  AgencySummary,
  AgencyTeamRole,
  TeamMemberRecord,
} from '@noxivo/contracts';

export type AgencyListItem = AgencySummary;

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
  members: TeamMemberRecord[];
  invitations: AgencyInvitationRecord[];
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
