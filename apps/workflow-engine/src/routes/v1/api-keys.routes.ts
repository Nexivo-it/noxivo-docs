import { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import mongoose from 'mongoose';
import { proxyToMessaging } from '../../lib/messaging-proxy-utils.js';
import { ApiKeyModel, MessagingSessionBindingModel } from '@noxivo/database';
import { dbConnect } from '../../lib/mongodb.js';
import { randomBytes } from 'node:crypto';
import { MessagingSessionService } from '../../lib/messaging-session.service.js';

type MessagingLiveSession = {
  name: string;
  status?: string;
  config?: {
    metadata?: {
      agencyId?: string;
      tenantId?: string;
      clusterId?: string;
      sessionBindingId?: string;
    };
  } | null;
};

const INTERNAL_PSK = process.env.WORKFLOW_ENGINE_INTERNAL_PSK;

const ApiKeyBodySchema = z.object({
  isAdmin: z.boolean(),
  session: z.string().nullable(),
  isActive: z.boolean(),
});

const ApiKeyIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

async function resolveAgencyAndTenant(agencyId: string, tenantId: string): Promise<{ agencyObjectId: mongoose.Types.ObjectId, tenantObjectId: mongoose.Types.ObjectId }> {
  const { AgencyModel, TenantModel } = await import('@noxivo/database');
  const isAgencyIdHex = /^[a-fA-F0-9]{24}$/.test(agencyId);
  const isTenantIdHex = /^[a-fA-F0-9]{24}$/.test(tenantId);

  let agencyObjectId: mongoose.Types.ObjectId;
  if (isAgencyIdHex) {
    agencyObjectId = new mongoose.Types.ObjectId(agencyId);
  } else {
    const agencyResult = await AgencyModel.findOne({ slug: agencyId }, { _id: 1 }).lean();
    if (!agencyResult) throw new Error('Agency not found by slug');
    agencyObjectId = agencyResult._id as mongoose.Types.ObjectId;
  }

  let tenantObjectId: mongoose.Types.ObjectId;
  if (isTenantIdHex) {
    tenantObjectId = new mongoose.Types.ObjectId(tenantId);
  } else {
    const tenantResult = await TenantModel.findOne({ agencyId: agencyObjectId, slug: tenantId }, { _id: 1 }).lean();
    if (!tenantResult) throw new Error('Tenant not found by slug');
    tenantObjectId = tenantResult._id as mongoose.Types.ObjectId;
  }

  return { agencyObjectId, tenantObjectId };
}

async function getLiveSessions(): Promise<MessagingLiveSession[]> {
  const payload = await proxyToMessaging('/api/sessions?all=true');
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload as MessagingLiveSession[];
}

function mapLiveSessionStatusToBindingStatus(status: string | undefined): 'active' | 'pending' | 'failed' | 'stopped' {
  const normalized = status?.trim().toUpperCase() ?? '';

  if (normalized === 'WORKING' || normalized === 'CONNECTED') {
    return 'active';
  }

  if (normalized === 'FAILED') {
    return 'failed';
  }

  if (normalized === 'STOPPED') {
    return 'stopped';
  }

  return 'pending';
}

async function recoverBindingFromLiveSession(input: {
  agencyId: string;
  tenantId: string;
  agencyObjectId: mongoose.Types.ObjectId;
  tenantObjectId: mongoose.Types.ObjectId;
}) {
  const liveSessions = await getLiveSessions();
  const matchingSession = liveSessions.find(
    (session) =>
      session.config?.metadata?.agencyId === input.agencyId
      && session.config?.metadata?.tenantId === input.tenantId
  );

  if (!matchingSession) {
    return null;
  }

  const clusterId = matchingSession.config?.metadata?.clusterId;
  if (!clusterId || !mongoose.Types.ObjectId.isValid(clusterId)) {
    return null;
  }

  await MessagingSessionBindingModel.findOneAndUpdate(
    {
      agencyId: input.agencyObjectId,
      tenantId: input.tenantObjectId
    },
    {
      $set: {
        clusterId: new mongoose.Types.ObjectId(clusterId),
        sessionName: matchingSession.name,
        messagingSessionName: matchingSession.name,
        status: mapLiveSessionStatusToBindingStatus(matchingSession.status),
        routingMetadata: {
          agencyId: input.agencyId,
          tenantId: input.tenantId,
          clusterId
        }
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  ).lean();

  return await MessagingSessionBindingModel.findOne({
    agencyId: input.agencyObjectId,
    tenantId: input.tenantObjectId,
    status: { $in: ['active', 'pending'] }
  }).lean();
}

export async function registerApiKeysRoutes(fastify: FastifyInstance) {
  // --- ADMIN/MASTER ROUTES (Proxied to MessagingProvider) ---
  
  fastify.get('/api/v1/keys', {
    schema: {
      summary: 'List Master Keys',
      description: 'Retrieve a list of all top-level MessagingProvider API keys. Restricted to Master Key holders.',
      tags: ['API Keys'],
      security: [{ apiKey: [] }],
    },
  }, async (request, reply) => {
    if (!request.context?.isMasterKey) {
      return reply.status(403).send({ error: 'Forbidden: Master key required for this operation' });
    }
    const keys = await proxyToMessaging('/api/keys');
    return reply.status(200).send(keys);
  });

  // --- SCOPED USER ROUTES (Internal Database) ---

  fastify.get('/api/v1/api-keys/me', {
    schema: {
      description: 'Get or create the scoped API key for the current session context',
      tags: ['Api Keys'],
      querystring: {
        type: 'object',
        required: ['agencyId', 'tenantId'],
        properties: {
          agencyId: { type: 'string' },
          tenantId: { type: 'string' }
        }
      },
      security: [{ apiKey: [] }]
    }
  }, async (request, reply) => {
    // This route is primarily for the Dashboard to fetch/init a key
    const { agencyId, tenantId } = request.query as { agencyId: string, tenantId: string };
    
    await dbConnect();
    const { agencyObjectId, tenantObjectId } = await resolveAgencyAndTenant(agencyId, tenantId);

    let keyRecord = await ApiKeyModel.findOne({
      agencyId: agencyObjectId,
      tenantId: tenantObjectId,
      status: 'active'
    }).lean();

    return reply.status(200).send({
      key: keyRecord?.key || null,
      status: keyRecord?.status || 'inactive'
    });
  });

  fastify.post('/api/v1/api-keys/me', {
    schema: {
      description: 'Generate a new scoped API key for the current session context',
      tags: ['Api Keys'],
      body: {
        type: 'object',
        required: ['agencyId', 'tenantId'],
        properties: {
          agencyId: { type: 'string' },
          tenantId: { type: 'string' }
        }
      },
      security: [{ apiKey: [] }]
    }
  }, async (request, reply) => {
    const { agencyId, tenantId } = request.body as { agencyId: string, tenantId: string };
    
    await dbConnect();
    const { agencyObjectId, tenantObjectId } = await resolveAgencyAndTenant(agencyId, tenantId);

    // Check WhatsApp session status directly from MessagingProvider
    let binding = await MessagingSessionBindingModel.findOne({
      agencyId: agencyObjectId,
      tenantId: tenantObjectId,
      status: { $in: ['active', 'pending'] }
    }).lean();

    let bootstrapErrorDetail: string | null = null;
    
    // If no binding yet, try to bootstrap one implicitly
    if (!binding) {
      try {
        const sessionService = new MessagingSessionService();
        await sessionService.bootstrap(agencyId, tenantId, 'implicit-api-key-bootstrap');
        
        binding = await MessagingSessionBindingModel.findOne({
          agencyId: agencyObjectId,
          tenantId: tenantObjectId,
          status: { $in: ['active', 'pending'] }
        }).lean();
      } catch (e) {
        bootstrapErrorDetail = String(e);

        if (bootstrapErrorDetail.includes('Tenant not found')) {
          binding = await recoverBindingFromLiveSession({
            agencyId,
            tenantId,
            agencyObjectId,
            tenantObjectId
          });
        }
      }
    }

    // Check session status directly in-process (avoids PSK HTTP self-call)
    let debugInfo = {
      hasBinding: !!binding,
      status: binding?.status ?? 'none',
      hasSessionName: !!binding?.messagingSessionName,
      profileFound: false,
      profileError: null as string | null,
      bootstrapError: bootstrapErrorDetail
    };

    if (binding) {
      let isWaConnected = false;

      // Trust an 'active' binding as a baseline
      if (binding.status === 'active') {
        isWaConnected = true;
      }

      // If we have a messagingSessionName, do a live profile check for extra confidence
      if (binding.messagingSessionName) {
        try {
          const sessionService = new MessagingSessionService();
          const profile = await sessionService.getProfile(binding.messagingSessionName);
          if (profile) {
            debugInfo.profileFound = true;
            isWaConnected = true;
          }
        } catch (e) {
          debugInfo.profileError = String(e);
          // Live check failed — fall back to DB binding status already set above
        }
      }

      if (!isWaConnected) {
        return reply.status(400).send({ error: 'WhatsApp must be connected and active before enabling API access.', debug: debugInfo });
      }
    } else {
      return reply.status(400).send({ error: 'WhatsApp must be connected and active before enabling API access.', debug: debugInfo });
    }

    // Revoke old keys
    await ApiKeyModel.updateMany({ agencyId: agencyObjectId, tenantId: tenantObjectId }, { $set: { status: 'revoked' } });

    // Generate new key
    const key = `nx_${randomBytes(24).toString('hex')}`;
    const keyRecord = await ApiKeyModel.create({
      key,
      agencyId: agencyObjectId,
      tenantId: tenantObjectId,
      name: `User Key for ${agencyId}/${tenantId}`,
      status: 'active'
    });

    return reply.status(201).send({
      key: keyRecord.key,
      status: 'active'
    });
  });

  fastify.delete('/api/v1/api-keys/me', {
    schema: {
      description: 'Revoke the current scoped API key',
      tags: ['Api Keys'],
      body: {
        type: 'object',
        required: ['agencyId', 'tenantId'],
        properties: {
          agencyId: { type: 'string' },
          tenantId: { type: 'string' }
        }
      },
      security: [{ apiKey: [] }]
    }
  }, async (request, reply) => {
    const { agencyId, tenantId } = request.body as { agencyId: string, tenantId: string };
    await dbConnect();
    const { agencyObjectId, tenantObjectId } = await resolveAgencyAndTenant(agencyId, tenantId);
    await ApiKeyModel.updateMany({ agencyId: agencyObjectId, tenantId: tenantObjectId }, { $set: { status: 'revoked' } });
    return reply.status(200).send({ success: true });
  });
}
