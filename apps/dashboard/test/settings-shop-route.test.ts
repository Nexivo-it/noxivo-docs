import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { AgencyModel, DataSourceModel, PluginInstallationModel, TenantCredentialModel } from '@noxivo/database';
import { getShopPermissionsForPlan } from '../lib/settings/shop-permissions.js';
import { GET as getShopSettings, POST as updateShopProvider } from '../app/api/settings/shop/route.js';
import {
  connectDashboardTestDb,
  disconnectDashboardTestDb,
  resetDashboardTestDb
} from './helpers/mongo-memory.js';

const { mockGetCurrentSession } = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn()
}));

vi.mock('../lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession
}));

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/settings/shop', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function createAgencyWithPlan(input: { agencyId: string; ownerId: string; plan: 'reseller_basic' | 'reseller_pro' | 'enterprise' }): Promise<void> {
  const slugPlan = input.plan.replaceAll('_', '-');
  await AgencyModel.create({
    _id: new mongoose.Types.ObjectId(input.agencyId),
    name: `Agency ${input.plan}`,
    slug: `agency-${slugPlan}-${input.agencyId.slice(-6)}`,
    plan: input.plan,
    status: 'active',
    billingOwnerUserId: new mongoose.Types.ObjectId(input.ownerId),
    usageLimits: { tenants: 10, activeSessions: 100 },
    whiteLabelDefaults: {
      customDomain: null,
      logoUrl: null,
      primaryColor: '#000000',
      supportEmail: 'support@example.com',
      hidePlatformBranding: false
    }
  });
}

describe('shop permissions', () => {
  it('disables both providers for reseller_basic', () => {
    expect(getShopPermissionsForPlan('reseller_basic')).toEqual({
      shopify: false,
      woocommerce: false,
    });
  });

  it('falls back to reseller_basic permissions for unknown plans', () => {
    expect(getShopPermissionsForPlan('starter_trial')).toEqual({
      shopify: false,
      woocommerce: false,
    });
  });

  it('falls back to reseller_basic permissions for inherited object keys', () => {
    expect(getShopPermissionsForPlan('toString')).toEqual({
      shopify: false,
      woocommerce: false,
    });
  });

  it('returns a defensive copy so callers cannot mutate global permissions', () => {
    const unknownPlanPermissions = getShopPermissionsForPlan('starter_trial');
    unknownPlanPermissions.shopify = true;

    expect(getShopPermissionsForPlan('starter_trial')).toEqual({
      shopify: false,
      woocommerce: false,
    });
  });
});

