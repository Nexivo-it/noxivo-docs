import type { FastifyInstance } from 'fastify';
import { refineCatalogSeo, suggestCatalogMetadata } from '../catalog-ai.service.js';
import { requireCatalogTenantContext } from './shared.js';

export async function registerCatalogAiHelpRoutes(fastify: FastifyInstance) {
  fastify.post('/ai-help', async (request, reply) => {
    const context = await requireCatalogTenantContext(request, reply);
    if (!context) {
      return;
    }

    try {
      const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? (request.body as { context?: unknown; mode?: unknown })
        : {};

      if (body.mode === 'seo-only' && body.context && typeof body.context === 'object' && !Array.isArray(body.context)) {
        const suggestions = await refineCatalogSeo(body.context as { title: string; description: string; name: string });
        return reply.send({ suggestions });
      }

      const suggestions = await suggestCatalogMetadata(
        body.context && typeof body.context === 'object' && !Array.isArray(body.context)
          ? (body.context as { itemType: string; name?: string; currentDescription?: string; industry?: string })
          : { itemType: 'service' },
      );
      return reply.send({ suggestions });
    } catch (error) {
      request.log.error(error, 'Catalog AI help route failed');
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Failed to generate AI suggestions',
      });
    }
  });
}
