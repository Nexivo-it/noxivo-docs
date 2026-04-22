import { redirect } from 'next/navigation';
import { requireCurrentSession } from '../../../lib/auth/current-user';
import { canManageAgencyTeam } from '../../../lib/auth/authorization';
import type { AgencyOverviewData, TeamManagementData } from '../../../lib/api/dashboard-aggregates';
import { workflowEngineServerFetch } from '../../../lib/api/workflow-engine-server';
import { TeamWorkspace } from '../../../components/team-workspace';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const session = await requireCurrentSession();
  if (!canManageAgencyTeam(session)) {
    redirect('/dashboard/conversations');
  }
  const agencyId = encodeURIComponent(session.actor.agencyId);
  const [agencyOverview, teamManagement] = await Promise.all([
    workflowEngineServerFetch<AgencyOverviewData>(`/api/v1/agencies/${agencyId}`),
    workflowEngineServerFetch<TeamManagementData>(`/api/v1/agencies/${agencyId}/team`),
  ]);

  return (
    <TeamWorkspace
      agencyId={agencyOverview.agency.id}
      agencyName={agencyOverview.agency.name}
      agencyPlan={agencyOverview.agency.plan}
      actorRole={session.actor.role}
      members={teamManagement.members}
      invitations={teamManagement.invitations}
      tenantOptions={agencyOverview.tenants.map((tenant) => ({ id: tenant.id, name: tenant.name }))}
    />
  );
}
