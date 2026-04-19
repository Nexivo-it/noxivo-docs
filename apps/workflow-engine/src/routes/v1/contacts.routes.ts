import { type FastifyInstance } from 'fastify';
import { proxyToMessaging } from '../../lib/messaging-proxy-utils.js';
import { resolveMessagingSessionName } from './session-resolution.js';

export async function registerContactRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/sessions/:id/contacts', {
    schema: {
      description: 'Fetch contacts for a session',
      tags: ['Contacts'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', example: '64a1b2c3d4e5f6g7h8i9j0k1' } }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '1234567890@c.us' },
              name: { type: 'string', example: 'John Doe' },
              pushname: { type: 'string', example: 'John' },
              isGroup: { type: 'boolean', example: false }
            }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      security: [{ apiKey: [] }]
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const resolved = await resolveMessagingSessionName(id);

    const contacts = await proxyToMessaging(`/api/contacts/all?session=${resolved.sessionName}`);
    return reply.status(200).send(contacts);
  });
}
