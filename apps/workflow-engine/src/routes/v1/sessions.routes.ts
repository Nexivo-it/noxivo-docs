import { type FastifyInstance } from 'fastify';
import type mongoose from 'mongoose';
import { z } from 'zod';
import { proxyToMessaging } from '../../lib/messaging-proxy-utils.js';
import { dbConnect } from '../../lib/mongodb.js';
import { MessagingSessionService } from '../../lib/messaging-session.service.js';
import { MessagingSessionBootstrapRequestSchema } from '@noxivo/contracts';
import { resolveMessagingSessionName } from './session-resolution.js';

const SessionIdSchema = z.object({ id: z.string() });
const SessionByTenantQuerySchema = z.object({
  agencyId: z.string().trim().min(1),
  tenantId: z.string().trim().min(1),
});

type MessagingLiveSession = {
  name: string;
  status?: string;
  me?: {
    id?: string;
    name?: string;
  } | null;
  config?: {
    proxy?: string;
    metadata?: {
      agencyId?: string;
      tenantId?: string;
      clusterId?: string;
      sessionBindingId?: string;
    };
  } | null;
};

function normalizeSessionStatus(status: string | undefined): string {
  return status?.trim() || 'OFFLINE';
}

function createFallbackSessionName(agencyId: string, tenantId: string): string {
  const a = agencyId.slice(-8);
  const t = tenantId.slice(-8);
  return `agency-${a}-tenant-${t}-whatsapp`;
}

function buildMetadataFromLiveSession(session: MessagingLiveSession): {
  agencyId: string;
  tenantId: string;
  clusterId: string;
  sessionBindingId: string;
} {
  const metadata = session.config?.metadata;

  return {
    agencyId: typeof metadata?.agencyId === 'string' ? metadata.agencyId : '',
    tenantId: typeof metadata?.tenantId === 'string' ? metadata.tenantId : '',
    clusterId: typeof metadata?.clusterId === 'string' ? metadata.clusterId : '',
    sessionBindingId: typeof metadata?.sessionBindingId === 'string' ? metadata.sessionBindingId : '',
  };
}

async function getLiveSessions(): Promise<MessagingLiveSession[]> {
  const payload = await proxyToMessaging('/api/sessions?all=true');
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload as MessagingLiveSession[];
}

