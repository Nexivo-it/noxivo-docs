import type { FastifyInstance } from 'fastify';
import { getCatalogSettings, updateCatalogSettings } from '../catalog-settings.service.js';
import { requireCatalogTenantContext } from './shared.js';

export async function registerCatalogSettingsRoutes(fastify: FastifyInstance) {
  fastify.get('/settings', async (request, reply) => {
    const context = await requireCatalogTenantContext(request, reply);
    if (!context) {
      return;
    }

    try {
      const result = await getCatalogSettings(context.tenantId, context.agencyId);
      return reply.send(result);
    } catch (error) {
      request.log.error(error, 'Failed to get catalog settings');
      return reply.status(500).send({
        error: 'Internal Server Error',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  fastify.post('/settings', async (request, reply) => {
    const context = await requireCatalogTenantContext(request, reply);
    if (!context) {
      return;
    }

    try {
      const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? request.body
        : {};

      const settings = await updateCatalogSettings(
        context.tenantId,
        context.agencyId,
        body as {
          businessName?: string;
          currency?: 'USD' | 'EUR' | 'GBP' | 'VND' | 'AUD' | 'CAD';
          timezone?: string;
          accentColor?: string;
          logoUrl?: string;
          defaultDuration?: number;
          storage?: {
            provider?: 's3' | 'google_drive' | 'imagekit' | 'cloudinary' | 'bunny' | 'cloudflare_r2' | 'local';
            isActive?: boolean;
            publicBaseUrl?: string;
            publicConfig?: Record<string, string | number | boolean | null>;
            secretConfig?: Record<string, string>;
            pathPrefix?: string;
          };
        },
      );

      return reply.send(settings);
    } catch (error) {
      request.log.error(error, 'Failed to update catalog settings');
      return reply.status(500).send({
        error: 'Internal Server Error',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
