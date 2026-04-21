import type { FastifyInstance } from 'fastify';
import { inviteAgencyTeamMember, listAgencyTeam } from '../team-admin.service.js';
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

  if (/already belongs/i.test(message)) {
    return 409;
  }

  return 400;
}

export async function registerInvitationsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: AgencyParams }>('/:agencyId/invitations', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const team = await listAgencyTeam(session, request.params.agencyId);
      return reply.send(team.invitations);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected invitation error';
      return reply.status(toErrorStatus(message)).send({ error: message });
    }
  });

  fastify.post<{ Params: AgencyParams }>('/:agencyId/invitations', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      return reply.status(201).send(await inviteAgencyTeamMember(session, request.params.agencyId, request.body));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected invitation error';
      return reply.status(toErrorStatus(message)).send({ error: message });
    }
  });
}
