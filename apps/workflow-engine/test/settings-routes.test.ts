import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AgencyModel,
  ApiKeyModel,
  AuthSessionModel,
  DataSourceModel,
  MediaStorageConfigModel,
  MessagingClusterModel,
  MessagingSessionBindingModel,
  NotificationModel,
  PluginInstallationModel,
  TenantCredentialModel,
  TenantModel,
  UserModel,
  WebhookInboxActivationModel,
  WebhookInboxSourceModel,
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
    expiresAt: new Date(Date.now() + 120_000),
    lastSeenAt: new Date(),
  });

  return `noxivo_session=${encodeURIComponent(token)}`;
}

async function seedSettingsActor() {
  const agencyId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const clusterId = new mongoose.Types.ObjectId();

  await AgencyModel.create({
    _id: agencyId,
    name: 'Settings Agency',
    slug: `settings-${agencyId.toString().slice(-6)}`,
    plan: 'reseller_pro',
    billingStripeCustomerId: null,
    billingStripeSubscriptionId: null,
    billingOwnerUserId: userId,
    whiteLabelDefaults: {
      customDomain: null,
      logoUrl: null,
      primaryColor: '#6366F1',
      supportEmail: 'ops@settings.test',
      hidePlatformBranding: false,
    },
    usageLimits: { tenants: 5, activeSessions: 20 },
    status: 'active',
  });

  await TenantModel.create({
    _id: tenantId,
    agencyId,
    slug: `tenant-${tenantId.toString().slice(-6)}`,
    name: 'Settings Tenant',
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
    email: 'settings-admin@test.dev',
    fullName: 'Settings Admin',
    passwordHash: 'hash',
    role: 'agency_admin',
    status: 'active',
  });

  await MessagingClusterModel.create({
    _id: clusterId,
    name: 'Settings Cluster',
    region: 'us-east-1',
    baseUrl: 'https://messaging.test',
    dashboardUrl: 'https://messaging.test/dashboard',
    swaggerUrl: 'https://messaging.test/docs',
    capacity: 10,
    activeSessionCount: 1,
    status: 'active',
    secretRefs: { webhookSecretVersion: 'v1' },
  });

  await MessagingSessionBindingModel.create({
    agencyId,
    tenantId,
    clusterId,
    sessionName: 'settings-whatsapp',
    messagingSessionName: 'settings-whatsapp',
    status: 'active',
    routingMetadata: {
      agencyId: agencyId.toString(),
      tenantId: tenantId.toString(),
      clusterId: clusterId.toString(),
    },
  });

  return { agencyId, tenantId, userId };
}

