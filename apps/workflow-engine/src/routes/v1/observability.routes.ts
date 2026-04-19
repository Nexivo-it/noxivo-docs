import { type FastifyInstance } from 'fastify';
import { proxyToMessaging } from '../../lib/messaging-proxy-utils.js';

export async function registerObservabilityRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/health/messaging', {
    schema: {
      description: 'Check status of upstream messaging provider server',
      tags: ['Observability'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'healthy' },
            upstream: { type: 'string', example: 'MessagingProvider' }
          }
        },
        503: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'unhealthy' },
            error: { type: 'string', example: 'Service Unavailable' }
          }
        }
      },
      security: [{ apiKey: [] }]
    }
  }, async (request, reply) => {
    try {
      // MessagingProvider doesn't have a direct /health usually, check /api/sessions
      await proxyToMessaging('/api/sessions');
      return reply.status(200).send({ status: 'healthy', upstream: 'MessagingProvider' });
    } catch (e) {
      return reply.status(503).send({ status: 'unhealthy', error: e instanceof Error ? e.message : 'Unknown' });
    }
  });
}
