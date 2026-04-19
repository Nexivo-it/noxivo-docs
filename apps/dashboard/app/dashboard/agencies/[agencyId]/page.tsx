import { requireCurrentSession } from '../../../../lib/auth/current-user';
import { queryAgencyOverview, queryTeamManagement } from '../../../../lib/dashboard/queries';
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
    queryAgencyOverview(session, agencyId),
    queryTeamManagement(session, agencyId),
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
