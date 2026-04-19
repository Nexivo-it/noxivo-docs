import { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes, createHash } from 'node:crypto';
import { dashboardRegistry } from '../../modules/dashboard-registry/index.js';
import { dbConnect } from '../../lib/mongodb.js';
import { MessagingSessionBindingModel } from '@noxivo/database';

const AUTH_SESSION_COOKIE_NAME = 'noxivo_admin_session';

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function getSessionTokenFromCookies(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const fragment of cookieHeader.split(';')) {
    const [rawKey, ...rest] = fragment.split('=');
    if (rawKey?.trim() === AUTH_SESSION_COOKIE_NAME && rest.length > 0) {
      try {
        return decodeURIComponent(rest.join('=').trim());
      } catch {
        return rest.join('=').trim();
      }
    }
  }
  return null;
}

const RegisterDashboardSchema = z.object({
  agencyId: z.string().min(1),
  dashboardName: z.string().min(1).max(120),
  dashboardUrl: z.string().url(),
  webhookSecret: z.string().min(32),
});

const UpdateDashboardSchema = z.object({
  dashboardName: z.string().min(1).max(120).optional(),
  dashboardUrl: z.string().url().optional(),
  webhookSecret: z.string().min(32).optional(),
  status: z.enum(['active', 'suspended', 'disconnected']).optional(),
});

