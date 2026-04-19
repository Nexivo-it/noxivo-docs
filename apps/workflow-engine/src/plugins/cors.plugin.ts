import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import cors from '@fastify/cors';

export const corsPlugin = fp(async (fastify: FastifyInstance) => {
  const allowedOrigins = process.env.ALLOWED_CORS_ORIGINS 
    ? process.env.ALLOWED_CORS_ORIGINS.split(',') 
    : [
        'http://localhost:5173', 
        'http://localhost:5174', 
        'http://localhost:3000',
        'https://api-workflow-engine.khelifi-salmen.com',
        'https://dashboard.khelifi-salmen.com',
        'https://noxivo-admin-portal.netlify.app',
        'https://noxivo-landing-saas.netlify.app'
      ];

  await fastify.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) {
        cb(null, true);
        return;
      }

      // Check if origin is in allowed list or matches internal subdomains
      const isAllowed = allowedOrigins.some(allowed => {
        if (allowed.includes('*')) {
          const pattern = new RegExp(`^${allowed.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`);
          return pattern.test(origin);
        }
        return allowed === origin;
      }) || origin.endsWith('.khelifi-salmen.com');

      if (isAllowed) {
        cb(null, true);
        return;
      }

      cb(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'X-Requested-With', 'Accept'],
  });
});
