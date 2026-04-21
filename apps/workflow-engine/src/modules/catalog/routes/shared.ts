import type { FastifyReply, FastifyRequest } from 'fastify';
import { getSessionFromRequest } from '../../agency/session-auth.js';

export async function requireCatalogTenantContext(request: FastifyRequest, reply: FastifyReply): Promise<{ tenantId: string; agencyId: string } | null> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    await reply.status(401).send({ error: 'Unauthorized' });
    return null;
  }

  const tenantId = session.actor.tenantId || session.actor.tenantIds.find((candidate) => candidate.length > 0) || '';
  if (!tenantId) {
    await reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }

  return {
    tenantId,
    agencyId: session.actor.agencyId,
  };
}
