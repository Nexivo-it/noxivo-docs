import type { FastifyInstance } from 'fastify';
import { getAgencyAdministrationDetail, updateAgency } from '../agency-admin.service.js';
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

  if (/already in use/i.test(message)) {
    return 409;
  }

  return 400;
}

export async function registerAgencySingleRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: AgencyParams }>('/:agencyId', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      return reply.send(await getAgencyAdministrationDetail(session, request.params.agencyId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected agency error';
      return reply.status(toErrorStatus(message)).send({ error: message });
    }
  });

  fastify.patch<{ Params: AgencyParams }>('/:agencyId', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      return reply.send(await updateAgency(session, request.params.agencyId, request.body));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected agency error';
      return reply.status(toErrorStatus(message)).send({ error: message });
    }
  });
}
