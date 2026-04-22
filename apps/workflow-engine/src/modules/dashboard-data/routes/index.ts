import type { FastifyInstance } from 'fastify';
import { getSessionFromRequest } from '../../agency/session-auth.js';
import { queryBillingData, queryDashboardOverview, queryDashboardShellData } from '../service.js';

interface ShellQuery {
  agencyId?: string;
}

export async function dashboardDataRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: ShellQuery }>('/shell', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const agencyId = typeof request.query?.agencyId === 'string' ? request.query.agencyId : undefined;
      return reply.send(await queryDashboardShellData(session, agencyId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected dashboard shell error';
      return reply.status(400).send({ error: message });
    }
  });

  fastify.get('/overview', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      return reply.send(await queryDashboardOverview(session));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected dashboard overview error';
      return reply.status(400).send({ error: message });
    }
  });

  fastify.get('/billing', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      return reply.send(await queryBillingData(session));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected dashboard billing error';
      const statusCode = message === 'Agency not found' ? 404 : 400;
      return reply.status(statusCode).send({ error: message });
    }
  });
}
