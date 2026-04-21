import mongoose from 'mongoose';
import Fastify, { type FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  InternalInboxAuthHeadersSchema,
  InternalInboxIdempotencyHeadersSchema,
  InternalInboxSendMessageParamsSchema,
  INTERNAL_INBOX_IDEMPOTENCY_HEADER,
  InternalInboxSyncRequestSchema,
  InternalInboxSendMessageRequestSchema,
  WORKFLOW_ENGINE_INTERNAL_PSK_HEADER
} from '@noxivo/contracts';
import {
  AuthSessionModel,
  UserModel,
  MessagingSessionBindingModel,
  MessagingClusterModel,
  normalizeStoredUserRole
} from '@noxivo/database';
import { dbConnect } from './lib/mongodb.js';
import { proxyToMessaging } from './lib/messaging-proxy-utils.js';
import { InternalInboxMessageError, InternalInboxMessageService } from './modules/inbox/internal-message.service.js';
import { InboxService } from './modules/inbox/inbox.service.js';
import { loadCrmConversationProfile, mutateCrmConversationProfile, parseCrmRouteQuery } from './modules/crm/crm.route.js';
import { MessagingRouteService } from './modules/webhooks/messaging.route.js';
import { DeliveryLifecycleService } from './modules/inbox/delivery-lifecycle.service.js';
import { MessagingInboxSyncService } from './modules/inbox/messaging-sync.service.js';
import { registerMessagingSessionRoutes } from './routes/messaging-session.routes.js';
import { registerMessagingInboxRoutes } from './routes/messaging-inbox.routes.js';
import { Worker } from 'bullmq';
import { getWorkflowRedisConnection } from './lib/redis.js';
import { WORKFLOW_CONTINUATION_QUEUE_NAME, getWorkflowContinuationQueue } from './modules/agents/continuation-queue.js';
import { AgentWorker } from './modules/agents/agent.worker.js';
import { WorkflowEventsPublisher } from './modules/agents/workflow-events.publisher.js';
import { WorkflowActionService } from './modules/agents/workflow-action.service.js';
import { PluginRegistry } from './modules/plugins/registry.service.js';
import { ConversationIngestService } from './modules/conversations/ingest.service.js';
import { UsageCaptureService } from './modules/metering/capture.service.js';
import { ClusterManager } from './modules/scaling/cluster-manager.js';
import { SessionAffinity } from './modules/scaling/session-affinity.js';

// White-labeling & Standalone Plugins
import { apiAuthPlugin } from './plugins/api-auth.plugin.js';
import { swaggerPlugin } from './plugins/swagger.plugin.js';
import { corsPlugin } from './plugins/cors.plugin.js';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { registerMessageRoutes } from './routes/v1/messages.routes.js';
import { registerChatRoutes } from './routes/v1/chats.routes.js';
import { registerSessionV1Routes } from './routes/v1/sessions.routes.js';
import { registerEventRoutes } from './routes/v1/events.routes.js';
import { registerWorkerRoutes } from './routes/v1/workers.routes.js';
import { registerPairingRoutes } from './routes/v1/pairing.routes.js';
import { registerProfileRoutes } from './routes/v1/profile.routes.js';
import { registerContactRoutes } from './routes/v1/contacts.routes.js';
import { registerMediaRoutes } from './routes/v1/media.routes.js';
import { registerObservabilityRoutes } from './routes/v1/observability.routes.js';
import { registerStatusRoutes } from './routes/v1/status.routes.js';
import { registerStorageRoutes } from './routes/v1/storage.routes.js';
import { registerAdminRoutes } from './routes/v1/admin.routes.js';
import { registerDashboardRoutes } from './routes/v1/dashboard-registry.routes.js';
import { registerApiKeysRoutes } from './routes/v1/api-keys.routes.js';
import { registerMessagingFallbackRoutes } from './routes/v1/messaging-fallback.routes.js';
import { aiSalesAgentRoutes } from './routes/v1/ai-sales-agent.routes.js';
import { registerSpaRoutes } from './routes/v1/spa.routes.js';
import { agencyRoutes } from './modules/agency/routes/index.js';
import { catalogRoutes } from './modules/catalog/routes/index.js';
import { workflowsRoutes } from './modules/workflows/routes/index.js';
import { teamInboxRoutes } from './modules/team-inbox/routes/index.js';
import { settingsRoutes } from './modules/settings/routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type BuildServerOptions = {
  logger?: boolean;
};

