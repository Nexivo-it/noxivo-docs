import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import mongoose from 'mongoose';
import { ConversationModel, MessagingClusterModel, MessagingSessionBindingModel } from '@noxivo/database';
import {
  InternalInboxAuthHeadersSchema,
  InternalInboxSyncRequestSchema,
  WORKFLOW_ENGINE_INTERNAL_PSK_HEADER
} from '@noxivo/contracts';
import { registerMessagingInboxRoutes } from '../src/routes/messaging-inbox.routes.js';
import { MessagingInboxSyncService } from '../src/modules/inbox/messaging-sync.service.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('messaging inbox routes pagination behavior', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-messaging-inbox-route-pagination-tests' });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.ENGINE_API_KEY;
    delete process.env.MESSAGING_PROVIDER_PROXY_BASE_URL;
    delete process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN;
    delete process.env.WORKFLOW_ENGINE_INTERNAL_PSK;
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  async function seedConversationContext() {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const clusterId = new mongoose.Types.ObjectId();

    await MessagingClusterModel.create({
      _id: clusterId,
      name: 'Primary MessagingProvider Cluster',
      region: 'eu-west-1',
      baseUrl: 'https://messaging.test',
      dashboardUrl: 'https://messaging.test/dashboard',
      swaggerUrl: 'https://messaging.test/docs',
      capacity: 25,
      activeSessionCount: 1,
      status: 'active',
      secretRefs: { webhookSecretVersion: 'v1' }
    });

    await MessagingSessionBindingModel.create({
      agencyId,
      tenantId,
      clusterId,
      sessionName: 'tenant-main',
      messagingSessionName: 'tenant-main',
      status: 'active',
      routingMetadata: {}
    });

    const conversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550001111@c.us',
      contactPhone: '15550001111',
      contactName: 'Alice',
      status: 'open',
      unreadCount: 0
    });

    return {
      agencyId: agencyId.toString(),
      tenantId: tenantId.toString(),
      conversationId: conversation._id.toString()
    };
  }

  function createMessageBatch(offset: number, limit: number) {
    return Array.from({ length: limit }, (_, index) => ({
      id: `wamid-${offset}-${index}`,
      from: '15550001111@c.us',
      to: '15550002222@c.us',
      fromMe: false,
      body: `Recovered message ${offset + index}`,
      messageTimestamp: 1710000000 - (offset + index),
      ack: 0,
      ackName: 'PENDING',
      hasMedia: false
    }));
  }

  async function createInboxTestServer() {
    const app = Fastify({ logger: false });
    app.decorate('verifyApiKey', () => true);
    await registerMessagingInboxRoutes(app);

    const syncService = new MessagingInboxSyncService();
    app.post('/v1/internal/inbox/sync', async (request, reply) => {
      const configuredPsk = process.env.WORKFLOW_ENGINE_INTERNAL_PSK;
      const authHeaders = InternalInboxAuthHeadersSchema.safeParse(request.headers);

      if (!configuredPsk || !authHeaders.success) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      if (authHeaders.data[WORKFLOW_ENGINE_INTERNAL_PSK_HEADER] !== configuredPsk) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const payload = InternalInboxSyncRequestSchema.parse(request.body);
      const result = payload.conversationId
        ? await syncService.syncConversationMessages({
            agencyId: payload.agencyId,
            tenantId: payload.tenantId,
            conversationId: payload.conversationId,
            ...(payload.limit !== undefined ? { limit: payload.limit } : {}),
            ...(payload.pages !== undefined ? { pages: payload.pages } : {})
          })
        : await syncService.syncRecentChats({
            agencyId: payload.agencyId,
            tenantId: payload.tenantId,
            ...(payload.limit !== undefined ? { limit: payload.limit } : {}),
            ...(payload.pages !== undefined ? { pages: payload.pages } : {})
          });

      return reply.status(200).send(result);
    });

    return app;
  }

  it('public inbox messages route derives page depth from offset while capping sync limit at 100', async () => {
    process.env.ENGINE_API_KEY = 'engine-key';
    process.env.MESSAGING_PROVIDER_PROXY_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'messaging-token';

    const seeded = await seedConversationContext();
    const messageCallParams: Array<{ limit: number; offset: number }> = [];

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/tenant-main/chats/15550001111%40c.us/messages?')) {
        const parsed = new URL(url);
        const limit = Number(parsed.searchParams.get('limit'));
        const offset = Number(parsed.searchParams.get('offset') ?? '0');
        messageCallParams.push({ limit, offset });

        return new Response(JSON.stringify(createMessageBatch(offset, limit)), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }));

    const server = await createInboxTestServer();

    try {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/inbox/conversations/${seeded.conversationId}/messages?agencyId=${seeded.agencyId}&tenantId=${seeded.tenantId}&limit=100&offset=200`,
        headers: {
          'x-api-key': 'engine-key'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(messageCallParams.map((item) => item.limit)).toEqual([100, 100, 100]);
      expect(messageCallParams.map((item) => item.offset)).toEqual([0, 100, 200]);
    } finally {
      await server.close();
    }
  });

  it('internal inbox sync honors pages and caps MessagingProvider message limit at 100', async () => {
    process.env.WORKFLOW_ENGINE_INTERNAL_PSK = 'internal-psk';
    process.env.MESSAGING_PROVIDER_PROXY_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'messaging-token';

    const seeded = await seedConversationContext();
    const messageCallParams: Array<{ limit: number; offset: number }> = [];

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/tenant-main/chats/15550001111%40c.us/messages?')) {
        const parsed = new URL(url);
        const limit = Number(parsed.searchParams.get('limit'));
        const offset = Number(parsed.searchParams.get('offset') ?? '0');
        messageCallParams.push({ limit, offset });

        return new Response(JSON.stringify(createMessageBatch(offset, limit)), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }));

    const server = await createInboxTestServer();

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/internal/inbox/sync',
        headers: {
          'content-type': 'application/json',
          'x-nexus-internal-psk': 'internal-psk'
        },
        payload: {
          agencyId: seeded.agencyId,
          tenantId: seeded.tenantId,
          conversationId: seeded.conversationId,
          limit: 200,
          pages: 2
        }
      });

      expect(response.statusCode).toBe(200);
      expect(messageCallParams.map((item) => item.limit)).toEqual([100, 100]);
      expect(messageCallParams.map((item) => item.offset)).toEqual([0, 100]);
    } finally {
      await server.close();
    }
  });
});
