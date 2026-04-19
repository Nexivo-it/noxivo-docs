import { FastifyInstance } from 'fastify';
import {
  InternalInboxAuthHeadersSchema,
  WORKFLOW_ENGINE_INTERNAL_PSK_HEADER,
  MessagingSessionBootstrapRequestSchema
} from '@noxivo/contracts';
import { dbConnect } from '../lib/mongodb.js';
import { MessagingSessionService } from '../lib/messaging-session.service.js';
import { getConfiguredMessagingBaseUrl, resolveMessagingClusterBaseUrlBySessionName } from '../lib/messaging-base-url.js';

export async function registerMessagingSessionRoutes(fastify: FastifyInstance): Promise<void> {
  await dbConnect();
  const sessionService = new MessagingSessionService();

  function assertInternalPskOrReply(request: { headers: unknown }, reply: { status(code: number): { send(payload: { error: string }): unknown } }): boolean {
    const configuredPsk = process.env.WORKFLOW_ENGINE_INTERNAL_PSK;
    const authHeaders = InternalInboxAuthHeadersSchema.safeParse(request.headers);

    if (!configuredPsk || !authHeaders.success) {
      reply.status(401).send({ error: 'Unauthorized' });
      return false;
    }

    if (authHeaders.data[WORKFLOW_ENGINE_INTERNAL_PSK_HEADER] !== configuredPsk) {
      reply.status(401).send({ error: 'Unauthorized' });
      return false;
    }

    return true;
  }

  fastify.post('/v1/messaging/session/bootstrap', async (request, reply) => {
    if (!assertInternalPskOrReply(request, reply)) {
      return;
    }

    await dbConnect();
    const body = MessagingSessionBootstrapRequestSchema.parse(request.body);
    const { agencyId, tenantId, accountName } = body;

    try {
      const result = await sessionService.bootstrap(agencyId, tenantId, accountName);
      return reply.status(200).send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('Tenant not found')) {
        return reply.status(404).send({ error: message });
      }
      if (message.includes('No available messaging cluster')) {
        return reply.status(503).send({ error: message });
      }
      return reply.status(502).send({ error: message });
    }
  });

  fastify.get('/v1/messaging/session/qr', async (request, reply) => {
    if (!assertInternalPskOrReply(request, reply)) {
      return;
    }

    await dbConnect();
    const { agencyId, tenantId } = request.query as { agencyId: string; tenantId: string };
    if (!agencyId || !tenantId) {
      return reply.status(400).send({ error: 'agencyId and tenantId are required' });
    }

    let binding = await sessionService.getActiveBinding(agencyId, tenantId);

    if (!binding) {
      try {
        await sessionService.bootstrap(agencyId, tenantId);
        binding = await sessionService.getActiveBinding(agencyId, tenantId);
      } catch (error) {
        return reply.status(502).send({ error: error instanceof Error ? error.message : 'Failed to lazily bootstrap messaging session' });
      }

      if (!binding) {
        return reply.status(404).send({ error: 'Failed to lazily bootstrap messaging session' });
      }
    }

    const { qr } = await sessionService.getQr(binding.messagingSessionName);
    const fallbackStatus = binding.status === 'active'
      ? 'connected'
      : binding.status === 'pending'
        ? 'provisioning'
        : 'unavailable';
    
    let resolvedStatus = qr ? 'available' : fallbackStatus;
    let profile = null;
    
    if (resolvedStatus === 'connected' || (!qr && fallbackStatus === 'connected')) {
      profile = await sessionService.getProfile(binding.messagingSessionName);
      if (profile) resolvedStatus = 'connected';
    }

    const diagnostics = await sessionService.getDiagnostics(binding.messagingSessionName);
    
    return reply.status(200).send({ 
      sessionName: binding.sessionName, 
      status: resolvedStatus, 
      qr, 
      profile, 
      diagnostics,
      provisioning: binding.status === 'pending' 
    });
  });

  fastify.get('/v1/messaging/session/status', async (request, reply) => {
    if (!assertInternalPskOrReply(request, reply)) {
      return;
    }

    await dbConnect();
    const { agencyId, tenantId } = request.query as { agencyId: string; tenantId: string };
    if (!agencyId || !tenantId) {
      return reply.status(400).send({ error: 'agencyId and tenantId are required' });
    }

    let binding = await sessionService.getActiveBinding(agencyId, tenantId);

    if (!binding) {
      try {
        await sessionService.bootstrap(agencyId, tenantId);
        binding = await sessionService.getActiveBinding(agencyId, tenantId);
      } catch (error) {
        return reply.status(502).send({ error: error instanceof Error ? error.message : 'Failed to lazily bootstrap messaging session' });
      }

      if (!binding) {
        return reply.status(404).send({ error: 'Failed to lazily bootstrap messaging session' });
      }
    }

    let status = binding.status === 'active'
      ? 'connected'
      : binding.status === 'pending'
        ? 'provisioning'
        : 'unavailable';

    const profile = await sessionService.getProfile(binding.messagingSessionName);
    if (profile) {
      status = 'connected';
    }

    const diagnostics = await sessionService.getDiagnostics(binding.messagingSessionName);

    return reply.status(200).send({ 
      sessionName: binding.sessionName, 
      status, 
      profile,
      diagnostics 
    });
  });

  const resolveMessagingProviderUrl = async (sessionName: string): Promise<string> => {
    const clusterBaseUrl = await resolveMessagingClusterBaseUrlBySessionName(sessionName);
    if (clusterBaseUrl) {
      return clusterBaseUrl;
    }

    const configuredBaseUrl = getConfiguredMessagingBaseUrl();
    if (!configuredBaseUrl) {
      throw new Error('MESSAGING_PROVIDER_PROXY_BASE_URL or MESSAGING_PROVIDER_BASE_URL environment variable is required');
    }

    return configuredBaseUrl;
  };

  const serverAuthToken = process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN ?? process.env.MESSAGING_PROVIDER_API_KEY;
  if (!serverAuthToken) {
    throw new Error('MESSAGING_PROVIDER_PROXY_AUTH_TOKEN or MESSAGING_PROVIDER_API_KEY environment variable is required');
  }

  fastify.get('/v1/messaging/:sessionName/*', async (request, reply) => {
    if (!assertInternalPskOrReply(request, reply)) {
      return;
    }

    await dbConnect();
    const params = request.params as { sessionName: string; '*': string };
    const subPath = params['*'] ?? '';
    const providerBaseUrl = await resolveMessagingProviderUrl(params.sessionName);
    const providerUrl = `${providerBaseUrl}/api/${encodeURIComponent(params.sessionName)}/${subPath}`;
    try {
      const response = await fetch(providerUrl, { method: 'GET', headers: { 'x-api-key': serverAuthToken } });
      const data = await response.json();
      return reply.status(response.status).send(data);
    } catch (error) {
      return reply.status(502).send({ error: 'Failed to proxy to messaging provider', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  fastify.post('/v1/messaging/:sessionName/*', async (request, reply) => {
    if (!assertInternalPskOrReply(request, reply)) {
      return;
    }

    await dbConnect();
    const params = request.params as { sessionName: string; '*': string };
    const subPath = params['*'] ?? '';
    const providerBaseUrl = await resolveMessagingProviderUrl(params.sessionName);
    const providerUrl = `${providerBaseUrl}/api/${encodeURIComponent(params.sessionName)}/${subPath}`;
    let bodyStr: string | undefined;
    const rawBody = request.body;
    if (typeof rawBody === 'string') bodyStr = rawBody;
    else if (rawBody && typeof rawBody === 'object') bodyStr = JSON.stringify(rawBody);
    const fetchOptions: RequestInit = { method: 'POST', headers: { 'x-api-key': serverAuthToken, 'content-type': 'application/json' } };
    if (bodyStr) fetchOptions.body = bodyStr;
    try {
      const response = await fetch(providerUrl, fetchOptions);
      const data = await response.json();
      return reply.status(response.status).send(data);
    } catch (error) {
      return reply.status(502).send({ error: 'Failed to proxy to messaging provider', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
