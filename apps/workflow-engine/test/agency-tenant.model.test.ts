import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AgencyModel, CustomDomainReservationModel, TenantModel } from '@noxivo/database';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('Agency and Tenant Multi-Tier Architecture', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({
      dbName: 'noxivo-model-tests'
    });
    await Promise.all([
      AgencyModel.init(),
      TenantModel.init(),
      CustomDomainReservationModel.init()
    ]);
  }, 60000);

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  }, 60000);

  it('requires agency ownership and validates white-label configuration', async () => {
    const agency = new AgencyModel({
      name: 'Acme Agency',
      slug: 'acme-agency',
      plan: 'reseller_pro',
      billingOwnerUserId: new mongoose.Types.ObjectId(),
      whiteLabelDefaults: {
        customDomain: 'portal.acme-agency.com',
        hidePlatformBranding: true,
        supportEmail: 'support@acme-agency.com',
        primaryColor: '#0F172A'
      },
      usageLimits: {
        tenants: 50,
        activeSessions: 500
      },
      status: 'active'
    });

    expect(agency.validateSync()).toBeUndefined();

    const tenantWithoutAgency = new TenantModel({
      slug: 'acme-dental',
      name: 'Acme Dental',
      region: 'eu-west-1',
      billingMode: 'agency_pays'
    });

    expect(tenantWithoutAgency.validateSync()?.errors.agencyId).toBeDefined();

    const tenant = new TenantModel({
      agencyId: agency._id,
      slug: 'acme-dental',
      name: 'Acme Dental',
      region: 'eu-west-1',
      billingMode: 'agency_pays',
      whiteLabelOverrides: {
        customDomain: 'app.acmedental.com',
        hidePlatformBranding: true
      }
    });

    expect(tenant.validateSync()).toBeUndefined();
    expect(tenant.whiteLabelOverrides?.customDomain).toBe('app.acmedental.com');
    expect(agency.whiteLabelDefaults.customDomain).toBe('portal.acme-agency.com');
  });

  it('enforces required billing fields on agencies', () => {
    const invalidAgency = new AgencyModel({
      name: 'Broken Agency',
      slug: 'broken-agency'
    });

    const validationError = invalidAgency.validateSync();

    expect(validationError?.errors.plan).toBeDefined();
    expect(validationError?.errors.billingOwnerUserId).toBeDefined();
    expect(validationError?.errors.whiteLabelDefaults).toBeDefined();
  });

  it('enforces unique custom domains across agencies and tenants', async () => {
    const sharedDomain = 'portal.acme.com';

    await CustomDomainReservationModel.create({
      domain: sharedDomain,
      ownerType: 'agency',
      ownerId: new mongoose.Types.ObjectId()
    });

    await expect(
      CustomDomainReservationModel.create({
        domain: sharedDomain,
        ownerType: 'tenant',
        ownerId: new mongoose.Types.ObjectId()
      })
    ).rejects.toThrow(/duplicate key/i);
  });
});
