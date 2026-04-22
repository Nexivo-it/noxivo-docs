import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { normalizeDocsReturnTo, serializeDocsAccessCookie, verifyWorkflowEngineDocsBridgeToken } from '../modules/docs/docs-access.js';

export const swaggerPlugin = fp(async (fastify: FastifyInstance) => {
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Noxivo Engine API',
        description: 'Independent, headless WhatsApp & Automation engine. <br/><br/><b>Quick Links:</b><br/>• <a href="https://admin.noxivo.app/" style="color: #25D366; font-weight: bold;">Go to Admin Dashboard</a> | <a href="https://noxivo.app/dashboard/engine-docs" style="color: #25D366; font-weight: bold;">Documentation</a>',
        version: '1.0.0'
      },
      servers: [
        {
          url: 'https://api-workflow-engine.noxivo.app',
          description: 'Production Server'
        },
        {
          url: 'http://localhost:4000',
          description: 'Local Development'
        }
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'API-Key',
            in: 'header',
            description: 'Your secret API key. Get it from Client Dashboard > Settings > API Keys.'
          },
          psk: {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header',
            description: 'Internal PSK for admin and registration routes.'
          }
        }
      },
      security: [{ apiKey: [] }, { psk: [] }]
    }
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    exposeRoute: true,
    staticCSP: true,
    transformStaticCSP: (header) => header,
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      tryItOutEnabled: true,
      filter: true // Adds a search filter for clean navigation
    }
  });

  fastify.get('/docs/authorize', async (request, reply) => {
    const query = request.query as {
      returnTo?: string;
      token?: string;
    };
    const verifiedToken = verifyWorkflowEngineDocsBridgeToken(query.token);
    if (!verifiedToken || !query.token) {
      return reply.status(401).send({ error: 'Invalid or expired docs access token' });
    }

    reply.header('set-cookie', serializeDocsAccessCookie(query.token));
    return reply.redirect(normalizeDocsReturnTo(query.returnTo));
  });
});
