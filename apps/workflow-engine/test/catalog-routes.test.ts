import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AgencyModel,
  AuthSessionModel,
  CatalogItemModel,
  CatalogSettingsModel,
  MediaStorageConfigModel,
  TenantModel,
  UserModel,
} from '@noxivo/database';
import { buildServer } from '../src/server.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb,
} from './helpers/mongo-memory.js';

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function createSessionCookie(input: {
  userId: mongoose.Types.ObjectId;
  agencyId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
}): Promise<string> {
  const token = `session-${new mongoose.Types.ObjectId().toString()}`;
  await AuthSessionModel.create({
    userId: input.userId,
    agencyId: input.agencyId,
    tenantId: input.tenantId,
    sessionTokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + 60_000),
    lastSeenAt: new Date(),
  });

  return `noxivo_session=${encodeURIComponent(token)}`;
}

async function seedSessionContext() {
  const agencyId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  await AgencyModel.create({
    _id: agencyId,
    name: 'Catalog Agency',
    slug: 'catalog-agency',
    plan: 'enterprise',
    billingStripeCustomerId: null,
    billingStripeSubscriptionId: null,
    billingOwnerUserId: userId,
    whiteLabelDefaults: {
      customDomain: null,
      logoUrl: null,
      primaryColor: '#6366F1',
      supportEmail: 'ops@catalog.test',
      hidePlatformBranding: false,
    },
    usageLimits: { tenants: 5, activeSessions: 25 },
    status: 'active',
  });

  await TenantModel.create({
    _id: tenantId,
    agencyId,
    slug: 'catalog-tenant',
    name: 'Catalog Tenant',
    region: 'us-east-1',
    status: 'active',
    billingMode: 'agency_pays',
    whiteLabelOverrides: {},
    effectiveBrandingCache: {},
  });

  await UserModel.create({
    _id: userId,
    agencyId,
    defaultTenantId: tenantId,
    tenantIds: [tenantId],
    email: 'catalog-admin@test.dev',
    fullName: 'Catalog Admin',
    passwordHash: 'hash',
    role: 'agency_admin',
    status: 'active',
  });

  return { agencyId, tenantId, userId };
}

