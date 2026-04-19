import { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { proxyToMessaging } from '../../lib/messaging-proxy-utils.js';
import { resolveMessagingSessionName } from './session-resolution.js';

const StatusTextBodySchema = z.object({
  text: z.string().trim().min(1),
  backgroundColor: z.string().trim().optional(),
  font: z.number().int().min(0).max(7).optional(),
  contacts: z.array(z.string().trim().min(1)).optional(),
  linkPreview: z.boolean().optional(),
  linkPreviewHighQuality: z.boolean().optional(),
});

const STATUS_BROADCAST_CHAT_ID = 'status@broadcast';

function encodeChatId(chatId: string): string {
  return encodeURIComponent(chatId);
}

function isMissingStoriesError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /chat.*not found|not found|does not exist/i.test(error.message);
}

async function fetchStoriesViaMessaging(sessionName: string): Promise<unknown[]> {
  const attempts = [
    `/api/${sessionName}/chats/${encodeChatId(STATUS_BROADCAST_CHAT_ID)}/messages?limit=50&sortOrder=desc&downloadMedia=false&merge=true`,
    `/api/${sessionName}/chats/${encodeChatId(STATUS_BROADCAST_CHAT_ID)}/messages?limit=50&sortOrder=desc&downloadMedia=true&merge=true`,
    `/api/messages?session=${encodeURIComponent(sessionName)}&chatId=${encodeChatId(STATUS_BROADCAST_CHAT_ID)}&limit=50&sortOrder=desc&downloadMedia=false&merge=true`,
  ];

  let lastError: unknown = null;
  for (const path of attempts) {
    try {
      const payload = await proxyToMessaging(path);
      if (Array.isArray(payload)) {
        return payload;
      }
      return [];
    } catch (error) {
      if (isMissingStoriesError(error)) {
        return [];
      }
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return [];
}

export async function registerStatusRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/sessions/:id/status/stories', {
    schema: {
      description: 'Fetch status updates (stories) for a session',
      tags: ['Status'],
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
              id: { type: 'string', example: 'story_123' },
              from: { type: 'string', example: '1234567890@c.us' },
              text: { type: 'string', example: 'My first story!' },
              timestamp: { type: 'string', example: '2026-04-16T12:00:00.000Z' }
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
    const stories = await fetchStoriesViaMessaging(resolved.sessionName);
    return reply.status(200).send(stories);
  });

  fastify.post('/api/v1/sessions/:id/status/text', {
    schema: {
      description: 'Post text status (story) for a session',
      tags: ['Status'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', example: '64a1b2c3d4e5f6g7h8i9j0k1' } }
      },
      body: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', example: 'Feeling great with Noxivo! 🚀' },
          backgroundColor: { type: 'string', example: '#0C5CAB' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            id: { type: 'string', example: 'msg_status_789' }
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
    const body = StatusTextBodySchema.parse(request.body);
    const resolved = await resolveMessagingSessionName(id);

    const result = await proxyToMessaging(`/api/${resolved.sessionName}/status/text`, {
      method: 'POST',
      body: JSON.stringify({
        text: body.text,
        backgroundColor: body.backgroundColor ?? '#38b42f',
        font: body.font ?? 0,
        contacts: body.contacts,
        linkPreview: body.linkPreview ?? true,
        linkPreviewHighQuality: body.linkPreviewHighQuality ?? false,
      })
    });
    return reply.status(201).send(result);
  });
}
