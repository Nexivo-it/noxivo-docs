import type { FastifyInstance } from 'fastify';
import { getAgencyTenantDetail } from '../agency-admin.service.js';
import { getSessionFromRequest } from '../session-auth.js';

interface TenantParams {
  agencyId: string;
  tenantId: string;
}

function toErrorStatus(message: string): number {
  if (message === 'Forbidden') {
    return 403;
  }

  if (message === 'Agency not found' || message === 'Tenant not found') {
    return 404;
  }

  return 400;
}

export async function registerTenantSingleRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: TenantParams }>('/:agencyId/tenants/:tenantId', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      return reply.send(await getAgencyTenantDetail(session, request.params.agencyId, request.params.tenantId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected tenants error';
      return reply.status(toErrorStatus(message)).send({ error: message });
    }
  });
}
