import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getSessionFromRequest } from '../../modules/agency/session-auth.js';
import { memoryService } from '../../modules/memory/memory.service.js';

type MemorySessionContext = {
  agencyId: string;
  tenantId: string;
};

async function requireMemorySessionContext(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<MemorySessionContext | null> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    await reply.status(401).send({ error: 'Unauthorized' });
    return null;
  }

  const tenantId = session.actor.tenantId;
  const agencyId = session.actor.agencyId;

  if (!tenantId || !agencyId) {
    await reply.status(400).send({ error: 'No tenant scope' });
    return null;
  }

  return { agencyId, tenantId };
}

export async function registerMemoriesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/v1/memories', async (request, reply) => {
    const context = await requireMemorySessionContext(request, reply);
    if (!context) {
      return;
    }

    const query = request.query as { contactId?: string };
    const contactId = query.contactId;

    if (!contactId) {
      return reply.status(400).send({ error: 'contactId required' });
    }

    try {
      const memories = await memoryService.getAll({
        agencyId: context.agencyId,
        tenantId: context.tenantId,
        contactId,
      });

      return reply.status(200).send({ memories });
    } catch (error) {
      request.log.error({ error }, 'Failed to fetch memories');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.post('/api/v1/memories', async (request, reply) => {
    const context = await requireMemorySessionContext(request, reply);
    if (!context) {
      return;
    }

    const body = request.body as {
      contactId?: string;
      fact?: string;
      category?: string;
      source?: string;
    };

    if (!body.contactId || !body.fact) {
      return reply.status(400).send({ error: 'contactId and fact required' });
    }

    try {
      const upsertInput: {
        agencyId: string;
        tenantId: string;
        contactId: string;
        fact: string;
        source: string;
        category?: string;
      } = {
        agencyId: context.agencyId,
        tenantId: context.tenantId,
        contactId: body.contactId,
        fact: body.fact,
        source: body.source ?? 'manual',
      };

      if (body.category) {
        upsertInput.category = body.category;
      }

      await memoryService.upsert(upsertInput);

      return reply.status(200).send({ success: true });
    } catch (error) {
      request.log.error({ error }, 'Failed to create memory');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.delete('/api/v1/memories', async (request, reply) => {
    const context = await requireMemorySessionContext(request, reply);
    if (!context) {
      return;
    }

    const query = request.query as { memoryId?: string };
    const memoryId = query.memoryId;

    if (!memoryId) {
      return reply.status(400).send({ error: 'memoryId required' });
    }

    try {
      await memoryService.delete(memoryId, context.agencyId, context.tenantId);
      return reply.status(200).send({ success: true });
    } catch (error) {
      request.log.error({ error }, 'Failed to delete memory');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
}
