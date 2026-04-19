import { NextResponse } from 'next/server';
import { AgencyModel } from '@noxivo/database';
import dbConnect from '../../../../lib/mongodb';
import { getCurrentSession } from '../../../../lib/auth/session';

export async function GET(_request: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await dbConnect();

  const agency = await AgencyModel.findById(session.actor.agencyId).lean();

  if (!agency) {
    return NextResponse.json({ error: 'Agency not found' }, { status: 404 });
  }

  const planInfo = {
    plan: agency.plan ?? 'reseller_basic',
    status: agency.status ?? 'trial',
    stripeCustomerId: agency.billingStripeCustomerId ?? null,
    subscriptionId: agency.billingStripeSubscriptionId ?? null
  };

  const featureFlags = {
    crmIntegration: ['reseller_pro', 'enterprise'].includes(planInfo.plan),
    advancedWorkflows: planInfo.plan === 'enterprise',
    customBranding: ['reseller_pro', 'enterprise'].includes(planInfo.plan),
    prioritySupport: planInfo.plan === 'enterprise'
  };

  return NextResponse.json({
    agencyId: agency._id.toString(),
    agencyName: agency.name,
    ...planInfo,
    features: featureFlags
  });
}