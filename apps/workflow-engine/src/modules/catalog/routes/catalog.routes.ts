import type { FastifyInstance } from 'fastify';
import { createCatalogItem, getCatalogItems } from '../catalog.service.js';
import { requireCatalogTenantContext } from './shared.js';

export async function registerCatalogRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const context = await requireCatalogTenantContext(request, reply);
    if (!context) {
      return;
    }

    try {
      const items = await getCatalogItems(context.tenantId);
      return reply.send({ items });
    } catch (error) {
      request.log.error(error, 'Error fetching catalog');
      return reply.status(200).send({ items: [], error: 'Failed to fetch catalog' });
    }
  });

  fastify.post('/', async (request, reply) => {
    const context = await requireCatalogTenantContext(request, reply);
    if (!context) {
      return;
    }

    try {
      const body = request.body;
      const payload =
        body && typeof body === 'object' && !Array.isArray(body) && 'payload' in body
          ? (body as { payload?: unknown }).payload
          : null;

      const item = await createCatalogItem(
        context.tenantId,
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {},
      );
      return reply.send({ item });
    } catch (error) {
      request.log.error(error, 'Error creating catalog item');
      return reply.status(500).send({ error: 'Failed to create item' });
    }
  });
}
