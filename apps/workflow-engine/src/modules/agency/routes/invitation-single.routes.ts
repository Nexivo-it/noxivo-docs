import type { FastifyInstance } from 'fastify';
import { revokeAgencyInvitation, updateAgencyInvitation } from '../team-admin.service.js';
import { getSessionFromRequest } from '../session-auth.js';

interface InvitationParams {
  agencyId: string;
  invitationId: string;
}

function toErrorStatus(message: string): number {
  if (message === 'Forbidden') {
    return 403;
  }

  if (message === 'Invitation not found') {
    return 404;
  }

  if (/already belongs/i.test(message)) {
    return 409;
  }

  return 400;
}

export async function registerInvitationSingleRoutes(fastify: FastifyInstance) {
  fastify.patch<{ Params: InvitationParams }>('/:agencyId/invitations/:invitationId', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      return reply.send(await updateAgencyInvitation(session, request.params.agencyId, request.params.invitationId, request.body));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected invitation error';
      return reply.status(toErrorStatus(message)).send({ error: message });
    }
  });

  fastify.delete<{ Params: InvitationParams }>('/:agencyId/invitations/:invitationId', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      await revokeAgencyInvitation(session, request.params.agencyId, request.params.invitationId);
      return reply.send({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected invitation error';
      return reply.status(toErrorStatus(message)).send({ error: message });
    }
  });
}
