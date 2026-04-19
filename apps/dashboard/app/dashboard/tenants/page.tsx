import { redirect } from 'next/navigation';
import { requireCurrentSession } from '../../../lib/auth/current-user';
import { canManageAgencySettings } from '../../../lib/auth/authorization';
import { queryAgencyOverview } from '../../../lib/dashboard/queries';
import { TenantsWorkspace } from '../../../components/tenants-workspace';

export const dynamic = 'force-dynamic';

export default async function TenantsPage() {
  const session = await requireCurrentSession();
  if (!canManageAgencySettings(session)) {
    redirect('/dashboard/conversations');
  }
  const agencyOverview = await queryAgencyOverview(session);

  return (
    <TenantsWorkspace
      actorRole={session.actor.role}
      agency={agencyOverview.agency}
      tenants={agencyOverview.tenants}
    />
  );
}