declare module 'fastify' {
  interface FastifyInstance {
    clusterManager: ClusterManager;
    sessionAffinity: SessionAffinity;
  }
}

const AUTH_SESSION_COOKIE_NAME = 'noxivo_session';

function getRequestPath(url: string | undefined): string {
  if (!url) {
    return '/';
  }

  const queryIndex = url.indexOf('?');
  return queryIndex >= 0 ? url.slice(0, queryIndex) : url;
}

function readCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const fragment of cookieHeader.split(';')) {
    const [rawKey, ...rest] = fragment.split('=');
    if (!rawKey || rest.length === 0) {
      continue;
    }

    if (rawKey.trim() !== name) {
      continue;
    }

    const rawValue = rest.join('=').trim();
    if (!rawValue) {
      return null;
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: options.logger ?? true,
    ajv: {
      customOptions: {
        strictSchema: false
      }
    }
  });

  // Ensure DB connection is established early in the server lifecycle
  await dbConnect();
  
  // -- Public Health & Info Routes --
  // These are registered early to ensure they are always public and avoid 404s on the root domain.
  fastify.get('/', async (_request, reply) => {
    return reply.send({
      service: 'noxivo-workflow-engine',
      status: 'online',
      version: '1.0.0',
      documentation: '/v1/docs',
      admin: '/admin/'
    });
  });

  fastify.get('/health', async (request, reply) => {
    const checks: Record<string, string> = {
      mongodb: 'unknown',
      redis: 'unknown',
      messagingProvider: 'unknown'
    };

    try {
      await dbConnect();
      checks.mongodb = 'healthy';
    } catch {
      checks.mongodb = 'unhealthy';
    }

    try {
      const redis = getWorkflowRedisConnection();
      if (redis) {
        await redis.ping();
        checks.redis = 'healthy';
      } else {
        checks.redis = 'not_configured';
      }
    } catch {
      checks.redis = 'unhealthy';
    }

    // Basic check for DB and Redis connectivity

    const allHealthy = Object.values(checks).every(v => v === 'healthy' || v === 'not_configured' || v === 'unknown');
    return reply.status(allHealthy ? 200 : 503).send({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks
    });
  });

  fastify.addHook('preHandler', async (request, reply) => {
    const requestPath = getRequestPath(request.raw.url);
    const isAdminStaticPath = requestPath === '/admin' || requestPath.startsWith('/admin/');
    const isAdminApiPath = requestPath.startsWith('/api/v1/admin/');
    const isAdminLoginPath = requestPath === '/api/v1/admin/login';

    if (isAdminLoginPath) {
      return;
    }

    if (!isAdminStaticPath && !isAdminApiPath) {
      return;
    }

    await dbConnect();

    const sessionToken = readCookieValue(request.headers.cookie, AUTH_SESSION_COOKIE_NAME);
    if (!sessionToken) {
      if (isAdminApiPath) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      return reply.redirect('/');
    }

    const authSession = await AuthSessionModel.findOne({
      sessionTokenHash: hashSessionToken(sessionToken),
      expiresAt: { $gt: new Date() }
    }).lean();

    if (!authSession) {
      if (isAdminApiPath) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      return reply.redirect('/');
    }

    const user = await UserModel.findById(authSession.userId).lean();
    if (!user || user.status !== 'active') {
      if (isAdminApiPath) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      return reply.redirect('/');
    }

    const roleCandidates: Array<string | null | undefined> = [typeof user.role === 'string' ? user.role : null];
    if (Array.isArray(user.memberships)) {
      for (const membership of user.memberships) {
        const scopeRole = typeof membership?.scopeRole === 'string' ? membership.scopeRole : undefined;
        const membershipRole = typeof membership?.role === 'string' ? membership.role : undefined;
        roleCandidates.push(scopeRole ?? membershipRole ?? null);
      }
    }

    const isOwner = roleCandidates.some((roleCandidate) => normalizeStoredUserRole(roleCandidate) === 'owner');
    if (!isOwner) {
      if (isAdminApiPath) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      return reply.redirect('/');
    }
  });

  // Plugins
  await fastify.register(fastifyCookie);
  await fastify.register(fastifyMultipart);
  await fastify.register(corsPlugin);
  await fastify.register(swaggerPlugin);
  await fastify.register(apiAuthPlugin);

  // Serve Admin Dashboard Static Files
  const publicDir = path.join(__dirname, '../public');
  await fastify.register(fastifyStatic, {
    root: publicDir,
    prefix: '/admin/',
    decorateReply: false // Avoid conflict with swagger-ui if it uses it
  });

  fastify.get('/admin', (_request, reply) => {
    return reply.redirect('/admin/');
  });

  // Register Public V1 White-Labeled Routes
  await registerMessageRoutes(fastify);
  await registerChatRoutes(fastify);
  await registerSessionV1Routes(fastify);
  await registerEventRoutes(fastify);
  await registerAdminRoutes(fastify);
  await registerDashboardRoutes(fastify);
  await registerWorkerRoutes(fastify);
  await registerPairingRoutes(fastify);
  await registerProfileRoutes(fastify);
  await registerContactRoutes(fastify);
  await registerMediaRoutes(fastify);
  await registerObservabilityRoutes(fastify);
  await registerStatusRoutes(fastify);
  await registerStorageRoutes(fastify);
  await registerApiKeysRoutes(fastify);
  await registerMessagingFallbackRoutes(fastify);
  await aiSalesAgentRoutes(fastify);
  await registerSpaRoutes(fastify);
  await fastify.register(agencyRoutes, { prefix: '/api/v1/agencies' });
  await fastify.register(catalogRoutes, { prefix: '/api/v1/catalog' });
  await fastify.register(workflowsRoutes, { prefix: '/api/v1/workflows' });
  await fastify.register(teamInboxRoutes, { prefix: '/api/v1/team-inbox' });
  await fastify.register(settingsRoutes, { prefix: '/api/v1/settings' });

  const { MediaStorageService } = await import('./modules/storage/media-storage.service.js');
  const mediaStorageService = new MediaStorageService();

  const internalInboxMessageService = new InternalInboxMessageService();
  const messagingInboxSyncService = new MessagingInboxSyncService(
    undefined,
    undefined,
    mediaStorageService
  );
  const deliveryLifecycleService = new DeliveryLifecycleService();
  const pluginRegistry = new PluginRegistry();
  const workflowActionService = new WorkflowActionService();

  const mainRedis = getWorkflowRedisConnection();
  const workflowEventsPublisher = new WorkflowEventsPublisher(mainRedis);

  const clusterManager = new ClusterManager(mainRedis);
  const sessionAffinity = new SessionAffinity(mainRedis, clusterManager);

  fastify.decorate('clusterManager', clusterManager);
  fastify.decorate('sessionAffinity', sessionAffinity);

  const { MeteringCounterService, RedisMeterCounterStore, NoopMeterCounterStore } = await import('./modules/metering/counter.service.js');
  const usageCaptureService = new UsageCaptureService(
    new MeteringCounterService(
      mainRedis ? new RedisMeterCounterStore(mainRedis) : new NoopMeterCounterStore()
    )
  );
  const continuationQueue = getWorkflowContinuationQueue();

  const conversationIngestService = new ConversationIngestService(
    usageCaptureService,
    continuationQueue
  );

  const messagingRouteService = new MessagingRouteService({
    messagingSessionBindingRepo: {
      async findBySessionName(sessionName: string) {
        const binding = await MessagingSessionBindingModel.findOne({ messagingSessionName: sessionName }).lean().exec();

        if (!binding) {
          return null;
        }

        return {
          id: binding._id.toString(),
          agencyId: binding.agencyId.toString(),
          tenantId: binding.tenantId.toString(),
          clusterId: binding.clusterId.toString(),
          sessionName: binding.messagingSessionName
        };
      },
      async updateStatus(sessionName: string, status: 'pending' | 'active' | 'failed' | 'stopped') {
        await MessagingSessionBindingModel.updateOne(
          { messagingSessionName: sessionName },
          { $set: { status } }
        ).exec();
      }
    },
    agencyRepo: {
      async findById(id: string) {
        const { AgencyModel } = await import('@noxivo/database');
        if (mongoose.Types.ObjectId.isValid(id)) {
          return await AgencyModel.findById(id).lean().exec();
        }
        return await AgencyModel.findOne({ slug: id }).lean().exec();
      }
    },
    tenantRepo: {
      async findById(id: string) {
        const { TenantModel } = await import('@noxivo/database');
        if (mongoose.Types.ObjectId.isValid(id)) {
          return await TenantModel.findById(id).lean().exec();
        }
        return await TenantModel.findOne({ slug: id }).lean().exec();
      }
    },
    entitlementService: {
      async checkEntitlement() {
        return { allowed: true };
      }
    },
    inboxService: new InboxService(),
    conversationIngestService,
    deliveryLifecycleService,
    mediaStorageService
  });

  // ADR-001 Phase 4: Start the BullMQ worker for workflow execution
  const redisConnection = getWorkflowRedisConnection();
  if (redisConnection && continuationQueue) {
    const agentWorker = new AgentWorker({
      pluginRegistry,
      continuationQueue,
      workflowActionService,
      workflowEventsPublisher,
      resolveMessagingTarget: async (context) => {
        const binding = await MessagingSessionBindingModel.findOne({
          agencyId: context.agencyId,
          tenantId: context.tenantId,
          status: 'active'
        }).lean();
        return {
          sessionName: binding?.messagingSessionName || 'default',
          chatId: context.conversationId
        };
      }
    });

    new Worker(
      WORKFLOW_CONTINUATION_QUEUE_NAME,
      async (job) => {
        if (job.name === 'workflow.start') {
          await agentWorker.executeWorkflow(job.data);
        } else if (job.name === 'workflow.delay.resume') {
          await agentWorker.resumeWorkflow(job.data);
        }
      },
      { connection: redisConnection, concurrency: 5 }
    );

    fastify.log.info('Workflow Agent Worker started on queue %s', WORKFLOW_CONTINUATION_QUEUE_NAME);
  }



  fastify.post('/v1/internal/inbox/conversations/:conversationId/messages', async (request, reply) => {
    const configuredPsk = process.env.WORKFLOW_ENGINE_INTERNAL_PSK;
    const authHeaders = InternalInboxAuthHeadersSchema.safeParse(request.headers);

    if (!configuredPsk || !authHeaders.success) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    if (authHeaders.data[WORKFLOW_ENGINE_INTERNAL_PSK_HEADER] !== configuredPsk) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const idempotencyHeaders = InternalInboxIdempotencyHeadersSchema.safeParse(request.headers);

    if (!idempotencyHeaders.success) {
      return reply.status(400).send({ error: 'Idempotency-Key header is required' });
    }

    try {
      await dbConnect();

      const params = InternalInboxSendMessageParamsSchema.parse(request.params);
      const payload = InternalInboxSendMessageRequestSchema.parse(request.body);
      const result = await internalInboxMessageService.sendOperatorMessage({
        conversationId: params.conversationId,
        idempotencyKey: idempotencyHeaders.data[INTERNAL_INBOX_IDEMPOTENCY_HEADER],
        payload
      });

      return reply.status(200).send(result);
    } catch (error) {
      if (error instanceof InternalInboxMessageError) {
        return reply.status(error.statusCode).send({ error: error.message });
      }

      if (error instanceof Error && error.name === 'ZodError') {
        return reply.status(400).send({ error: 'Invalid request body' });
      }

      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to send message' });
    }
  });

  fastify.post('/v1/internal/inbox/sync', async (request, reply) => {
    const configuredPsk = process.env.WORKFLOW_ENGINE_INTERNAL_PSK;
    const authHeaders = InternalInboxAuthHeadersSchema.safeParse(request.headers);

    if (!configuredPsk || !authHeaders.success) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    if (authHeaders.data[WORKFLOW_ENGINE_INTERNAL_PSK_HEADER] !== configuredPsk) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      await dbConnect();
      const payload = InternalInboxSyncRequestSchema.parse(request.body);

      const syncOptions = {
        agencyId: payload.agencyId,
        tenantId: payload.tenantId
      };
      const result = payload.conversationId
        ? await messagingInboxSyncService.syncConversationMessages({
            ...syncOptions,
            conversationId: payload.conversationId,
            ...(payload.limit !== undefined && { limit: payload.limit }),
            ...(payload.pages !== undefined && { pages: payload.pages })
          })
        : await messagingInboxSyncService.syncRecentChats({
            ...syncOptions,
            ...(payload.limit !== undefined && { limit: payload.limit }),
            ...(payload.pages !== undefined && { pages: payload.pages })
          });

      return reply.status(200).send(result);
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        return reply.status(400).send({ error: 'Invalid sync request' });
      }

      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to sync inbox state' });
    }
  });

  fastify.get('/v1/internal/crm/conversations/:conversationId/profile', async (request, reply) => {
    const configuredPsk = process.env.WORKFLOW_ENGINE_INTERNAL_PSK;
    const authHeaders = InternalInboxAuthHeadersSchema.safeParse(request.headers);

    if (!configuredPsk || !authHeaders.success) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    if (authHeaders.data[WORKFLOW_ENGINE_INTERNAL_PSK_HEADER] !== configuredPsk) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      await dbConnect();
      const params = InternalInboxSendMessageParamsSchema.parse(request.params);
      const query = parseCrmRouteQuery(request.query);
      const profile = await loadCrmConversationProfile({
        agencyId: query.agencyId,
        tenantId: query.tenantId,
        conversationId: params.conversationId
      });

      return reply.status(200).send(profile);
    } catch (error) {
      if (error instanceof Error && error.message === 'Conversation not found') {
        return reply.status(404).send({ error: error.message });
      }

      if (error instanceof Error && error.name === 'ZodError') {
        return reply.status(400).send({ error: 'Invalid CRM request' });
      }

      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to load CRM profile' });
    }
  });

  fastify.patch('/v1/internal/crm/conversations/:conversationId/profile', async (request, reply) => {
    const configuredPsk = process.env.WORKFLOW_ENGINE_INTERNAL_PSK;
    const authHeaders = InternalInboxAuthHeadersSchema.safeParse(request.headers);

    if (!configuredPsk || !authHeaders.success) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    if (authHeaders.data[WORKFLOW_ENGINE_INTERNAL_PSK_HEADER] !== configuredPsk) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      await dbConnect();
      const params = InternalInboxSendMessageParamsSchema.parse(request.params);
      const payload = request.body as { agencyId?: string; tenantId?: string } | null;

      if (!payload?.agencyId || !payload?.tenantId) {
        return reply.status(400).send({ error: 'Invalid CRM request' });
      }

      const profile = await mutateCrmConversationProfile({
        agencyId: payload.agencyId,
        tenantId: payload.tenantId,
        conversationId: params.conversationId,
        mutation: Object.fromEntries(
          Object.entries((request.body as Record<string, unknown>) ?? {}).filter(
            ([key]) => key !== 'agencyId' && key !== 'tenantId'
          )
        )
      });

      return reply.status(200).send(profile);
    } catch (error) {
      if (error instanceof Error && error.message === 'Conversation not found') {
        return reply.status(404).send({ error: error.message });
      }

      if (error instanceof Error && error.name === 'ZodError') {
        return reply.status(400).send({ error: 'Invalid CRM request' });
      }

      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to update CRM profile' });
    }
  });

  fastify.post('/v1/webhooks/messaging', async (request, reply) => {
    const configuredWebhookSecret = process.env.MESSAGING_PROVIDER_WEBHOOK_SECRET;

    if (!configuredWebhookSecret) {
      return reply.status(500).send({ error: 'Messaging provider webhook secret is not configured' });
    }

    const receivedWebhookSecret = request.headers['x-messaging-webhook-secret'];

    if (receivedWebhookSecret !== configuredWebhookSecret) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const payloadBody = request.body as {
      event: string;
      session: string;
      payload: unknown;
      metadata?: {
        agencyId?: string;
        tenantId?: string;
        clusterId?: string;
        sessionBindingId?: string;
      };
    };
    const sessionName = payloadBody.session;

    if (sessionName && !request.headers['x-messaging-webhook-forwarded']) {
      const ownerUrl = await sessionAffinity.getOwnerUrl(sessionName);
      const currentNodeUrl = clusterManager.getCurrentNodeUrl();

      if (ownerUrl && currentNodeUrl && ownerUrl !== currentNodeUrl) {
        try {
          const forwardResponse = await fetch(`${ownerUrl}/v1/webhooks/messaging`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
'x-messaging-webhook-secret': configuredWebhookSecret,
        'x-messaging-webhook-forwarded': 'true'
            },
            body: JSON.stringify(payloadBody)
          });
          
          if (!forwardResponse.ok) {
            throw new Error(`Forwarding returned status ${forwardResponse.status}`);
          }
          
          const fwdResult = await forwardResponse.json();
          return reply.status(forwardResponse.status).send(fwdResult);
        } catch (error) {
          request.log.warn({ err: error, ownerUrl }, 'Failed to forward webhook, attempting local fallback');
        }
      } else if (!ownerUrl) {
        await sessionAffinity.claimSession(sessionName);
      }
    }

    try {
      await dbConnect();
      const resolution = await messagingRouteService.processWebhook(payloadBody);

      return reply.status(202).send({ ok: true, resolution });
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        return reply.status(400).send({ error: 'Invalid webhook payload' });
      }

      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to process webhook' });
    }
  });

  await registerMessagingSessionRoutes(fastify);
  await registerMessagingInboxRoutes(fastify);

  return fastify;
}
