import type { FastifyInstance } from 'fastify';
import { deleteCatalogItem, getCatalogItemById, updateCatalogItem } from '../catalog.service.js';
import { requireCatalogTenantContext } from './shared.js';

export async function registerCatalogItemRoutes(fastify: FastifyInstance) {
  fastify.get('/:id', async (request, reply) => {
    const context = await requireCatalogTenantContext(request, reply);
    if (!context) {
      return;
    }

    try {
      const itemId = (request.params as { id: string }).id;
      const item = await getCatalogItemById(context.tenantId, itemId);
      if (!item) {
        return reply.status(404).send({ error: 'Item not found' });
      }
      return reply.send(item);
    } catch (error) {
      request.log.error(error, 'Error fetching catalog item');
      return reply.status(500).send({ error: 'Failed to fetch item' });
    }
  });

  fastify.patch('/:id', async (request, reply) => {
    const context = await requireCatalogTenantContext(request, reply);
    if (!context) {
      return;
    }

    try {
      const itemId = (request.params as { id: string }).id;
      const payload = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? (request.body as Record<string, unknown>)
        : {};
      const item = await updateCatalogItem(context.tenantId, itemId, payload);
      return reply.send(item);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update item';
      if (message === 'Item not found') {
        return reply.status(404).send({ error: message });
      }

      request.log.error(error, 'Error updating catalog item');
      return reply.status(500).send({ error: 'Failed to update item' });
    }
  });

  fastify.delete('/:id', async (request, reply) => {
    const context = await requireCatalogTenantContext(request, reply);
    if (!context) {
      return;
    }

    try {
      const itemId = (request.params as { id: string }).id;
      await deleteCatalogItem(context.tenantId, itemId);
      return reply.send({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete item';
      if (message === 'Item not found') {
        return reply.status(404).send({ error: message });
      }

      request.log.error(error, 'Error deleting catalog item');
      return reply.status(500).send({ error: 'Failed to delete item' });
    }
  });
}
