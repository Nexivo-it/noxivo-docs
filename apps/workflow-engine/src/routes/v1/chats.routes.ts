import { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { InboxService } from '../../modules/inbox/inbox.service.js';

const GetChatsQuerySchema = z.object({
  tenantId: z.string(),
  limit: z.coerce.number().optional().default(50),
  offset: z.coerce.number().optional().default(0)
});

export async function registerChatRoutes(fastify: FastifyInstance) {
  const inboxService = new InboxService();

  fastify.get('/api/v1/chats', {
    schema: {
      description: 'Retrieve a list of active conversation threads',
      tags: ['Chats'],
      querystring: {
        type: 'object',
        required: ['tenantId'],
        properties: {
          tenantId: { type: 'string', example: 'tenant_456' },
          limit: { type: 'integer', default: 50, example: 20 },
          offset: { type: 'integer', default: 0, example: 0 }
        }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '64a1b2c3d4e5f6g7h8i9j0k1' },
              contactId: { type: 'string', example: '1234567890@c.us' },
              contactName: { type: 'string', example: 'John Doe' },
              lastMessage: { type: 'string', example: 'Hey, how is it going?' },
              updatedAt: { type: 'string', example: '2026-04-16T11:00:00.000Z' }
            }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Internal Server Error' }
          }
        }
      },
      security: [{ apiKey: [] }]
    }
  }, async (request, reply) => {
    const query = GetChatsQuerySchema.parse(request.query);

    try {
      const conversations = await inboxService.getConversations({
        tenantId: query.tenantId,
        limit: query.limit,
        offset: query.offset
      });

      return reply.status(200).send(conversations.map(c => ({
        id: c._id.toString(),
        contactId: c.contactId,
        contactName: c.contactName || 'Unknown',
        lastMessage: c.lastMessageContent,
        updatedAt: c.lastMessageAt?.toISOString()
      })));
    } catch (error: any) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to retrieve chats' });
    }

  });
}