describe('catalog module routes on workflow-engine', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-workflow-engine-catalog-routes-tests' });
    await Promise.all([
      AgencyModel.init(),
      TenantModel.init(),
      UserModel.init(),
      AuthSessionModel.init(),
      CatalogItemModel.init(),
      CatalogSettingsModel.init(),
      MediaStorageConfigModel.init(),
    ]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('supports catalog item CRUD and settings endpoints', async () => {
    const context = await seedSessionContext();
    const cookie = await createSessionCookie(context);

    await CatalogItemModel.create({
      tenantId: context.tenantId,
      itemType: 'service',
      name: 'Deluxe Cut',
      slug: 'deluxe-cut',
      priceAmount: 120,
      durationMinutes: 60,
      status: 'draft',
      sortOrder: 1,
      seoKeywords: ['hair', 'styling'],
    });

    await MediaStorageConfigModel.create({
      agencyId: context.agencyId,
      provider: 'imagekit',
      isActive: true,
      publicBaseUrl: 'https://ik.imagekit.io/noxivo',
      publicConfig: { path: 'catalog' },
      secretConfig: { privateKey: 'super-secret' },
      pathPrefix: 'agency-assets',
    });

    const server = await buildServer({ logger: false });

    try {
      const listResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/catalog',
        headers: { cookie },
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual({
        items: [expect.objectContaining({ name: 'Deluxe Cut', slug: 'deluxe-cut' })],
      });

      const createResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/catalog',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          payload: {
            name: 'Express Style',
            itemType: 'service',
            priceAmount: 45,
            durationMinutes: 30,
            status: 'ready',
          },
        },
      });

      expect(createResponse.statusCode).toBe(200);
      const createPayload = createResponse.json() as { item: { id: string; name: string } };
      expect(createPayload.item.name).toBe('Express Style');

      const getByIdResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/catalog/${createPayload.item.id}`,
        headers: { cookie },
      });

      expect(getByIdResponse.statusCode).toBe(200);
      expect(getByIdResponse.json()).toEqual(expect.objectContaining({ id: createPayload.item.id }));

      const patchResponse = await server.inject({
        method: 'PATCH',
        url: `/api/v1/catalog/${createPayload.item.id}`,
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Express Style Updated',
          seoKeywords: ['express', 'style'],
        },
      });

      expect(patchResponse.statusCode).toBe(200);
      expect(patchResponse.json()).toEqual(expect.objectContaining({ name: 'Express Style Updated' }));

      const deleteResponse = await server.inject({
        method: 'DELETE',
        url: `/api/v1/catalog/${createPayload.item.id}`,
        headers: { cookie },
      });

      expect(deleteResponse.statusCode).toBe(200);
      expect(deleteResponse.json()).toEqual({ success: true });

      const settingsGetResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/catalog/settings',
        headers: { cookie },
      });

      expect(settingsGetResponse.statusCode).toBe(200);
      expect(settingsGetResponse.json()).toEqual(
        expect.objectContaining({
          settings: expect.objectContaining({ tenantId: String(context.tenantId) }),
          storage: expect.objectContaining({
            provider: 'imagekit',
            secretConfig: { privateKey: '$$$$$$' },
          }),
        }),
      );

      const settingsPostResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/catalog/settings',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          businessName: 'Catalog Tenant Updated',
          currency: 'EUR',
          timezone: 'Europe/Paris',
          accentColor: '#111111',
          logoUrl: 'https://cdn.noxivo.app/logo.png',
          defaultDuration: 45,
          storage: {
            provider: 'imagekit',
            isActive: true,
            publicBaseUrl: 'https://ik.imagekit.io/noxivo',
            publicConfig: { path: 'catalog' },
            secretConfig: {
              privateKey: '$$$$$$',
              privateKeyAlt: 'alt-secret',
            },
            pathPrefix: 'agency-assets',
          },
        },
      });

      expect(settingsPostResponse.statusCode).toBe(200);
      const storedConfig = await MediaStorageConfigModel.findOne({ agencyId: context.agencyId }).lean();
      expect(storedConfig?.secretConfig).toEqual({
        privateKey: 'super-secret',
        privateKeyAlt: 'alt-secret',
      });
    } finally {
      await server.close();
    }
  });

  it('publishes catalog items to webhook destination', async () => {
    const context = await seedSessionContext();
    const cookie = await createSessionCookie(context);

    const catalogItem = await CatalogItemModel.create({
      tenantId: context.tenantId,
      itemType: 'service',
      name: 'Webhook Service',
      slug: 'webhook-service',
      shortDescription: 'Published via webhook',
      priceAmount: 99,
      durationMinutes: 55,
      status: 'ready',
      sortOrder: 0,
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/catalog/publish',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          destination: {
            type: 'webhook',
            url: 'https://hooks.example.dev/catalog',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(
        expect.objectContaining({
          total: 1,
          successful: 1,
          failed: 0,
        }),
      );
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://hooks.example.dev/catalog',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const payload = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body)) as {
        action: string;
        data: { name: string };
      };
      expect(payload.action).toBe('create_service');
      expect(payload.data.name).toBe(catalogItem.name);
    } finally {
      await server.close();
    }
  });

  it('accepts multipart form-data uploads with file field "file"', async () => {
    const context = await seedSessionContext();
    const cookie = await createSessionCookie(context);
    const server = await buildServer({ logger: false });

    const boundary = '----noxivo-catalog-upload-boundary';
    const fileContent = 'sample-upload-content';
    const multipartBody = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="menu.pdf"',
      'Content-Type: application/pdf',
      '',
      fileContent,
      `--${boundary}--`,
      '',
    ].join('\r\n');

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/catalog/upload',
        headers: {
          cookie,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: Buffer.from(multipartBody, 'utf8'),
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json() as {
        url: string;
        filename: string;
        type: string;
        isPdf: boolean;
      };
      expect(payload.url).toMatch(/^\/uploads\//);
      expect(payload.filename).toBe('menu.pdf');
      expect(payload.type).toBe('application/pdf');
      expect(payload.isPdf).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('rejects catalog routes without a session cookie', async () => {
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/catalog',
      });

      expect(response.statusCode).toBe(401);
    } finally {
      await server.close();
    }
  });
});
