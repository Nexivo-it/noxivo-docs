import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

export const swaggerPlugin = fp(async (fastify: FastifyInstance) => {
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Noxivo Engine API',
        description: 'Independent, headless WhatsApp & Automation engine. <br/><br/><b>Quick Links:</b><br/>• <a href="/admin" style="color: #0C5CAB; font-weight: bold;">Go to Admin Dashboard</a> | <a href="https://noxivo-docs.netlify.app" target="_blank" style="color: #0C5CAB; font-weight: bold;">Documentation</a>',
        version: '1.0.0'
      },
      servers: [
        {
          url: 'https://api-workflow-engine.khelifi-salmen.com',
          description: 'Production Server'
        },
        {
          url: 'http://localhost:3001',
          description: 'Local Development'
        }
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'API-Key',
            in: 'header',
            description: 'Your secret API key. Get it from Dashboard Settings > API Keys.'
          },
          psk: {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header',
            description: 'Internal PSK for dashboard registration and admin routes.'
          }
        }
      },
      security: [{ apiKey: [] }, { psk: [] }]
    }
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/',
    staticCSP: true,
    transformStaticCSP: (header) => header,
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
      tryItOutEnabled: true
    }
  });
});
