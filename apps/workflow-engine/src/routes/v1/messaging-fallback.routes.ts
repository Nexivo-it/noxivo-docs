import { type FastifyInstance } from 'fastify';
import { dbConnect } from '../../lib/mongodb.js';

function normalizeMessagingBaseUrl(): string {
  const raw = process.env.MESSAGING_PROVIDER_BASE_URL ?? 'https://workflow-engine.khelifi-salmen.com';
  return raw.replace(/\/$/, '');
}

function getMessagingApiKey(): string {
  return process.env.MESSAGING_PROVIDER_API_KEY ?? 'messagingSecretKey2025!';
}

function getWildcardParam(request: { params: unknown }): string {
  if (!request.params || typeof request.params !== 'object') {
    return '';
  }

  const value = (request.params as Record<string, unknown>)['*'];
  return typeof value === 'string' ? value : '';
}

function serializeRequestBody(body: unknown): string | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }
  if (typeof body === 'string') {
    return body;
  }
  return JSON.stringify(body);
}

function extractSearchFromRawUrl(rawUrl: string | undefined): string {
  const url = rawUrl ?? '/';
  const queryIndex = url.indexOf('?');
  return queryIndex >= 0 ? url.slice(queryIndex) : '';
}

export async function registerMessagingFallbackRoutes(fastify: FastifyInstance) {
  fastify.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/api/v1/*',
    schema: {
      description: 'Fallback passthrough for MessagingProvider endpoints not implemented as native engine routes',
      tags: ['MessagingProvider Proxy'],
      security: [{ apiKey: [] }],
    },
    handler: async (request, reply) => {
      let wildcard = getWildcardParam(request).trim();

      // If using a scoped key, we might need to inject the session into the URL
      // if the user omitted it (Zero-Config mode).
      // MessagingProvider endpoints usually follow /api/{session}/...
      // or /api/contacts/all?session={session}
      
      if (request.context && !request.context.isMasterKey) {
        const { agencyId, tenantId } = request.context;
        await dbConnect();
        const { MessagingSessionBindingModel } = await import('@noxivo/database');
        const binding = await MessagingSessionBindingModel.findOne({ agencyId, tenantId }).lean();
        
        if (binding) {
          const sessionName = binding.messagingSessionName;
          
          // Case 1: URL is /api/v1/sendText (missing session)
          // We should ideally transform it to /api/v1/{session}/sendText
          if (wildcard && !wildcard.includes('/') && !wildcard.startsWith(sessionName)) {
             wildcard = `${sessionName}/${wildcard}`;
          }
          
          // Note: Full URL transformation logic can be complex depending on MessagingProvider version.
          // For now, we assume the user might provide the session or we inject it if it's a simple endpoint.
        }
      }

      if (!wildcard || wildcard.startsWith('admin/')) {
        return reply.status(404).send({
          message: `Route ${request.method}:${request.url} not found`,
          error: 'Not Found',
          statusCode: 404,
        });
      }

      const targetUrl = `${normalizeMessagingBaseUrl()}/api/${wildcard}${extractSearchFromRawUrl(request.raw.url)}`;
      const body = serializeRequestBody(request.body);
      const headers = new Headers();
      headers.set('X-Api-Key', getMessagingApiKey());

      if (body !== undefined) {
        headers.set('Content-Type', 'application/json');
      }

      const response = await fetch(targetUrl, {
        method: request.method,
        headers,
        ...(body !== undefined ? { body } : {}),
      });

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const payload = await response.json().catch(() => ({}));
        return reply.status(response.status).send(payload);
      }

      const text = await response.text();
      return reply
        .status(response.status)
        .type(contentType || 'text/plain; charset=utf-8')
        .send(text);
    },
  });
}
