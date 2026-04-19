import { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { proxyToMessaging } from '../../lib/messaging-proxy-utils.js';
import { resolveMessagingSessionName } from './session-resolution.js';

const MediaSendSchema = z.object({
  id: z.string(), // Session ID
  to: z.string(),
  url: z.string().url(),
  kind: z.enum(['image', 'document', 'video', 'audio']),
  caption: z.string().optional(),
  fileName: z.string().optional()
});

export async function registerMediaRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v1/media/send', {
    schema: {
      description: 'Send media attachment through engine',
      tags: ['Media'],
      body: {
        type: 'object',
        required: ['id', 'to', 'url', 'kind'],
        properties: {
          id: { type: 'string', example: '64a1b2c3d4e5f6g7h8i9j0k1' },
          to: { type: 'string', example: '1234567890@c.us' },
          url: { type: 'string', example: 'https://placehold.co/600x400.png' },
          kind: { type: 'string', enum: ['image', 'document', 'video', 'audio'], example: 'image' },
          caption: { type: 'string', example: 'Check this out!' },
          fileName: { type: 'string', example: 'noxivo-promo.png' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '64a1b2c3d4e5f6g7h8i9j0k1' },
            status: { type: 'string', example: 'sent' }
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
    const body = MediaSendSchema.parse(request.body);
    const resolved = await resolveMessagingSessionName(body.id);

    let endpoint = '/api/sendImage';
    if (body.kind === 'document') endpoint = '/api/sendFile';
    if (body.kind === 'video') endpoint = '/api/sendVideo';
    if (body.kind === 'audio') endpoint = '/api/sendVoice';

    const result = await proxyToMessaging(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        session: resolved.sessionName,
        chatId: body.to.includes('@') ? body.to : `${body.to}@c.us`,
        file: { url: body.url },
        caption: body.caption,
        filename: body.fileName
      })
    });

    return reply.status(200).send(result);
  });
}
