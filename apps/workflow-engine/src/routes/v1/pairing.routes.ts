import { type FastifyInstance } from 'fastify';
import { proxyToMessaging } from '../../lib/messaging-proxy-utils.js';
import { resolveMessagingSessionName } from './session-resolution.js';

function extractQrToken(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return '';
  }

  const record = payload as Record<string, unknown>;
  const candidate = record.qr ?? record.value ?? record.qrValue ?? record.code;
  return typeof candidate === 'string' ? candidate : '';
}

export async function registerPairingRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/sessions/:id/qr', {
    schema: {
      description: 'Fetch QR code for pairing a specific session',
      tags: ['Pairing'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', example: '64a1b2c3d4e5f6g7h8i9j0k1' } }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            qr: { type: 'string', example: '1@abcd...long-qr-string' },
            value: { type: 'string', example: '1@abcd...long-qr-string' }
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

    try {
      const qrData = await proxyToMessaging(`/api/${resolved.sessionName}/auth/qr?format=raw`);
      const qrToken = extractQrToken(qrData);
      return reply.status(200).send({
        qr: qrToken,
        value: qrToken
      });
    } catch (error: any) {
      if (error.status === 422) {
        return reply.status(200).send({
          qr: '',
          value: '',
          message: 'Session already connected'
        });
      }
      throw error;
    }
  });

  fastify.get('/api/v1/sessions/:id/status', {
    schema: {
      description: 'Check connection status of a specific session',
      tags: ['Pairing'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', example: '64a1b2c3d4e5f6g7h8i9j0k1' } }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'CONNECTED' },
            me: {
              type: 'object',
              properties: {
                id: { type: 'string', example: '1234567890@c.us' },
                name: { type: 'string', example: 'Noxivo Engine' }
              }
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

    const status = await proxyToMessaging(`/api/sessions/${resolved.sessionName}`) as { status: string; me?: unknown };
    return reply.status(200).send({
      status: status.status,
      me: status.me
    });
  });
}
