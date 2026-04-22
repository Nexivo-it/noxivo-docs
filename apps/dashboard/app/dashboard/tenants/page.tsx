import { redirect } from 'next/navigation';
import { requireCurrentSession } from '../../../lib/auth/current-user';
import { canManageAgencySettings } from '../../../lib/auth/authorization';
import type { AgencyOverviewData } from '../../../lib/api/dashboard-aggregates';
import { workflowEngineServerFetch } from '../../../lib/api/workflow-engine-server';
import { TenantsWorkspace } from '../../../components/tenants-workspace';

export const dynamic = 'force-dynamic';

export default async function TenantsPage() {
  const session = await requireCurrentSession();
  if (!canManageAgencySettings(session)) {
    redirect('/dashboard/conversations');
  }
  const agencyOverview = await workflowEngineServerFetch<AgencyOverviewData>(
    `/api/v1/agencies/${encodeURIComponent(session.actor.agencyId)}`,
  );

  return (
    <TenantsWorkspace
      actorRole={session.actor.role}
      agency={agencyOverview.agency}
      tenants={agencyOverview.tenants}
    />
  );
}
