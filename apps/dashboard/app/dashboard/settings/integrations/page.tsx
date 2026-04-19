import { redirect } from 'next/navigation';
import { requireCurrentSession } from '../../../../lib/auth/current-user';
import { canManageCredentials } from '../../../../lib/auth/authorization';
import { IntegrationsClient } from './integrations-client';

export const dynamic = 'force-dynamic';

export default async function IntegrationsSettingsPage() {
  const session = await requireCurrentSession();

  if (!canManageCredentials(session)) {
    redirect('/dashboard/conversations');
  }

  return <IntegrationsClient />;
}
