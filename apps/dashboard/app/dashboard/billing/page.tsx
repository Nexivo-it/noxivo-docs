import { redirect } from 'next/navigation';
import { requireCurrentSession } from '../../../lib/auth/current-user';
import { canManageAgencySettings } from '../../../lib/auth/authorization';
import { workflowEngineServerFetch } from '../../../lib/api/workflow-engine-server';
import type { BillingPageData } from '../../../lib/api/dashboard-aggregates';
import { BillingClient } from './billing-client';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const session = await requireCurrentSession();
  if (!canManageAgencySettings(session)) {
    redirect('/dashboard/conversations');
  }
  const billingData = await workflowEngineServerFetch<BillingPageData>('/api/v1/dashboard-data/billing');

  return (
    <BillingClient data={billingData} />
  );
}