export async function registerSessionV1Routes(fastify: FastifyInstance) {
  fastify.post('/api/v1/sessions/bootstrap', {
    schema: {
      summary: 'Bootstrap Session',
      description: 'Initialize a new WhatsApp messaging session for a specific agency and tenant. If a session already exists, it returns the current status.',
      tags: ['Sessions'],
      body: {
        type: 'object',
        required: ['agencyId', 'tenantId'],
        properties: {
          agencyId: { 
            type: 'string', 
            description: 'The unique identifier for the agency.',
            example: '64a1b2c3d4e5f6g7h8i9j0k1' 
          },
          tenantId: { 
            type: 'string', 
            description: 'The unique identifier for the tenant (sub-account).',
            example: '75b2c3d4e5f6g7h8i9j0k1l2' 
          },
          accountName: { 
            type: 'string', 
            description: 'A friendly name for this messaging account.',
            example: 'Noxivo Customer Support' 
          }
        }
      },
      response: {
        200: {
          description: 'Session bootstrapped successfully',
          type: 'object',
          properties: {
            sessionName: { 
              type: 'string', 
              description: 'The internal name of the session used for subsequent API calls.',
              example: 'wa_agency_64a1_tenant_75b2' 
            },
            status: { 
              type: 'string', 
              description: 'Current connection status of the session.',
              example: 'SCAN_QR_CODE' 
            }
          }
        },
        400: {
          description: 'Invalid input parameters',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'agencyId and tenantId are required' }
          }
        },
        404: {
          description: 'Agency or Tenant not found',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Tenant not found' }
          }
        },
        502: {
          description: 'Bad Gateway - Failed to communicate with the messaging provider',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Provider connection refused' }
          }
        }
      },
      security: [{ apiKey: [] }]
    }
  }, async (request, reply) => {
    await dbConnect();
    const body = MessagingSessionBootstrapRequestSchema.parse(request.body);
    const service = new MessagingSessionService();

    try {
      const result = await service.bootstrap(body.agencyId, body.tenantId, body.accountName);
      return reply.status(200).send({
        sessionName: result.sessionName,
        status: result.status,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message.includes('Tenant not found')) {
        try {
          const liveSessions = await getLiveSessions();
          const existing = liveSessions.find(
            (session) =>
              session.config?.metadata?.agencyId === body.agencyId &&
              session.config?.metadata?.tenantId === body.tenantId
          );

          if (existing) {
            return reply.status(200).send({
              sessionName: existing.name,
              status: normalizeSessionStatus(existing.status),
            });
          }

          const fallbackSessionName = createFallbackSessionName(body.agencyId, body.tenantId);
          const created = await proxyToMessaging('/api/sessions', {
            method: 'POST',
            body: JSON.stringify({
              name: fallbackSessionName,
              start: true,
              config: {
                metadata: {
                  agencyId: body.agencyId,
                  tenantId: body.tenantId,
                  ...(body.accountName ? { accountName: body.accountName } : {}),
                },
                webhooks: [],
              },
            }),
          }) as { name?: string; status?: string };

          const name = created.name ?? fallbackSessionName;
          return reply.status(200).send({
            sessionName: name,
            status: created.status ? normalizeSessionStatus(created.status) : 'SCAN_QR_CODE',
          });
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Unknown fallback bootstrap error';
          return reply.status(404).send({ error: `Tenant not found; fallback bootstrap failed: ${fallbackMessage}` });
        }
      }

      if (message.includes('No available MessagingProvider cluster')) {
        return reply.status(503).send({ error: message });
      }

      return reply.status(502).send({ error: message });
    }
  });

  fastify.get('/api/v1/sessions', {
    schema: {
      description: 'List all engine sessions with live status from MessagingProvider',
      tags: ['Sessions'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '64a1b2c3d4e5f6g7h8i9j0k1' },
              name: { type: 'string', example: 'wa_agency_123_tenant_456' },
              status: { type: 'string', example: 'CONNECTED' },
              phone: { type: 'string', example: '1234567890' },
              accountName: { type: 'string', example: 'Noxivo Sales' },
              platform: { type: 'string', example: 'WEBJS' },
              server: { type: 'string', example: 'MessagingProvider' },
              metadata: {
                type: 'object',
                properties: {
                  agencyId: { type: 'string', example: 'agency_123' },
                  tenantId: { type: 'string', example: 'tenant_456' },
                  clusterId: { type: 'string', example: 'cluster_789' },
                  sessionBindingId: { type: 'string', example: '64a1b2c3d4e5f6g7h8i9j0k1' }
                }
              }
            }
          }
        }
      },
      security: [{ apiKey: [] }]
    }
  }, async (_request, reply) => {
    await dbConnect();
    const { MessagingSessionBindingModel } = await import('@noxivo/database');
    const bindings = await MessagingSessionBindingModel.find().lean().exec();

    // Fetch live status from MessagingProvider
    const liveSessions = await getLiveSessions();
    const byName = new Map(liveSessions.map((session) => [session.name, session]));

    const results = bindings.map((b) => {
      const live = byName.get(b.messagingSessionName);

      return {
        id: b._id.toString(),
        name: b.messagingSessionName,
        status: normalizeSessionStatus(live?.status),
        phone: live?.me?.id?.split('@')[0] || null,
        accountName: live?.me?.name || 'Unknown User',
        platform: live?.config?.proxy || 'WEBJS (2026.3.4 PLUS)',
        server: 'MessagingProvider',
        metadata: {
          agencyId: b.agencyId.toString(),
          tenantId: b.tenantId.toString(),
          clusterId: b.clusterId.toString(),
          sessionBindingId: b._id.toString()
        }
      };
    });

    for (const liveSession of liveSessions) {
      const existsInBindings = bindings.some((binding) => binding.messagingSessionName === liveSession.name);
      if (existsInBindings) {
        continue;
      }

      results.push({
        id: liveSession.name,
        name: liveSession.name,
        status: normalizeSessionStatus(liveSession.status),
        phone: liveSession.me?.id?.split('@')[0] ?? null,
        accountName: liveSession.me?.name ?? 'Unknown User',
        platform: liveSession.config?.proxy ?? 'MessagingProvider',
        server: 'MessagingProvider',
        metadata: buildMetadataFromLiveSession(liveSession),
      });
    }

    return reply.status(200).send(results);
  });

  fastify.get('/api/v1/sessions/by-tenant', {
    schema: {
      summary: 'Get Session by Tenant',
      description: 'Locate a specific WhatsApp session using agency and tenant identifiers. Returns the internal engine ID and friendly session name.',
      tags: ['Sessions'],
      querystring: {
        type: 'object',
        required: ['agencyId', 'tenantId'],
        properties: {
          agencyId: { type: 'string', example: 'agency_123' },
          tenantId: { type: 'string', example: 'tenant_456' }
        }
      },
      response: {
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '64a1b2c3d4e5f6g7h8i9j0k1' },
            name: { type: 'string', example: 'wa_agency_123_tenant_456' }
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
    const agencyId = (request.query as any).agencyId || (request as any).context?.agencyId;
    const tenantId = (request.query as any).tenantId || (request as any).context?.tenantId;

    if (!agencyId || !tenantId) {
      return reply.status(400).send({ error: 'agencyId and tenantId are required' });
    }

    const query = SessionByTenantQuerySchema.parse({ agencyId, tenantId });
    await dbConnect();
    const { MessagingSessionBindingModel, AgencyModel, TenantModel } = await import('@noxivo/database');
    const mongoose = await import('mongoose');

    const isAgencyIdHex = /^[a-fA-F0-9]{24}$/.test(query.agencyId);
    const isTenantIdHex = /^[a-fA-F0-9]{24}$/.test(query.tenantId);

    let agencyObjectId: mongoose.Types.ObjectId | undefined;
    if (isAgencyIdHex) {
      agencyObjectId = new mongoose.Types.ObjectId(query.agencyId);
    } else {
      const agencyResult = await AgencyModel.findOne({ slug: query.agencyId }, { _id: 1 }).lean();
      if (agencyResult) agencyObjectId = agencyResult._id as mongoose.Types.ObjectId;
    }

    let tenantObjectId: mongoose.Types.ObjectId | undefined;
    if (isTenantIdHex && agencyObjectId) {
      tenantObjectId = new mongoose.Types.ObjectId(query.tenantId);
    } else if (agencyObjectId) {
      const tenantResult = await TenantModel.findOne({ agencyId: agencyObjectId, slug: query.tenantId }, { _id: 1 }).lean();
      if (tenantResult) tenantObjectId = tenantResult._id as mongoose.Types.ObjectId;
    }

    let binding = null;
    if (agencyObjectId && tenantObjectId) {
      binding = await MessagingSessionBindingModel.findOne({
        agencyId: agencyObjectId,
        tenantId: tenantObjectId,
      }).lean();
    }

    if (!binding) {
      const liveSessions = await getLiveSessions();
      const live = liveSessions.find(
        (session) =>
          session.config?.metadata?.agencyId === query.agencyId &&
          session.config?.metadata?.tenantId === query.tenantId
      );

      if (!live) {
        return reply.status(404).send({ error: 'Session not found' });
      }

      return reply.status(200).send({ id: live.name, name: live.name });
    }

    return reply.status(200).send({ id: binding._id.toString(), name: binding.messagingSessionName });
  });

  fastify.post('/api/v1/sessions/start', {
    schema: {
      description: 'Start session in MessagingProvider',
      tags: ['Sessions'],
      body: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', example: '64a1b2c3d4e5f6g7h8i9j0k1' } }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true }
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
    const { id } = SessionIdSchema.parse(request.body);
    const resolved = await resolveMessagingSessionName(id);
    await proxyToMessaging(`/api/sessions/${resolved.sessionName}/start`, { method: 'POST' });
    return reply.status(200).send({ success: true });
  });

  fastify.post('/api/v1/sessions/stop', {
    schema: {
      description: 'Stop session in MessagingProvider',
      tags: ['Sessions'],
      body: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', example: '64a1b2c3d4e5f6g7h8i9j0k1' } }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true }
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
    const { id } = SessionIdSchema.parse(request.body);
    const resolved = await resolveMessagingSessionName(id);
    await proxyToMessaging(`/api/sessions/${resolved.sessionName}/stop`, { method: 'POST' });
    return reply.status(200).send({ success: true });
  });

  fastify.post('/api/v1/sessions/restart', {
    schema: {
      description: 'Restart session in MessagingProvider',
      tags: ['Sessions'],
      body: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', example: '64a1b2c3d4e5f6g7h8i9j0k1' } }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true }
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
    const { id } = SessionIdSchema.parse(request.body);
    const resolved = await resolveMessagingSessionName(id);
    await proxyToMessaging(`/api/sessions/${resolved.sessionName}/restart`, { method: 'POST' });
    return reply.status(200).send({ success: true });
  });

  fastify.post('/api/v1/sessions/logout', {
    schema: {
      summary: 'Logout Session',
      description: 'Terminate the WhatsApp session and unpair the device. A new QR scan will be required to reconnect.',
      tags: ['Sessions'],
      body: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', example: '64a1b2c3d4e5f6g7h8i9j0k1' } }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true }
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
    const { id } = SessionIdSchema.parse(request.body);
    const resolved = await resolveMessagingSessionName(id);
    await proxyToMessaging(`/api/sessions/${resolved.sessionName}/logout`, { method: 'POST' });
    return reply.status(200).send({ success: true });
  });
}
