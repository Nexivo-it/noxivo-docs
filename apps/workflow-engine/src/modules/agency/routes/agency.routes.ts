import type { FastifyInstance } from 'fastify';
import { createAgency, listAccessibleAgencies } from '../agency-admin.service.js';
import { getSessionFromRequest } from '../session-auth.js';

function toErrorStatus(message: string): number {
  if (message === 'Forbidden') {
    return 403;
  }

  if (/already in use|already belongs/i.test(message)) {
    return 409;
  }

  return 400;
}

export async function registerAgencyRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      return reply.send(await listAccessibleAgencies(session));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected agencies error';
      return reply.status(toErrorStatus(message)).send({ error: message });
    }
  });

  fastify.post('/', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      return reply.status(201).send(await createAgency(session, request.body));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected agencies error';
      return reply.status(toErrorStatus(message)).send({ error: message });
    }
  });
}
