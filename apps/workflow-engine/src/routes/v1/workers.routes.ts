import { type FastifyInstance } from 'fastify';
import { getWorkflowContinuationQueue } from '../../modules/agents/continuation-queue.js';

export async function registerWorkerRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/workers/status', {
    schema: {
      description: 'Get real-time BullMQ worker and queue status',
      tags: ['Workers'],
      security: [{ apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            queues: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'workflow-continuation' },
                  waiting: { type: 'integer', example: 5 },
                  active: { type: 'integer', example: 2 },
                  completed: { type: 'integer', example: 150 },
                  failed: { type: 'integer', example: 1 },
                  delayed: { type: 'integer', example: 0 }
                }
              }
            }
          }
        },
        503: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Queue system not initialized' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const queue = getWorkflowContinuationQueue();
    if (!queue) {
      return reply.status(503).send({ error: 'Queue system not initialized' });
    }

    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');

    return reply.status(200).send({
      queues: [{
        name: queue.name,
        ...counts
      }]
    });
  });
}
