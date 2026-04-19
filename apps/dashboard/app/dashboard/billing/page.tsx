import { redirect } from 'next/navigation';
import { requireCurrentSession } from '../../../lib/auth/current-user';
import { canManageAgencySettings } from '../../../lib/auth/authorization';
import { queryBillingData } from '../../../lib/dashboard/queries';
import { BillingClient } from './billing-client';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const session = await requireCurrentSession();
  if (!canManageAgencySettings(session)) {
    redirect('/dashboard/conversations');
  }
  const billingData = await queryBillingData(session);

  return (
    <BillingClient data={billingData} />
  );
}
