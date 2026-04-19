import { redirect } from 'next/navigation';
import { requireCurrentSession } from '../../../lib/auth/current-user';
import { canManageAgencies } from '../../../lib/auth/authorization';
import { queryAgencies } from '../../../lib/dashboard/queries';
import { AgenciesClientPage } from './agencies-client';

export const dynamic = 'force-dynamic';

export default async function AgenciesPage() {
  const session = await requireCurrentSession();

  if (!canManageAgencies(session)) {
    redirect('/dashboard/agency');
  }

  const agencies = await queryAgencies(session);

  return <AgenciesClientPage agencies={agencies} />;
}