describe('settings shop route', () => {
  beforeAll(async () => {
    await connectDashboardTestDb({ dbName: 'noxivo-dashboard-settings-shop-tests' });
  });

  beforeEach(() => {
    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId: new mongoose.Types.ObjectId().toString(),
        tenantId: new mongoose.Types.ObjectId().toString(),
        tenantIds: [new mongoose.Types.ObjectId().toString()],
        email: 'admin@example.com',
        fullName: 'Admin User',
        role: 'agency_admin',
        scopeRole: 'agency_admin',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60_000)
    });
  });

  afterEach(async () => {
    mockGetCurrentSession.mockReset();
    await resetDashboardTestDb();
  });

  afterAll(async () => {
    await disconnectDashboardTestDb();
  });

  it('returns provider status for shopify and woocommerce', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();
    const syncedAt = new Date('2026-04-18T09:12:00.000Z');

    await createAgencyWithPlan({ agencyId, ownerId: userId, plan: 'reseller_pro' });

    await TenantCredentialModel.create({
      agencyId,
      tenantId,
      provider: 'shopify',
      displayName: 'Shopify Main',
      encryptedData: JSON.stringify({ accessToken: 'shpat_test_token' }),
      config: { storeUrl: 'acme-shop.myshopify.com' },
      status: 'active'
    });

    await DataSourceModel.create({
      agencyId,
      tenantId,
      pluginId: 'shop',
      providerType: 'shopify',
      displayName: 'Shopify Main',
      enabled: true,
      config: { storeUrl: 'acme-shop.myshopify.com' },
      healthStatus: 'healthy',
      lastSyncedAt: syncedAt
    });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId,
        agencyId,
        tenantId,
        tenantIds: [tenantId],
        email: 'admin@example.com',
        fullName: 'Admin User',
        role: 'agency_admin',
        scopeRole: 'agency_admin',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60_000)
    });

    const response = await getShopSettings();
    const payload = await response.json() as {
      providers: Array<{
        provider: 'shopify' | 'woocommerce';
        entitled: boolean;
        configured: boolean;
        enabled: boolean;
        credentialStatus: string;
        lastSyncedAt: string | null;
      }>;
    };

    expect(response.status).toBe(200);
    expect(payload.providers).toEqual([
      {
        provider: 'shopify',
        entitled: true,
        configured: true,
        enabled: true,
        credentialStatus: 'active',
        lastSyncedAt: syncedAt.toISOString()
      },
      {
        provider: 'woocommerce',
        entitled: true,
        configured: false,
        enabled: false,
        credentialStatus: 'missing',
        lastSyncedAt: null
      }
    ]);
  });

  it('rejects activation on non-entitled agency plans', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    await createAgencyWithPlan({ agencyId, ownerId: userId, plan: 'reseller_basic' });

    await TenantCredentialModel.create({
      agencyId,
      tenantId,
      provider: 'shopify',
      displayName: 'Shopify Main',
      encryptedData: JSON.stringify({ accessToken: 'shpat_test_token' }),
      config: { storeUrl: 'acme-shop.myshopify.com' },
      status: 'active'
    });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId,
        agencyId,
        tenantId,
        tenantIds: [tenantId],
        email: 'admin@example.com',
        fullName: 'Admin User',
        role: 'agency_admin',
        scopeRole: 'agency_admin',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60_000)
    });

    const response = await updateShopProvider(makeRequest({ provider: 'shopify', enabled: true }));
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Provider not available on current plan');
  });

  it('returns 400 for unsupported provider payloads', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    await createAgencyWithPlan({ agencyId, ownerId: userId, plan: 'reseller_pro' });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId,
        agencyId,
        tenantId,
        tenantIds: [tenantId],
        email: 'admin@example.com',
        fullName: 'Admin User',
        role: 'agency_admin',
        scopeRole: 'agency_admin',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60_000)
    });

    const response = await updateShopProvider(makeRequest({ provider: 'hubspot', enabled: true }));
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Invalid payload');
  });

  it('returns 409 when enabling provider without credentials', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    await createAgencyWithPlan({ agencyId, ownerId: userId, plan: 'reseller_pro' });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId,
        agencyId,
        tenantId,
        tenantIds: [tenantId],
        email: 'admin@example.com',
        fullName: 'Admin User',
        role: 'agency_admin',
        scopeRole: 'agency_admin',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60_000)
    });

    const response = await updateShopProvider(makeRequest({ provider: 'shopify', enabled: true }));
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(409);
    expect(payload.error).toBe('Provider credentials are required before activation');
  });

  it('returns 409 when enabling provider with inactive credentials', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    await createAgencyWithPlan({ agencyId, ownerId: userId, plan: 'reseller_pro' });

    await TenantCredentialModel.create({
      agencyId,
      tenantId,
      provider: 'shopify',
      displayName: 'Shopify Main',
      encryptedData: JSON.stringify({ accessToken: 'shpat_test_token' }),
      config: { storeUrl: 'acme-shop.myshopify.com' },
      status: 'expired'
    });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId,
        agencyId,
        tenantId,
        tenantIds: [tenantId],
        email: 'admin@example.com',
        fullName: 'Admin User',
        role: 'agency_admin',
        scopeRole: 'agency_admin',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60_000)
    });

    const response = await updateShopProvider(makeRequest({ provider: 'shopify', enabled: true }));
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(409);
    expect(payload.error).toBe('Provider credentials are required before activation');
  });

  it('activates a provider and mirrors enablement into plugin + data source state', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    await createAgencyWithPlan({ agencyId, ownerId: userId, plan: 'reseller_pro' });

    await TenantCredentialModel.create({
      agencyId,
      tenantId,
      provider: 'shopify',
      displayName: 'Shopify Main',
      encryptedData: JSON.stringify({ accessToken: 'shpat_test_token' }),
      config: { storeUrl: 'acme-shop.myshopify.com' },
      status: 'active'
    });

    await DataSourceModel.create({
      agencyId,
      tenantId,
      pluginId: 'shop',
      providerType: 'shopify',
      displayName: 'Shopify Main',
      enabled: false,
      config: { storeUrl: 'acme-shop.myshopify.com' },
      healthStatus: 'disabled'
    });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId,
        agencyId,
        tenantId,
        tenantIds: [tenantId],
        email: 'admin@example.com',
        fullName: 'Admin User',
        role: 'agency_admin',
        scopeRole: 'agency_admin',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60_000)
    });

    const response = await updateShopProvider(makeRequest({ provider: 'shopify', enabled: true }));
    expect(response.status).toBe(200);

    const installation = await PluginInstallationModel.findOne({
      agencyId,
      tenantId,
      pluginId: 'shop'
    }).lean().exec();

    expect(installation).toBeTruthy();
    expect(installation?.pluginVersion).toBe('1.0.0');
    expect(installation?.config).toMatchObject({ enabledProviders: ['shopify'] });

    const dataSource = await DataSourceModel.findOne({
      agencyId,
      tenantId,
      pluginId: 'shop',
      providerType: 'shopify'
    }).lean().exec();

    expect(dataSource?.enabled).toBe(true);
  });

  it('deactivates a provider and removes it from enabledProviders', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    await createAgencyWithPlan({ agencyId, ownerId: userId, plan: 'reseller_pro' });

    await TenantCredentialModel.create({
      agencyId,
      tenantId,
      provider: 'shopify',
      displayName: 'Shopify Main',
      encryptedData: JSON.stringify({ accessToken: 'shpat_test_token' }),
      config: { storeUrl: 'acme-shop.myshopify.com' },
      status: 'active'
    });

    await DataSourceModel.create({
      agencyId,
      tenantId,
      pluginId: 'shop',
      providerType: 'shopify',
      displayName: 'Shopify Main',
      enabled: true,
      config: { storeUrl: 'acme-shop.myshopify.com' },
      healthStatus: 'healthy'
    });

    await PluginInstallationModel.create({
      agencyId,
      tenantId,
      pluginId: 'shop',
      pluginVersion: '1.0.0',
      enabled: true,
      config: { enabledProviders: ['shopify', 'woocommerce'] }
    });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId,
        agencyId,
        tenantId,
        tenantIds: [tenantId],
        email: 'admin@example.com',
        fullName: 'Admin User',
        role: 'agency_admin',
        scopeRole: 'agency_admin',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60_000)
    });

    const response = await updateShopProvider(makeRequest({ provider: 'shopify', enabled: false }));
    expect(response.status).toBe(200);

    const installation = await PluginInstallationModel.findOne({
      agencyId,
      tenantId,
      pluginId: 'shop'
    }).lean().exec();

    expect(installation?.config).toMatchObject({ enabledProviders: ['woocommerce'] });

    const dataSource = await DataSourceModel.findOne({
      agencyId,
      tenantId,
      pluginId: 'shop',
      providerType: 'shopify'
    }).lean().exec();

    expect(dataSource?.enabled).toBe(false);
  });
});
