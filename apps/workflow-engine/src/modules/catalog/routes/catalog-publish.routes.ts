import type { FastifyInstance } from 'fastify';
import { publishCatalogItems } from '../catalog-publish.service.js';
import { requireCatalogTenantContext } from './shared.js';

export async function registerCatalogPublishRoutes(fastify: FastifyInstance) {
  fastify.post('/publish', async (request, reply) => {
    const context = await requireCatalogTenantContext(request, reply);
    if (!context) {
      return;
    }

    try {
      const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? (request.body as { destination?: unknown; items?: unknown })
        : {};

      const items = Array.isArray(body.items)
        ? body.items.filter((entry): entry is {
          id: string;
          catalogId: string;
          itemType: 'service' | 'add_on' | 'bundle' | 'package' | 'category_marker' | 'internal_note';
          name: string;
          slug: string;
          shortDescription: string;
          longDescription: string;
          priceAmount: number;
          priceCurrency: string;
          isVariablePrice: boolean;
          durationMinutes: number;
          status: 'draft' | 'needs_review' | 'missing_image' | 'missing_price' | 'ready' | 'published';
          sortOrder: number;
          categoryId: string;
          mediaIds: string[];
          mediaPath: string | null;
          variations: string;
          conditions: string;
          notes: string;
          details: string;
          imageUrl: string;
          customFields: string;
          gallery: string;
          reviews: string;
          isActive: boolean;
          seoTitle: string;
          seoDescription: string;
          seoKeywords: string[];
        } => typeof entry === 'object' && entry !== null)
        : undefined;

      const result = await publishCatalogItems({
        tenantId: context.tenantId,
        destination: body.destination,
        ...(items ? { items } : {}),
      });

      return reply.send(result);
    } catch (error) {
      request.log.error(error, 'Publish route failed');
      return reply.status(500).send({ error: 'Publish failed' });
    }
  });
}
