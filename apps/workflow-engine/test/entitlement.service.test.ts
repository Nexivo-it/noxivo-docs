import { describe, expect, it } from 'vitest';
import { EntitlementService } from '../src/modules/access/entitlement.service';

describe('EntitlementService', () => {
  it('denies premium features for reseller_basic agencies', async () => {
    const entitlementService = new EntitlementService({
      agencyRepo: {
        findById: async () => ({
          id: 'agency-basic',
          plan: 'reseller_basic',
          status: 'active'
        })
      }
    });

    await expect(entitlementService.checkEntitlement({ agencyId: 'agency-basic', feature: 'premium_plugin' }))
      .resolves.toMatchObject({
        allowed: false,
        reason: 'Premium feature requires premium plan'
      });
  });

  it('allows AI actions for reseller_pro agencies in good standing', async () => {
    const entitlementService = new EntitlementService({
      agencyRepo: {
        findById: async () => ({
          id: 'agency-pro',
          plan: 'reseller_pro',
          status: 'active'
        })
      }
    });

    await expect(entitlementService.checkEntitlement({ agencyId: 'agency-pro', feature: 'ai_action' }))
      .resolves.toMatchObject({ allowed: true });
  });

  it('denies premium features for suspended enterprise agencies', async () => {
    const entitlementService = new EntitlementService({
      agencyRepo: {
        findById: async () => ({
          id: 'agency-enterprise',
          plan: 'enterprise',
          status: 'suspended'
        })
      }
    });

    await expect(entitlementService.checkEntitlement({ agencyId: 'agency-enterprise', feature: 'premium_plugin' }))
      .resolves.toMatchObject({
        allowed: false,
        reason: 'Agency subscription is delinquent'
      });
  });

  it('always allows webhook ingestion', async () => {
    const entitlementService = new EntitlementService({
      agencyRepo: {
        findById: async () => ({
          id: 'agency-webhook',
          plan: 'reseller_basic',
          status: 'cancelled'
        })
      }
    });

    await expect(entitlementService.checkEntitlement({ agencyId: 'agency-webhook', feature: 'webhook_ingestion' }))
      .resolves.toMatchObject({ allowed: true });
  });
});
