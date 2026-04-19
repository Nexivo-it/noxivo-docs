import { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { ApiKeyModel } from '@noxivo/database';
import { dbConnect } from '../lib/mongodb.js';

declare module 'fastify' {
  interface FastifyInstance {
    verifyApiKey(request: FastifyRequest, reply: FastifyReply): Promise<boolean>;
  }
  interface FastifyRequest {
    context?: {
      agencyId: string;
      tenantId: string;
      isMasterKey: boolean;
    };
  }
}

export const apiAuthPlugin = fp(async (fastify: FastifyInstance) => {
  fastify.decorate('verifyApiKey', async (request: FastifyRequest, reply: FastifyReply): Promise<boolean> => {
    const masterKey = process.env.ENGINE_API_KEY;

    if (!masterKey) {
      fastify.log.error('ENGINE_API_KEY is not configured in environment');
      void reply.status(500).send({ error: 'Server configuration error' });
      return false;
    }

    const apiKeyHeader = request.headers['api-key'] || request.headers['x-api-key'];
    const apiKey = typeof apiKeyHeader === 'string' ? apiKeyHeader : Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : undefined;

    if (!apiKey) {
      void reply.status(401).send({ error: 'Unauthorized: Missing API Key' });
      return false;
    }

    // 1. Check if it's the Master Key
    if (apiKey === masterKey) {
      request.context = {
        agencyId: (request.body as any)?.agencyId || (request.query as any)?.agencyId,
        tenantId: (request.body as any)?.tenantId || (request.query as any)?.tenantId,
        isMasterKey: true
      };
      return true;
    }

    // 2. Check for scoped user keys in DB
    try {
      await dbConnect();
      const keyRecord = await ApiKeyModel.findOne({ key: apiKey, status: 'active' }).lean();

      if (!keyRecord) {
        void reply.status(401).send({ error: 'Unauthorized: Invalid API Key' });
        return false;
      }

      // Inject context from the key
      request.context = {
        agencyId: keyRecord.agencyId.toString(),
        tenantId: keyRecord.tenantId.toString(),
        isMasterKey: false
      };

      // Helper for Zero-Config GET requests: auto-inject into query if missing
      const requestPath = (request.url ?? '').split('?')[0] ?? '';
      if (requestPath === '/api/v1/sessions/by-tenant' || requestPath === '/v1/inbox/chats') {
        const query = request.query as any;
        if (!query.agencyId) query.agencyId = request.context.agencyId;
        if (!query.tenantId) query.tenantId = request.context.tenantId;
      }

      // Update last used (fire and forget)
      void ApiKeyModel.updateOne({ _id: keyRecord._id }, { $set: { lastUsedAt: new Date() } }).exec();

      return true;
    } catch (err) {
      fastify.log.error(err, 'Failed to verify scoped API key');
      void reply.status(500).send({ error: 'Internal server error during authentication' });
      return false;
    }
  });

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestPath = (request.url ?? '').split('?')[0] ?? '';

    // Protect public /api/v1/* and /v1/* routes with API key.
    // Admin routes and internal dashboard routes are guarded by PSK or session middleware.
    const isPublicV1 = requestPath.startsWith('/api/v1/') || requestPath.startsWith('/v1/');
    const isExcluded = requestPath.startsWith('/api/v1/admin/') || 
                     requestPath.startsWith('/v1/internal/') || 
                     requestPath.startsWith('/v1/webhooks/');

    if (!isPublicV1 || isExcluded) {
      return;
    }

    if (!(await fastify.verifyApiKey(request, reply))) {
      return;
    }
  });
});
