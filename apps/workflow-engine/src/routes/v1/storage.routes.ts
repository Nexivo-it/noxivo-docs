import { type FastifyInstance } from 'fastify';
import { proxyToMessaging } from '../../lib/messaging-proxy-utils.js';

export async function registerStorageRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/storage', {
    schema: {
      description: 'Get internal storage metrics',
      tags: ['Storage'],
      security: [{ apiKey: [] }]
    }
  }, async (request, reply) => {
    // Basic proxy to any available MessagingProvider storage endpoint, e.g. GET /api/files
    try {
      const storage = await proxyToMessaging('/api/files');
      return reply.status(200).send(storage);
    } catch (e) {
      return reply.status(200).send({ message: 'Storage API might not be supported by this MessagingProvider version.' });
    }
  });
}