describe('settings routes on workflow-engine', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-workflow-engine-settings-routes-tests' });
    await Promise.all([
      AgencyModel.init(),
      TenantModel.init(),
      UserModel.init(),
      AuthSessionModel.init(),
      TenantCredentialModel.init(),
      DataSourceModel.init(),
      PluginInstallationModel.init(),
      MediaStorageConfigModel.init(),
      ApiKeyModel.init(),
      WebhookInboxActivationModel.init(),
      WebhookInboxSourceModel.init(),
      MessagingSessionBindingModel.init(),
      MessagingClusterModel.init(),
      NotificationModel.init(),
    ]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.MESSAGING_PROVIDER_BASE_URL;
    delete process.env.MESSAGING_PROVIDER_PROXY_BASE_URL;
    delete process.env.MESSAGING_PROVIDER_API_KEY;
    delete process.env.ENGINE_API_KEY;
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('owns credentials, shop, storage, webhook inbox source, and activation settings endpoints', async () => {
    const actor = await seedSettingsActor();
    const cookie = await createSessionCookie(actor);

    const server = await buildServer({ logger: false });

    try {
      const createCredential = await server.inject({
        method: 'POST',
        url: '/api/v1/settings/credentials',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          provider: 'shopify',
          displayName: 'Shopify Main',
          secret: { accessToken: 'shpat_test_token' },
          config: { storeUrl: 'acme-shop.myshopify.com', apiVersion: '2025-01' },
        },
      });

      expect(createCredential.statusCode).toBe(200);

      const listCredentials = await server.inject({
        method: 'GET',
        url: '/api/v1/settings/credentials',
        headers: { cookie },
      });

      expect(listCredentials.statusCode).toBe(200);
      const credentialsPayload = listCredentials.json() as {
        credentials: Array<{ provider: string; displayName: string; status: string }>;
      };
      expect(credentialsPayload.credentials).toEqual([
        expect.objectContaining({
          provider: 'shopify',
          displayName: 'Shopify Main',
          status: 'active',
        }),
      ]);

      const shopEnableResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/settings/shop',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: { provider: 'shopify', enabled: true },
      });

      expect(shopEnableResponse.statusCode).toBe(200);
      expect(shopEnableResponse.json()).toEqual({ provider: 'shopify', enabled: true });

      const shopStatusResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/settings/shop',
        headers: { cookie },
      });
      expect(shopStatusResponse.statusCode).toBe(200);
      expect(shopStatusResponse.json()).toEqual({
        providers: [
          expect.objectContaining({ provider: 'shopify', configured: true, enabled: true, entitled: true }),
          expect.objectContaining({ provider: 'woocommerce', configured: false, enabled: false, entitled: true }),
        ],
      });

      const storagePutResponse = await server.inject({
        method: 'PUT',
        url: '/api/v1/settings/storage',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          provider: 'imagekit',
          isActive: true,
          publicBaseUrl: 'https://ik.imagekit.io/noxivo',
          publicConfig: { path: 'agency' },
          secretConfig: { privateKey: 'super-secret' },
          pathPrefix: 'assets',
        },
      });
      expect(storagePutResponse.statusCode).toBe(200);
      expect(storagePutResponse.json()).toEqual(
        expect.objectContaining({
          provider: 'imagekit',
          secretConfig: { privateKey: '***REDACTED***' },
        }),
      );

      const storageGetResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/settings/storage',
        headers: { cookie },
      });
      expect(storageGetResponse.statusCode).toBe(200);
      expect(storageGetResponse.json()).toEqual(
        expect.objectContaining({
          provider: 'imagekit',
          secretConfig: { privateKey: '***REDACTED***' },
        }),
      );

      const sourceCreateResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/settings/webhook-inbox-sources',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Website Chatbot',
          outboundUrl: 'https://example.com/outbound',
          inboundSecret: 'test-secret',
          outboundHeaders: { Authorization: 'Bearer token' },
        },
      });
      expect(sourceCreateResponse.statusCode).toBe(201);
      const sourceCreatePayload = sourceCreateResponse.json() as {
        source: { id: string; inboundPath: string; status: 'active'; name: string };
      };
      expect(sourceCreatePayload.source).toEqual(
        expect.objectContaining({
          name: 'Website Chatbot',
          status: 'active',
        }),
      );
      expect(sourceCreatePayload.source.inboundPath.length).toBeGreaterThan(0);

      const sourcePatchResponse = await server.inject({
        method: 'PATCH',
        url: `/api/v1/settings/webhook-inbox-sources/${sourceCreatePayload.source.id}`,
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          status: 'disabled',
        },
      });
      expect(sourcePatchResponse.statusCode).toBe(200);

      const sourceListResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/settings/webhook-inbox-sources',
        headers: { cookie },
      });
      expect(sourceListResponse.statusCode).toBe(200);
      expect(sourceListResponse.json()).toEqual({
        sources: [
          expect.objectContaining({
            id: sourceCreatePayload.source.id,
            status: 'disabled',
          }),
        ],
      });

      const activationPostResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/settings/webhook-inbox-activation',
        headers: { cookie },
      });
      expect(activationPostResponse.statusCode).toBe(200);
      expect(activationPostResponse.json()).toEqual(
        expect.objectContaining({
          isActive: true,
          webhookUrl: expect.any(String),
          apiKey: expect.stringMatching(/^wbi_/),
        }),
      );

      const activationGetResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/settings/webhook-inbox-activation',
        headers: { cookie },
      });
      expect(activationGetResponse.statusCode).toBe(200);
      expect(activationGetResponse.json()).toEqual(
        expect.objectContaining({ isActive: true }),
      );
    } finally {
      await server.close();
    }
  });

  it('owns developer-api and whatsapp settings session endpoints', async () => {
    process.env.ENGINE_API_KEY = 'engine-master-key';
    process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-api-key';

    const actor = await seedSettingsActor();
    const cookie = await createSessionCookie(actor);

    await ApiKeyModel.create({
      key: 'nx_existing_key',
      agencyId: actor.agencyId,
      tenantId: actor.tenantId,
      name: 'existing',
      status: 'active',
    });

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/sessions/settings-whatsapp')) {
        return new Response(JSON.stringify({ status: 'SCAN_QR_CODE', me: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.includes('/api/settings-whatsapp/auth/qr?format=raw')) {
        return new Response(JSON.stringify({ qr: 'qr-token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/api/settings-whatsapp/profile')) {
        return new Response(JSON.stringify({ id: '15550001111@c.us', name: 'Settings Account' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/api/sessions/settings-whatsapp/start')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/api/sessions/settings-whatsapp/restart')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/api/sessions/settings-whatsapp/logout')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/api/sessions/settings-whatsapp/stop')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }));

    const server = await buildServer({ logger: false });

    try {
      const developerGetResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/settings/developer-api',
        headers: { cookie },
      });
      expect(developerGetResponse.statusCode).toBe(200);
      expect(developerGetResponse.json()).toEqual({ key: 'nx_existing_key', status: 'active' });

      await MessagingSessionBindingModel.findOneAndUpdate(
        {
          agencyId: actor.agencyId,
          tenantId: actor.tenantId,
        },
        {
          $set: {
            status: 'active',
          },
        },
        {
          new: true,
        },
      ).exec();

      const developerPostResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/settings/developer-api',
        headers: { cookie },
      });
      expect(developerPostResponse.statusCode).toBe(200);
      expect(developerPostResponse.json()).toEqual(expect.objectContaining({ key: expect.stringMatching(/^nx_/) }));

      const developerDeleteResponse = await server.inject({
        method: 'DELETE',
        url: '/api/v1/settings/developer-api',
        headers: { cookie },
      });
      expect(developerDeleteResponse.statusCode).toBe(200);
      expect(developerDeleteResponse.json()).toEqual({ success: true });

      const whatsappCheckResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/settings/whatsapp-check',
        headers: { cookie },
      });
      expect(whatsappCheckResponse.statusCode).toBe(200);
      expect(whatsappCheckResponse.json()).toEqual(
        expect.objectContaining({
          state: 'qr_ready',
          qrValue: 'qr-token',
        }),
      );

      const qrGetResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/settings/qr',
        headers: { cookie },
      });
      expect(qrGetResponse.statusCode).toBe(200);
      expect(qrGetResponse.json()).toEqual(
        expect.objectContaining({
          state: 'qr_ready',
          qrValue: 'qr-token',
        }),
      );

      const qrPostResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/settings/qr',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: { action: 'regenerate' },
      });
      expect(qrPostResponse.statusCode).toBe(200);
      expect(qrPostResponse.json()).toEqual(
        expect.objectContaining({
          restarted: true,
          qrValue: 'qr-token',
        }),
      );

      const qrDeleteResponse = await server.inject({
        method: 'DELETE',
        url: '/api/v1/settings/qr',
        headers: { cookie },
      });
      expect(qrDeleteResponse.statusCode).toBe(200);
      expect(qrDeleteResponse.json()).toEqual(
        expect.objectContaining({
          ok: true,
        }),
      );
    } finally {
      await server.close();
    }
  });

  it('owns notifications and imagekit auth support endpoints', async () => {
    const actor = await seedSettingsActor();
    const cookie = await createSessionCookie(actor);

    await MediaStorageConfigModel.create({
      agencyId: actor.agencyId,
      provider: 'imagekit',
      isActive: true,
      publicBaseUrl: 'https://ik.imagekit.io/noxivo',
      publicConfig: {
        publicKey: 'public_test_key',
      },
      secretConfig: {
        privateKey: 'private_test_key',
      },
      pathPrefix: 'assets',
    });

    await NotificationModel.create({
      agencyId: actor.agencyId,
      tenantId: actor.tenantId,
      type: 'workflow_failure',
      title: 'Workflow failed',
      message: 'Failure in production flow',
      severity: 'error',
      isRead: false,
      metadata: {
        workflowId: 'workflow-1',
      },
      createdAt: new Date(),
    });

    const server = await buildServer({ logger: false });

    try {
      const notificationsGetResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/settings/notifications',
        headers: { cookie },
      });

      expect(notificationsGetResponse.statusCode).toBe(200);
      expect(notificationsGetResponse.json()).toEqual({
        notifications: [
          expect.objectContaining({
            title: 'Workflow failed',
            isRead: false,
          }),
        ],
        unreadCount: 1,
      });

      const notificationId = (notificationsGetResponse.json() as {
        notifications: Array<{ id: string }>;
      }).notifications[0]?.id;

      expect(notificationId).toBeTruthy();

      const markAsReadResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/settings/notifications',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          action: 'markAsRead',
          notificationId,
        },
      });

      expect(markAsReadResponse.statusCode).toBe(200);
      expect(markAsReadResponse.json()).toEqual({ success: true });

      const notificationsAfterRead = await server.inject({
        method: 'GET',
        url: '/api/v1/settings/notifications',
        headers: { cookie },
      });
      expect(notificationsAfterRead.statusCode).toBe(200);
      expect(notificationsAfterRead.json()).toEqual({
        notifications: [
          expect.objectContaining({
            id: notificationId,
            isRead: true,
          }),
        ],
        unreadCount: 0,
      });

      const imagekitAuthResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/settings/imagekit-auth',
        headers: { cookie },
      });

      expect(imagekitAuthResponse.statusCode).toBe(200);
      expect(imagekitAuthResponse.json()).toEqual(
        expect.objectContaining({
          signature: expect.any(String),
          token: expect.any(String),
          expire: expect.any(Number),
          publicKey: 'public_test_key',
        }),
      );
    } finally {
      await server.close();
    }
  });
});
