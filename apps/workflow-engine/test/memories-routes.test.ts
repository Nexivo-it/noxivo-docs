import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AgencyModel,
  AuthSessionModel,
  ContactMemoryModel,
  TenantModel,
  UserModel,
} from '@noxivo/database';
import { buildServer } from '../src/server.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb,
} from './helpers/mongo-memory.js';

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function createSessionCookie(input: {
  userId: mongoose.Types.ObjectId;
  agencyId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
}): Promise<string> {
  const token = `session-${new mongoose.Types.ObjectId().toString()}`;

  await AuthSessionModel.create({
    userId: input.userId,
    agencyId: input.agencyId,
    tenantId: input.tenantId,
    sessionTokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + 60_000),
    lastSeenAt: new Date(),
  });

  return `noxivo_session=${encodeURIComponent(token)}`;
}

async function seedSessionContext() {
  const agencyId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  await AgencyModel.create({
    _id: agencyId,
    name: 'Memories Agency',
    slug: 'memories-agency',
    plan: 'enterprise',
    billingStripeCustomerId: null,
    billingStripeSubscriptionId: null,
    billingOwnerUserId: userId,
    whiteLabelDefaults: {
      customDomain: null,
      logoUrl: null,
      primaryColor: '#6366F1',
      supportEmail: 'ops@memories.test',
      hidePlatformBranding: false,
    },
    usageLimits: { tenants: 5, activeSessions: 25 },
    status: 'active',
  });

  await TenantModel.create({
    _id: tenantId,
    agencyId,
    slug: 'memories-tenant',
    name: 'Memories Tenant',
    region: 'us-east-1',
    status: 'active',
    billingMode: 'agency_pays',
    whiteLabelOverrides: {},
    effectiveBrandingCache: {},
  });

  await UserModel.create({
    _id: userId,
    agencyId,
    defaultTenantId: tenantId,
    tenantIds: [tenantId],
    email: 'memories-admin@test.dev',
    fullName: 'Memories Admin',
    passwordHash: 'hash',
    role: 'agency_admin',
    status: 'active',
  });

  return { agencyId, tenantId, userId };
}

describe('memories routes on workflow-engine', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-workflow-engine-memories-routes-tests' });
    await Promise.all([
      AgencyModel.init(),
      TenantModel.init(),
      UserModel.init(),
      AuthSessionModel.init(),
      ContactMemoryModel.init(),
    ]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('supports GET, POST, and DELETE /api/v1/memories for dashboard callers', async () => {
    const context = await seedSessionContext();
    const cookie = await createSessionCookie(context);
    const server = await buildServer({ logger: false });

    try {
      const createResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/memories',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          contactId: '15550001111@c.us',
          fact: 'Prefers morning appointments',
        },
      });

      expect(createResponse.statusCode).toBe(200);
      expect(createResponse.json()).toEqual({ success: true });

      const listResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/memories?contactId=15550001111%40c.us',
        headers: { cookie },
      });

      expect(listResponse.statusCode).toBe(200);
      const listPayload = listResponse.json() as {
        memories: Array<{
          id: string;
          fact: string;
          category: string;
          source: string;
          confidence: number;
          createdAt: string;
        }>;
      };
      expect(listPayload.memories).toHaveLength(1);
      expect(listPayload.memories[0]).toMatchObject({
        fact: 'Prefers morning appointments',
        category: 'custom',
      });

      const deleteResponse = await server.inject({
        method: 'DELETE',
        url: `/api/v1/memories?memoryId=${encodeURIComponent(listPayload.memories[0].id)}`,
        headers: { cookie },
      });

      expect(deleteResponse.statusCode).toBe(200);
      expect(deleteResponse.json()).toEqual({ success: true });

      const listAfterDelete = await server.inject({
        method: 'GET',
        url: '/api/v1/memories?contactId=15550001111%40c.us',
        headers: { cookie },
      });

      expect(listAfterDelete.statusCode).toBe(200);
      expect(listAfterDelete.json()).toEqual({ memories: [] });
    } finally {
      await server.close();
    }
  });
});