export async function registerDashboardRoutes(fastify: FastifyInstance) {
  fastify.post('/v1/internal/dashboard/register', {
    schema: {
      description: 'Register a new dashboard with the workflow engine (protected by PSK)',
      tags: ['Dashboard Registry'],
      body: {
        type: 'object',
        required: ['agencyId', 'dashboardName', 'dashboardUrl', 'webhookSecret'],
        properties: {
          agencyId: { type: 'string', description: 'Unique agency identifier from dashboard' },
          dashboardName: { type: 'string', description: 'Display name of the dashboard' },
          dashboardUrl: { type: 'string', format: 'uri', description: 'Base URL of the dashboard' },
          webhookSecret: { type: 'string', minLength: 32, description: 'Secret for webhook validation' },
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            apiKey: { type: 'string', description: 'API key the dashboard will use' },
            agencyId: { type: 'string' },
          }
        },
        400: {
          type: 'object',
          properties: { error: { type: 'string' } }
        },
        409: {
          type: 'object',
          properties: { error: { type: 'string' } }
        }
      }
    },
  }, async (request, reply) => {
    const payload = RegisterDashboardSchema.parse(request.body);
    const apiKey = randomBytes(32).toString('hex');

    try {
      const config = await dashboardRegistry.registerDashboard({
        ...payload,
        apiKey,
      });
      return reply.status(201).send({
        success: true,
        apiKey,
        agencyId: config.agencyId,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('already registered')) {
        return reply.status(409).send({ error: error.message });
      }
      request.log.error(error);
      return reply.status(400).send({ error: 'Failed to register dashboard' });
    }
  });

  fastify.get('/v1/internal/dashboard/config', {
    schema: {
      description: 'Get dashboard config by agencyId (protected by PSK)',
      tags: ['Dashboard Registry'],
      querystring: {
        type: 'object',
        required: ['agencyId'],
        properties: {
          agencyId: { type: 'string' }
        }
      },
    },
  }, async (request, reply) => {
    const { agencyId } = z.object({ agencyId: z.string() }).parse(request.query);
    const config = await dashboardRegistry.getDashboardByAgencyId(agencyId);
    if (!config) {
      return reply.status(404).send({ error: 'Dashboard not found' });
    }
    return reply.send(config);
  });

  fastify.get('/v1/internal/dashboard/agencies', {
    schema: {
      description: 'List all agencies from all dashboards (protected by PSK)',
      tags: ['Dashboard Registry'],
    },
  }, async (_request, reply) => {
    const agencies = await dashboardRegistry.listAllAgencies();
    return reply.send(agencies);
  });

  fastify.patch('/v1/internal/dashboard/config', {
    schema: {
      description: 'Update dashboard config (protected by PSK)',
      tags: ['Dashboard Registry'],
      body: {
        type: 'object',
        required: ['agencyId'],
        properties: {
          agencyId: { type: 'string' },
          dashboardName: { type: 'string' },
          dashboardUrl: { type: 'string' },
          webhookSecret: { type: 'string' },
          status: { type: 'string', enum: ['active', 'suspended', 'disconnected'] },
        }
      },
    },
  }, async (request, reply) => {
    const { agencyId, ...updates } = z.object({
      agencyId: z.string(),
      dashboardName: z.string().optional(),
      dashboardUrl: z.string().optional(),
      webhookSecret: z.string().optional(),
      status: z.enum(['active', 'suspended', 'disconnected']).optional(),
    }).parse(request.body);

    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    ) as Parameters<typeof dashboardRegistry.updateDashboard>[1];

    const config = await dashboardRegistry.updateDashboard(agencyId, filteredUpdates);
    if (!config) {
      return reply.status(404).send({ error: 'Dashboard not found' });
    }
    return reply.send(config);
  });

  fastify.get('/api/v1/admin/dashboards', {
    schema: {
      description: 'Engine admin: List all registered dashboards',
      tags: ['Admin - Dashboards'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              agencyId: { type: 'string' },
              dashboardName: { type: 'string' },
              dashboardUrl: { type: 'string' },
              status: { type: 'string' },
              lastSyncAt: { type: 'string', nullable: true },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' },
            }
          }
        }
      }
    },
  }, async (_request, reply) => {
    const dashboards = await dashboardRegistry.getAllDashboards();
    return reply.send(dashboards);
  });

  fastify.get('/api/v1/admin/dashboards/:agencyId', {
    schema: {
      description: 'Engine admin: Get specific dashboard details',
      tags: ['Admin - Dashboards'],
      params: {
        type: 'object',
        required: ['agencyId'],
        properties: { agencyId: { type: 'string' } }
      },
    },
  }, async (request, reply) => {
    const { agencyId } = z.object({ agencyId: z.string() }).parse(request.params);
    const config = await dashboardRegistry.getDashboardByAgencyId(agencyId);
    if (!config) {
      return reply.status(404).send({ error: 'Dashboard not found' });
    }
    return reply.send(config);
  });

  fastify.get('/api/v1/admin/dashboards/:agencyId/sessions', {
    schema: {
      description: 'Engine admin: Get all sessions for a specific dashboard (agency)',
      tags: ['Admin - Dashboards'],
      params: {
        type: 'object',
        required: ['agencyId'],
        properties: { agencyId: { type: 'string' } }
      },
    },
  }, async (request, reply) => {
    const { agencyId } = z.object({ agencyId: z.string() }).parse(request.params);
    const dashboard = await dashboardRegistry.getDashboardByAgencyId(agencyId);
    if (!dashboard) {
      return reply.status(404).send({ error: 'Dashboard not found' });
    }

    await dbConnect();
    const bindings = await MessagingSessionBindingModel.find({ agencyId }).lean();
    return reply.send({
      dashboardName: dashboard.dashboardName,
      dashboardUrl: dashboard.dashboardUrl,
      agencyId,
      sessionCount: bindings.length,
      sessions: bindings,
      });
  });

  fastify.post('/api/v1/admin/dashboards/:agencyId/sync', {
    schema: {
      description: 'Engine admin: Mark dashboard as synced',
      tags: ['Admin - Dashboards'],
      params: {
        type: 'object',
        required: ['agencyId'],
        properties: { agencyId: { type: 'string' } }
      },
    },
  }, async (request, reply) => {
    const { agencyId } = z.object({ agencyId: z.string() }).parse(request.params);
    await dashboardRegistry.markSynced(agencyId);
    return reply.send({ success: true });
  });

  fastify.post('/api/v1/admin/dashboards/:agencyId/suspend', {
    schema: {
      description: 'Engine admin: Suspend a dashboard',
      tags: ['Admin - Dashboards'],
      params: {
        type: 'object',
        required: ['agencyId'],
        properties: { agencyId: { type: 'string' } }
      },
    },
  }, async (request, reply) => {
    const { agencyId } = z.object({ agencyId: z.string() }).parse(request.params);
    await dashboardRegistry.suspendDashboard(agencyId);
    return reply.send({ success: true });
  });

  fastify.post('/api/v1/admin/dashboards/:agencyId/activate', {
    schema: {
      description: 'Engine admin: Reactivate a suspended dashboard',
      tags: ['Admin - Dashboards'],
      params: {
        type: 'object',
        required: ['agencyId'],
        properties: { agencyId: { type: 'string' } }
      },
    },
  }, async (request, reply) => {
    const { agencyId } = z.object({ agencyId: z.string() }).parse(request.params);
    await dashboardRegistry.updateDashboard(agencyId, { status: 'active' });
    return reply.send({ success: true });
  });
}