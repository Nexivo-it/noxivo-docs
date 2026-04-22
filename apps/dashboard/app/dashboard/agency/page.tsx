import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Building2, Globe, MessagesSquare, Users, Workflow } from 'lucide-react';
import { requireCurrentSession } from '../../../lib/auth/current-user';
import { canManageAgencySettings } from '../../../lib/auth/authorization';
import { workflowEngineServerFetch } from '../../../lib/api/workflow-engine-server';
import type { AgencyOverviewData, DashboardOverviewData } from '../../../lib/api/dashboard-aggregates';
import {
  AccessRoleIcon,
  Badge,
  EmptyWorkspaceState,
  WorkspaceHeader,
  WorkspaceMetricCard,
  WorkspacePanel,
  WorkspaceSpotlight,
  StatGroup,
  StatItem,
  badgeForAgencyStatus,
  formatDateLabel,
  formatPlanLabel,
  formatRoleLabel,
} from '../../../components/dashboard-workspace-ui';

export const dynamic = 'force-dynamic';

export default async function AgencyPage() {
  const session = await requireCurrentSession();
  if (!canManageAgencySettings(session)) {
    redirect('/dashboard/conversations');
  }
  const [agencyOverview, dashboardOverview] = await Promise.all([
    workflowEngineServerFetch<AgencyOverviewData>(`/api/v1/agencies/${session.actor.agencyId}`),
    workflowEngineServerFetch<DashboardOverviewData>('/api/v1/dashboard-data/overview'),
  ]);

  const agencyStatus = badgeForAgencyStatus(agencyOverview.agency.status);

  return (
    <div className="space-y-8">
      <WorkspaceHeader
        eyebrow="Agency"
        title={agencyOverview.agency.name}
        description="This overview keeps current-agency administration separate from internal team operations. Review branding, plan posture, and live workspace footprint without mixing it into team-member management."
        actions={
          <div className="inline-flex items-center gap-2 rounded-2xl border border-border-ghost bg-surface-card px-4 py-3 text-sm text-on-surface">
            <AccessRoleIcon role={session.actor.role} />
            <span>{formatRoleLabel(session.actor.role)}</span>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <WorkspaceMetricCard
          icon={Building2}
          label="Plan"
          value={formatPlanLabel(agencyOverview.agency.plan)}
          detail="Current agency subscription and reseller posture."
          delayIndex={1}
        />
        <WorkspaceMetricCard
          icon={Users}
          label="Team"
          value={agencyOverview.teamCount.toString()}
          detail="Authenticated teammates currently attached to this agency."
          delayIndex={2}
        />
        <WorkspaceMetricCard
          icon={Globe}
          label="Tenants"
          value={agencyOverview.tenantCount.toString()}
          detail="Client workspaces provisioned beneath the agency account."
          delayIndex={3}
        />
        <WorkspaceMetricCard
          icon={Workflow}
          label="Active workflows"
          value={dashboardOverview.stats.activeWorkflows.toString()}
          detail="Live automation definitions currently enabled for this agency."
          delayIndex={4}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <WorkspacePanel
          title="Agency baseline"
          description="Administrative metadata for the authenticated agency, including support identity, custom domain posture, and subscription state."
          delayIndex={5}
        >
          <div className="grid gap-8 md:grid-cols-2">
            <div className="rounded-[2rem] border border-border-ghost bg-surface-base/50 p-8">
              <div className="mb-8 flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-on-surface">Lifecycle</h3>
                <Badge label={agencyStatus.label} tone={agencyStatus.tone} />
              </div>
              <div className="grid gap-6">
                <StatItem label="Agency slug" value={`/${agencyOverview.agency.slug}`} />
                <StatItem label="Created" value={formatDateLabel(agencyOverview.agency.createdAt)} />
                <StatItem label="Support email" value={agencyOverview.agency.supportEmail ?? 'Not configured'} />
                <StatItem label="Custom domain" value={agencyOverview.agency.customDomain ?? 'Uses shared Noxivo domain'} />
              </div>
            </div>

            <div className="rounded-[2rem] border border-border-ghost bg-surface-base/50 p-8">
              <div className="mb-8 flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-on-surface">Live activity</h3>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <MessagesSquare className="h-4 w-4" />
                </div>
              </div>
              <div className="grid gap-6">
                <StatItem label="Open conversations" value={dashboardOverview.stats.conversations} />
                <StatItem label="Active sessions" value={dashboardOverview.stats.activeSessions} />
                <StatItem label="Active tenants" value={dashboardOverview.stats.activeTenants} />
                <StatItem label="Activity ledger" value={`${dashboardOverview.recentActivity.length} entries`} />
              </div>
            </div>
          </div>
        </WorkspacePanel>

        <WorkspaceSpotlight
          label="Separation of concerns"
          title="Agency administration now has its own home"
          body="Use the Team workspace for operator membership and invitations, and Tenants for client workspaces. This page stays focused on the agency itself—plan, footprint, and white-label baseline."
          icon={Building2}
          delayIndex={6}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <WorkspacePanel
          title="Workspace paths"
          description="Move directly into the area that matches the operational task instead of overloading one screen with agency, team, and tenant responsibilities."
          delayIndex={7}
        >
          <div className="grid gap-8 md:grid-cols-2">
            <Link
              href="/dashboard/team"
              className="group relative overflow-hidden rounded-[2rem] border border-border-ghost bg-surface-base/50 p-8 transition-all hover:border-primary/20 hover:bg-surface-card hover:shadow-primary-glow/5"
            >
              <div className="absolute top-0 right-0 p-8 opacity-[0.02] scale-[2.5] pointer-events-none group-hover:text-primary transition-colors">
                <Users size={48} />
              </div>
              <div className="flex items-center justify-between gap-6">
                <div className="space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary">Team</p>
                  <h3 className="text-xl font-bold text-on-surface">Manage members</h3>
                  <p className="text-sm font-light leading-7 text-on-surface-muted">Invite operators, review tenant scopes, and keep membership changes in one dedicated workspace.</p>
                </div>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-base border border-border-ghost group-hover:bg-primary group-hover:text-white transition-all">
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/tenants"
              className="group relative overflow-hidden rounded-[2rem] border border-border-ghost bg-surface-base/50 p-8 transition-all hover:border-primary/20 hover:bg-surface-card hover:shadow-primary-glow/5"
            >
              <div className="absolute top-0 right-0 p-8 opacity-[0.02] scale-[2.5] pointer-events-none group-hover:text-primary transition-colors">
                <Globe size={48} />
              </div>
              <div className="flex items-center justify-between gap-6">
                <div className="space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary">Tenants</p>
                  <h3 className="text-xl font-bold text-on-surface">Client workspaces</h3>
                  <p className="text-sm font-light leading-7 text-on-surface-muted">Provision new tenant environments, review billing mode, and keep client routing separate.</p>
                </div>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-base border border-border-ghost group-hover:bg-primary group-hover:text-white transition-all">
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </Link>
          </div>
        </WorkspacePanel>

        <WorkspacePanel
          title="Tenant preview"
          description="A quick view of the latest tenant workspaces attached to the authenticated agency context."
          delayIndex={8}
        >
          {agencyOverview.tenants.length === 0 ? (
            <EmptyWorkspaceState
              icon={Globe}
              title="No tenant workspaces yet"
              description="Create the first tenant from the Tenants workspace when you are ready to onboard a client environment."
            />
          ) : (
            <div className="space-y-4">
              {agencyOverview.tenants.slice(0, 3).map((tenant) => (
                <div key={tenant.id} className="rounded-[2rem] border border-border-ghost bg-surface-base/50 p-8 transition-all hover:bg-surface-base">
                  <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <h3 className="text-lg font-bold text-on-surface tracking-tight">{tenant.name}</h3>
                      <p className="text-sm font-medium text-on-surface-subtle">/{tenant.slug}</p>
                    </div>
                    <Badge
                      label={tenant.status === 'active' ? 'Active' : tenant.status}
                      tone={tenant.status === 'active' ? 'success' : 'warning'}
                    />
                  </div>
                  <div className="mt-8 border-t border-border-ghost/50 pt-6">
                    <StatGroup>
                      <StatItem label="Region" value={tenant.region} />
                      <StatItem label="Billing" value={tenant.billingMode === 'tenant_pays' ? 'Tenant Pays' : 'Agency Pays'} />
                      <StatItem label="Created" value={formatDateLabel(tenant.createdAt)} />
                    </StatGroup>
                  </div>
                </div>
              ))}
            </div>
          )}
        </WorkspacePanel>
      </div>
    </div>
  );
}
