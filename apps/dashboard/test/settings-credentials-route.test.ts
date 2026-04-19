import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { DataSourceModel, TenantCredentialModel } from '@noxivo/database';
import { GET as getCredentials, POST as upsertCredential } from '../app/api/settings/credentials/route.js';
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

function makeRequest(method: 'GET' | 'POST', body?: unknown): Request {
  return new Request('http://localhost/api/settings/credentials', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : null
  });
}

describe('settings credentials route', () => {
  beforeAll(async () => {
    await connectDashboardTestDb({ dbName: 'noxivo-dashboard-settings-credentials-tests' });
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

  it('returns 401 for unauthenticated requests', async () => {
    mockGetCurrentSession.mockResolvedValue(null);

    const response = await getCredentials();
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Unauthorized');
  });

  it('returns 403 when actor lacks credential management scope', async () => {
    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId: new mongoose.Types.ObjectId().toString(),
        tenantId: new mongoose.Types.ObjectId().toString(),
        tenantIds: [new mongoose.Types.ObjectId().toString()],
        email: 'agent@example.com',
        fullName: 'Agent User',
        role: 'agency_member',
        scopeRole: 'agent',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60_000)
    });

    const response = await getCredentials();
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
  });

  it('returns 409 when no tenant scope exists in current context', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId,
        tenantId: '',
        tenantIds: [],
        email: 'admin@example.com',
        fullName: 'Admin User',
        role: 'agency_admin',
        scopeRole: 'agency_admin',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60_000)
    });

    const response = await upsertCredential(makeRequest('POST', {
      provider: 'airtable',
      displayName: 'Airtable Workspace',
      secret: {
        apiKey: 'key-test'
      },
      config: {
        baseId: 'app123',
        tableId: 'tbl123'
      }
    }));

    const payload = await response.json() as { error: string };

    expect(response.status).toBe(409);
    expect(payload.error).toBe('No tenant workspace available for this agency context');
  });

  it('upserts Airtable credentials for agency-admin context', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
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

    const response = await upsertCredential(makeRequest('POST', {
      provider: 'airtable',
      displayName: 'Airtable Workspace',
      secret: {
        apiKey: 'key-test'
      },
      config: {
        baseId: 'app123',
        tableId: 'tbl123'
      }
    }));

    const payload = await response.json() as { provider: string; status: string };
    expect(response.status).toBe(200);
    expect(payload.provider).toBe('airtable');
    expect(payload.status).toBe('active');

    const record = await TenantCredentialModel.findOne({
      agencyId,
      tenantId,
      provider: 'airtable'
    }).lean().exec();

    expect(record).toBeTruthy();
    expect(record?.displayName).toBe('Airtable Workspace');
    expect(record?.encryptedData).toContain('key-test');
    expect(record?.config).toMatchObject({ baseId: 'app123', tableId: 'tbl123' });
  });

  it('upserts Shopify credentials for active tenant context', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
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

    const response = await upsertCredential(makeRequest('POST', {
      provider: 'shopify',
      displayName: 'Main Shopify Store',
      secret: {
        accessToken: 'shpat_test_token'
      },
      config: {
        storeUrl: 'acme-shop.myshopify.com',
        apiVersion: '2025-01'
      }
    }));

    const payload = await response.json() as { provider: string; status: string };
    expect(response.status).toBe(200);
    expect(payload.provider).toBe('shopify');
    expect(payload.status).toBe('active');

    const record = await TenantCredentialModel.findOne({
      agencyId,
      tenantId,
      provider: 'shopify'
    }).lean().exec();

    expect(record).toBeTruthy();
    expect(record?.displayName).toBe('Main Shopify Store');
    expect(record?.encryptedData).toContain('shpat_test_token');
    expect(record?.config).toMatchObject({
      storeUrl: 'acme-shop.myshopify.com',
      apiVersion: '2025-01'
    });

    const dataSourceRecord = await DataSourceModel.findOne({
      agencyId,
      tenantId,
      pluginId: 'shop',
      providerType: 'shopify'
    }).lean().exec();

    expect(dataSourceRecord).toBeTruthy();
    expect(dataSourceRecord?.displayName).toBe('Main Shopify Store');
    expect(dataSourceRecord?.enabled).toBe(false);
    expect(dataSourceRecord?.healthStatus).toBe('disabled');
    expect(dataSourceRecord?.credentialRef?.toString()).toBe(record?._id.toString());
    expect(dataSourceRecord?.config).toMatchObject({
      storeUrl: 'acme-shop.myshopify.com',
      apiVersion: '2025-01',
      syncMode: 'hybrid',
      cacheTtlSeconds: 300
    });
  });

  it('upserts WooCommerce credentials and persists non-secret config', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
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

    const response = await upsertCredential(makeRequest('POST', {
      provider: 'woocommerce',
      displayName: 'Main Woo Store',
      secret: {
        consumerKey: 'ck_test',
        consumerSecret: 'cs_test'
      },
      config: {
        storeUrl: 'https://acme.example.com',
        apiBasePath: '/wp-json/wc/v3'
      }
    }));

    const payload = await response.json() as { provider: string; status: string };
    expect(response.status).toBe(200);
    expect(payload.provider).toBe('woocommerce');
    expect(payload.status).toBe('active');

    const credentialRecord = await TenantCredentialModel.findOne({
      agencyId,
      tenantId,
      provider: 'woocommerce'
    }).lean().exec();

    expect(credentialRecord).toBeTruthy();
    expect(credentialRecord?.displayName).toBe('Main Woo Store');
    expect(credentialRecord?.encryptedData).toContain('ck_test');
    expect(credentialRecord?.encryptedData).toContain('cs_test');
    expect(credentialRecord?.config).toMatchObject({
      storeUrl: 'https://acme.example.com',
      apiBasePath: '/wp-json/wc/v3'
    });

    const dataSourceRecord = await DataSourceModel.findOne({
      agencyId,
      tenantId,
      pluginId: 'shop',
      providerType: 'woocommerce'
    }).lean().exec();

    expect(dataSourceRecord).toBeTruthy();
    expect(dataSourceRecord?.displayName).toBe('Main Woo Store');
    expect(dataSourceRecord?.enabled).toBe(false);
    expect(dataSourceRecord?.healthStatus).toBe('disabled');
    expect(dataSourceRecord?.credentialRef?.toString()).toBe(credentialRecord?._id.toString());
    expect(dataSourceRecord?.config).toMatchObject({
      storeUrl: 'https://acme.example.com',
      apiBasePath: '/wp-json/wc/v3',
      syncMode: 'hybrid',
      cacheTtlSeconds: 300
    });
  });

  it('returns Shopify and WooCommerce credentials in GET payload', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    await TenantCredentialModel.create([
      {
        agencyId,
        tenantId,
        provider: 'shopify',
        displayName: 'Shopify Main',
        encryptedData: JSON.stringify({ accessToken: 'shpat_test_token' }),
        config: {
          storeUrl: 'acme-shop.myshopify.com',
          apiVersion: '2025-01',
          syncMode: 'hybrid',
          cacheTtlSeconds: 300
        },
        status: 'active'
      },
      {
        agencyId,
        tenantId,
        provider: 'woocommerce',
        displayName: 'Woo Main',
        encryptedData: JSON.stringify({ consumerKey: 'ck_test', consumerSecret: 'cs_test' }),
        config: {
          storeUrl: 'https://acme.example.com',
          apiBasePath: '/wp-json/wc/v3',
          syncMode: 'hybrid',
          cacheTtlSeconds: 300
        },
        status: 'active'
      }
    ]);

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
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

    const response = await getCredentials();
    const payload = await response.json() as {
      credentials: Array<{ provider: string; displayName: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.credentials).toHaveLength(2);
    expect(payload.credentials).toEqual([
      expect.objectContaining({
        provider: 'shopify',
        displayName: 'Shopify Main'
      }),
      expect.objectContaining({
        provider: 'woocommerce',
        displayName: 'Woo Main'
      })
    ]);
  });

  it('preserves existing shop datasource enabled and health when updating Shopify credentials', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    const existingCredential = await TenantCredentialModel.create({
      agencyId,
      tenantId,
      provider: 'shopify',
      displayName: 'Old Shopify Name',
      encryptedData: JSON.stringify({ accessToken: 'old_token' }),
      config: {
        storeUrl: 'old-shop.myshopify.com',
        apiVersion: '2024-10',
      },
      status: 'active'
    });

    await DataSourceModel.create({
      agencyId,
      tenantId,
      pluginId: 'shop',
      providerType: 'shopify',
      displayName: 'Old Shopify Name',
      enabled: true,
      credentialRef: existingCredential._id,
      config: {
        storeUrl: 'old-shop.myshopify.com',
        apiVersion: '2024-10',
        syncMode: 'hybrid',
        cacheTtlSeconds: 300
      },
      healthStatus: 'healthy'
    });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
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

    const response = await upsertCredential(makeRequest('POST', {
      provider: 'shopify',
      displayName: 'Renamed Shopify Store',
      secret: {
        accessToken: 'new_token'
      },
      config: {
        storeUrl: 'new-shop.myshopify.com',
        apiVersion: '2025-01'
      }
    }));

    expect(response.status).toBe(200);

    const updatedCredential = await TenantCredentialModel.findOne({
      agencyId,
      tenantId,
      provider: 'shopify'
    }).lean().exec();

    const dataSourceRecord = await DataSourceModel.findOne({
      agencyId,
      tenantId,
      pluginId: 'shop',
      providerType: 'shopify'
    }).lean().exec();

    expect(dataSourceRecord).toBeTruthy();
    expect(dataSourceRecord?.displayName).toBe('Renamed Shopify Store');
    expect(dataSourceRecord?.enabled).toBe(true);
    expect(dataSourceRecord?.healthStatus).toBe('healthy');
    expect(dataSourceRecord?.credentialRef?.toString()).toBe(updatedCredential?._id.toString());
    expect(dataSourceRecord?.config).toMatchObject({
      storeUrl: 'new-shop.myshopify.com',
      apiVersion: '2025-01',
      syncMode: 'hybrid',
      cacheTtlSeconds: 300
    });
  });

  it('returns 400 for invalid credential payload', async () => {
    const response = await upsertCredential(makeRequest('POST', {
      provider: 'hubspot',
      secret: {}
    }));
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Invalid credential payload');
  });

  it('allows client_admin and isolates GET results to active tenant context', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();
    const siblingTenantId = new mongoose.Types.ObjectId().toString();

    await TenantCredentialModel.create([
      {
        agencyId,
        tenantId,
        provider: 'google_sheets',
        displayName: 'Sheets Main',
        encryptedData: JSON.stringify({ clientEmail: 'svc@test.local', privateKey: 'private-key' }),
        config: { spreadsheetId: 'sheet-main', sheetName: 'Leads' },
        status: 'active'
      },
      {
        agencyId,
        tenantId: siblingTenantId,
        provider: 'airtable',
        displayName: 'Sibling Airtable',
        encryptedData: JSON.stringify({ apiKey: 'key-sibling' }),
        config: { baseId: 'app-sibling', tableId: 'tbl-sibling' },
        status: 'active'
      }
    ]);

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId,
        tenantId,
        tenantIds: [tenantId],
        email: 'client-admin@example.com',
        fullName: 'Client Admin',
        role: 'agency_member',
        scopeRole: 'client_admin',
        isClientContextActive: true,
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60_000)
    });

    const response = await getCredentials();
    const payload = await response.json() as {
      credentials: Array<{ provider: string; displayName: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.credentials).toHaveLength(1);
    expect(payload.credentials[0]).toMatchObject({
      provider: 'google_sheets',
      displayName: 'Sheets Main'
    });
  });
});
