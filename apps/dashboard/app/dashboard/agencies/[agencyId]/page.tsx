import { requireCurrentSession } from '../../../../lib/auth/current-user';
import type { AgencyOverviewData, TeamManagementData } from '../../../../lib/api/dashboard-aggregates';
import { workflowEngineServerFetch } from '../../../../lib/api/workflow-engine-server';
import { TeamWorkspace } from '../../../../components/team-workspace';
import { TenantsWorkspace } from '../../../../components/tenants-workspace';

export const dynamic = 'force-dynamic';

export default async function PlatformAgencyDetailPage({
  params,
}: {
  params: Promise<{ agencyId: string }>;
}) {
  const session = await requireCurrentSession();
  const { agencyId } = await params;
  const [agencyOverview, teamManagement] = await Promise.all([
    workflowEngineServerFetch<AgencyOverviewData>(`/api/v1/agencies/${encodeURIComponent(agencyId)}`),
    workflowEngineServerFetch<TeamManagementData>(`/api/v1/agencies/${encodeURIComponent(agencyId)}/team`),
  ]);

  return (
    <div className="space-y-8">
      <TenantsWorkspace actorRole={session.actor.role} agency={agencyOverview.agency} tenants={agencyOverview.tenants} />
      <TeamWorkspace
        agencyId={agencyOverview.agency.id}
        agencyName={agencyOverview.agency.name}
        agencyPlan={agencyOverview.agency.plan}
        actorRole={session.actor.role}
        members={teamManagement.members}
        invitations={teamManagement.invitations}
        tenantOptions={agencyOverview.tenants.map((tenant) => ({ id: tenant.id, name: tenant.name }))}
      />
    </div>
  );
}
