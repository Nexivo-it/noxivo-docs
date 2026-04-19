import { redirect } from 'next/navigation';
import { requireCurrentSession } from '../../../lib/auth/current-user';
import { canManageAgencyTeam } from '../../../lib/auth/authorization';
import { queryAgencyOverview, queryTeamManagement } from '../../../lib/dashboard/queries';
import { TeamWorkspace } from '../../../components/team-workspace';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const session = await requireCurrentSession();
  if (!canManageAgencyTeam(session)) {
    redirect('/dashboard/conversations');
  }
  const [agencyOverview, teamManagement] = await Promise.all([
    queryAgencyOverview(session),
    queryTeamManagement(session),
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
