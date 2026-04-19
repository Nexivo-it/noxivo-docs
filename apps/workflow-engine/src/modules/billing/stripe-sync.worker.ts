import { AgencyModel } from '@noxivo/database';
import { BillingMeterWindowModel } from '@noxivo/database';

const PREMIUM_PLANS = new Set(['reseller_pro', 'enterprise']);

function hasDelinquentBillingState(status: string): boolean {
  return status === 'suspended' || status === 'cancelled';
}

export interface StripeMeterEventRequest {
  eventName: string;
  identifier: string;
  timestamp: number;
  payload: {
    stripe_customer_id: string;
    value: string;
  };
}

export interface StripeMeterEventResponse {
  id: string;
}

export interface StripeMeterClient {
  createMeterEvent(
    input: StripeMeterEventRequest,
    options: { idempotencyKey: string }
  ): Promise<StripeMeterEventResponse>;
}

export class StripeSyncWorker {
  constructor(private readonly stripeClient: StripeMeterClient) {}

  static buildStripeIdentifier(input: {
    agencyId: string;
    metric: string;
    windowStart: Date;
  }): string {
    return `evt_${input.agencyId}_${input.metric}_${input.windowStart.toISOString()}`;
  }

  async syncPendingWindows(limit = 100): Promise<{ synced: number; failed: number; skipped: number }> {
    const windows = await BillingMeterWindowModel.find({
      syncStatus: { $in: ['pending', 'failed'] },
      usageTotal: { $gt: 0 }
    })
      .sort({ windowStart: 1 })
      .limit(limit)
      .lean()
      .exec();

    let synced = 0;
    let failed = 0;
    let skipped = 0;

    for (const window of windows) {
      const agency = await AgencyModel.findById(window.agencyId).lean().exec();
      if (!agency?.billingStripeCustomerId) {
        await BillingMeterWindowModel.findByIdAndUpdate(window._id, {
          syncStatus: 'failed'
        }).exec();
        failed += 1;
        continue;
      }

      const identifier = StripeSyncWorker.buildStripeIdentifier({
        agencyId: window.agencyId,
        metric: window.metric,
        windowStart: window.windowStart
      });

      try {
        const meterEvent = await this.stripeClient.createMeterEvent(
          {
            eventName: window.metric,
            identifier,
            timestamp: Math.floor(window.windowStart.getTime() / 1000),
            payload: {
              stripe_customer_id: agency.billingStripeCustomerId,
              value: String(window.usageTotal)
            }
          },
          {
            idempotencyKey: identifier
          }
        );

        await BillingMeterWindowModel.findByIdAndUpdate(window._id, {
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
          stripeMeterEventId: meterEvent.id
        }).exec();
        synced += 1;
      } catch {
        await BillingMeterWindowModel.findByIdAndUpdate(window._id, {
          syncStatus: 'failed'
        }).exec();
        failed += 1;
      }
    }

    if (windows.length === 0) {
      skipped = 1;
    }

    return { synced, failed, skipped };
  }
}

export class AgencyEntitlementService {
  async canUsePremiumFeature(agencyId: string): Promise<boolean> {
    const agency = await AgencyModel.findById(agencyId).lean().exec();
    if (!agency) {
      return false;
    }

    const hasPremiumPlan = PREMIUM_PLANS.has(agency.plan);
    const hasValidBillingIdentity = Boolean(
      agency.billingStripeCustomerId && agency.billingStripeSubscriptionId
    );

    if (!hasPremiumPlan) {
      return false;
    }

    if (hasDelinquentBillingState(agency.status)) {
      return false;
    }

    return hasValidBillingIdentity;
  }

  canIngestWebhook(): boolean {
    return true;
  }
}
