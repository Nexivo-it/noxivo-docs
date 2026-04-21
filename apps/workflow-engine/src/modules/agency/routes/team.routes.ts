import type { FastifyInstance } from 'fastify';
import { listAgencyTeam } from '../team-admin.service.js';
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

  return 400;
}

export async function registerTeamRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: AgencyParams }>('/:agencyId/team', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      return reply.send(await listAgencyTeam(session, request.params.agencyId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected team error';
      return reply.status(toErrorStatus(message)).send({ error: message });
    }
  });
}
