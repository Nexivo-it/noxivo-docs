import type { FastifyInstance } from 'fastify';
import { createAgencyTenant, getAgencyAdministrationDetail } from '../agency-admin.service.js';
import { getSessionFromRequest } from '../session-auth.js';

interface AgencyParams {
  agencyId: string;
}

function toErrorStatus(message: string): number {
  if (message === 'Forbidden') {
    return 403;
  }

  if (message === 'Agency not found') {
    return 404;
  }

  if (/already in use|limit reached/i.test(message)) {
    return 409;
  }

  return 400;
}

export async function registerTenantsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: AgencyParams }>('/:agencyId/tenants', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const detail = await getAgencyAdministrationDetail(session, request.params.agencyId);
      return reply.send(detail.tenants);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected tenants error';
      return reply.status(toErrorStatus(message)).send({ error: message });
    }
  });

  fastify.post<{ Params: AgencyParams }>('/:agencyId/tenants', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      return reply.status(201).send(await createAgencyTenant(session, request.params.agencyId, request.body));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected tenants error';
      return reply.status(toErrorStatus(message)).send({ error: message });
    }
  });
}
