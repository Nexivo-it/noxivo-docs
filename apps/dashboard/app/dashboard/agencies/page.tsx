import { redirect } from 'next/navigation';
import { requireCurrentSession } from '../../../lib/auth/current-user';
import { canManageAgencies } from '../../../lib/auth/authorization';
import type { AgencyListItem } from '../../../lib/dashboard/queries';
import { workflowEngineServerFetch } from '../../../lib/api/workflow-engine-server';
import { AgenciesClientPage } from './agencies-client';

export const dynamic = 'force-dynamic';

export default async function AgenciesPage() {
  const session = await requireCurrentSession();

  if (!canManageAgencies(session)) {
    redirect('/dashboard/agency');
  }

  const agencies = await workflowEngineServerFetch<AgencyListItem[]>('/api/v1/agencies');

  return <AgenciesClientPage agencies={agencies} />;
}
