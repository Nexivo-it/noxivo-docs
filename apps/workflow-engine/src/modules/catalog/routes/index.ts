import type { FastifyInstance } from 'fastify';
import { registerCatalogRoutes } from './catalog.routes.js';
import { registerCatalogItemRoutes } from './catalog-item.routes.js';
import { registerCatalogSettingsRoutes } from './catalog-settings.routes.js';
import { registerCatalogUploadRoutes } from './catalog-upload.routes.js';
import { registerCatalogAiHelpRoutes } from './catalog-ai-help.routes.js';
import { registerCatalogPublishRoutes } from './catalog-publish.routes.js';

export async function catalogRoutes(fastify: FastifyInstance) {
  await registerCatalogRoutes(fastify);
  await registerCatalogItemRoutes(fastify);
  await registerCatalogSettingsRoutes(fastify);
  await registerCatalogUploadRoutes(fastify);
  await registerCatalogAiHelpRoutes(fastify);
  await registerCatalogPublishRoutes(fastify);
}
