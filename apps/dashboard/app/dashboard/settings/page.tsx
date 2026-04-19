import { redirect } from 'next/navigation';
import { requireCurrentSession } from '../../../lib/auth/current-user';
import { canManageAgencySettings } from '../../../lib/auth/authorization';
import { SettingsClient } from './settings-client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireCurrentSession();

  if (!canManageAgencySettings(session)) {
    redirect('/dashboard/conversations');
  }

  return <SettingsClient />;
}
