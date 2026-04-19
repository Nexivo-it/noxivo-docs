import { type FastifyInstance } from 'fastify';
import { proxyToMessaging } from '../../lib/messaging-proxy-utils.js';
import { dbConnect } from '../../lib/mongodb.js';
import { MediaStorageConfigModel } from '@noxivo/database';
import { MediaStorageConfigSchema } from '@noxivo/contracts';

// Helper to sanitize secrets from the response
function redactMediaConfig(config: any) {
  if (!config) return null;
  const copy = { ...config };
  if (copy.secretConfig) {
    const redacted: Record<string, string> = {};
    for (const key of Object.keys(copy.secretConfig)) {
      redacted[key] = '***REDACTED***';
    }
    copy.secretConfig = redacted;
  }
  return copy;
}

export async function registerStorageRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/storage', {
    schema: {
      description: 'Get internal storage metrics',
      tags: ['Storage'],
      security: [{ apiKey: [] }]
    }
  }, async (request, reply) => {
    // Basic proxy to any available MessagingProvider storage endpoint, e.g. GET /api/files
    try {
      const storage = await proxyToMessaging('/api/files');
      return reply.status(200).send(storage);
    } catch (e) {
      return reply.status(200).send({ message: 'Storage API might not be supported by this MessagingProvider version.' });
    }
  });

  fastify.get<{ Querystring: { agencyId: string } }>('/api/v1/storage/config', {
    schema: {
      description: 'Get media storage configuration for an agency',
      tags: ['Storage'],
      security: [{ apiKey: [] }],
      querystring: {
        type: 'object',
        required: ['agencyId'],
        properties: {
          agencyId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    await dbConnect();
    const agencyId = request.query.agencyId;
    const config = await MediaStorageConfigModel.findOne({ agencyId }).lean();
    return reply.status(200).send(config ? redactMediaConfig(config) : null);
  });

  fastify.put<{ Body: { agencyId: string; provider: string; isActive: boolean; publicBaseUrl: string; publicConfig: Record<string, any>; secretConfig: Record<string, string>; pathPrefix: string } }>('/api/v1/storage/config', {
    schema: {
      description: 'Update media storage configuration for an agency',
      tags: ['Storage'],
      security: [{ apiKey: [] }],
      body: {
        type: 'object',
        required: ['agencyId', 'provider', 'publicBaseUrl'],
        properties: {
          agencyId: { type: 'string' },
          provider: { type: 'string' },
          isActive: { type: 'boolean', default: true },
          publicBaseUrl: { type: 'string' },
          publicConfig: { type: 'object', additionalProperties: true, default: {} },
          secretConfig: { type: 'object', additionalProperties: true, default: {} },
          pathPrefix: { type: 'string', default: '' },
        }
      }
    }
  }, async (request, reply) => {
    await dbConnect();
    
    // Use the contract schema to parse the payload (excluding agencyId which is added here)
    const input = MediaStorageConfigSchema.parse(request.body);
    const agencyId = request.body.agencyId;

    const config = await MediaStorageConfigModel.findOneAndUpdate(
      { agencyId },
      {
        $set: {
          agencyId,
          provider: input.provider,
          isActive: input.isActive,
          publicBaseUrl: input.publicBaseUrl,
          publicConfig: input.publicConfig,
          secretConfig: input.secretConfig,
          pathPrefix: input.pathPrefix,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return reply.status(200).send(redactMediaConfig(config));
  });
}
