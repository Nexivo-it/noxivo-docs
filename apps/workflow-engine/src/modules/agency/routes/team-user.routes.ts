import type { FastifyInstance } from 'fastify';
import { removeAgencyUser, updateAgencyUser } from '../team-admin.service.js';
import { getSessionFromRequest } from '../session-auth.js';

interface TeamUserParams {
  agencyId: string;
  userId: string;
}

function toErrorStatus(message: string): number {
  if (message === 'Forbidden') {
    return 403;
  }

  if (message === 'User not found') {
    return 404;
  }

  if (/last agency owner|last owner/i.test(message)) {
    return 409;
  }

  return 400;
}

export async function registerTeamUserRoutes(fastify: FastifyInstance) {
  fastify.patch<{ Params: TeamUserParams }>('/:agencyId/team/:userId', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      return reply.send(await updateAgencyUser(session, request.params.agencyId, request.params.userId, request.body));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected team member error';
      return reply.status(toErrorStatus(message)).send({ error: message });
    }
  });

  fastify.delete<{ Params: TeamUserParams }>('/:agencyId/team/:userId', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      await removeAgencyUser(session, request.params.agencyId, request.params.userId);
      return reply.send({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected team member error';
      return reply.status(toErrorStatus(message)).send({ error: message });
    }
  });
}
