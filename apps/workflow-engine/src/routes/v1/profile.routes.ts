import { type FastifyInstance } from 'fastify';
import { proxyToMessaging } from '../../lib/messaging-proxy-utils.js';
import { resolveMessagingSessionName } from './session-resolution.js';

export async function registerProfileRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/sessions/:id/profile', {
    schema: {
      description: 'Fetch detailed profile information for a session',
      tags: ['Profile'],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } }
      },
      security: [{ apiKey: [] }]
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const resolved = await resolveMessagingSessionName(id);

    const profile = await proxyToMessaging(`/api/${resolved.sessionName}/profile`);
    return reply.status(200).send(profile);
  });
}
