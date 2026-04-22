import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AgencyModel,
  AuthSessionModel,
  ConversationModel,
  MessagingSessionBindingModel,
  TenantModel,
  UsageMeterEventModel,
  UserModel,
  WorkflowDefinitionModel,
  WorkflowExecutionEventModel,
  WorkflowRunModel,
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
    expiresAt: new Date(Date.now() + 120_000),
    lastSeenAt: new Date(),
  });

  return `noxivo_session=${encodeURIComponent(token)}`;
}

async function seedDashboardAggregateActor() {
  const agencyId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const secondTenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  await AgencyModel.create({
    _id: agencyId,
    name: 'Aggregate Agency',
    slug: `aggregate-${agencyId.toString().slice(-6)}`,
    plan: 'reseller_pro',
    billingStripeCustomerId: null,
    billingStripeSubscriptionId: null,
    billingOwnerUserId: userId,
    whiteLabelDefaults: {
      customDomain: null,
      logoUrl: null,
      primaryColor: '#6366F1',
      supportEmail: 'ops@aggregate.test',
      hidePlatformBranding: false,
    },
    usageLimits: { tenants: 20, activeSessions: 100 },
    status: 'active',
  });

  await TenantModel.create([
    {
      _id: tenantId,
      agencyId,
      slug: 'aggregate-main',
      name: 'Aggregate Main',
      region: 'us-east-1',
      status: 'active',
      billingMode: 'agency_pays',
      whiteLabelOverrides: {},
      effectiveBrandingCache: {},
    },
    {
      _id: secondTenantId,
      agencyId,
      slug: 'aggregate-secondary',
      name: 'Aggregate Secondary',
      region: 'us-east-1',
      status: 'trial',
      billingMode: 'tenant_pays',
      whiteLabelOverrides: {},
      effectiveBrandingCache: {},
    },
  ]);

  await UserModel.create({
    _id: userId,
    agencyId,
    defaultTenantId: tenantId,
    tenantIds: [tenantId, secondTenantId],
    email: 'aggregate-admin@test.dev',
    fullName: 'Aggregate Admin',
    passwordHash: 'hash',
    role: 'agency_admin',
    status: 'active',
  });

  await ConversationModel.create([
    {
      _id: new mongoose.Types.ObjectId(),
      agencyId,
      tenantId,
      contactId: '15550000001@c.us',
      contactName: 'Alice',
      contactPhone: '+15550000001',
      status: 'open',
      unreadCount: 0,
      metadata: {},
    },
    {
      _id: new mongoose.Types.ObjectId(),
      agencyId,
      tenantId: secondTenantId,
      contactId: '15550000002@c.us',
      contactName: 'Bob',
      contactPhone: '+15550000002',
      status: 'open',
      unreadCount: 0,
      metadata: {},
    },
  ]);

  const workflowOne = await WorkflowDefinitionModel.create({
    agencyId,
    tenantId,
    key: 'workflow-active',
    version: '1.0.0',
    name: 'Workflow Active',
    description: 'Active workflow',
    channel: 'whatsapp',
    editorGraph: { nodes: [], edges: [] },
    compiledDag: {
      entryNodeId: 'trigger_1',
      topologicalOrder: ['trigger_1'],
      nodes: [{ id: 'trigger_1', type: 'trigger', next: [], input: {} }],
      metadata: { compiledAt: new Date().toISOString(), version: '1.0.0', nodeCount: 1 },
    },
    isActive: true,
    isTemplate: false,
  });

  await WorkflowDefinitionModel.create({
    agencyId,
    tenantId: secondTenantId,
    key: 'workflow-paused',
    version: '1.0.0',
    name: 'Workflow Paused',
    description: 'Paused workflow',
    channel: 'whatsapp',
    editorGraph: { nodes: [], edges: [] },
    compiledDag: {
      entryNodeId: 'trigger_1',
      topologicalOrder: ['trigger_1'],
      nodes: [{ id: 'trigger_1', type: 'trigger', next: [], input: {} }],
      metadata: { compiledAt: new Date().toISOString(), version: '1.0.0', nodeCount: 1 },
    },
    isActive: false,
    isTemplate: false,
  });

  await MessagingSessionBindingModel.create({
    agencyId,
    tenantId,
    clusterId: new mongoose.Types.ObjectId(),
    sessionName: 'aggregate-session',
    messagingSessionName: 'aggregate-session',
    status: 'active',
    routingMetadata: {},
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  await UsageMeterEventModel.create([
    {
      agencyId: agencyId.toString(),
      metric: 'inbound_message',
      windowStart: monthStart,
      value: 10,
      idempotencyKey: `usage-${new mongoose.Types.ObjectId().toString()}`,
    },
    {
      agencyId: agencyId.toString(),
      metric: 'outbound_message',
      windowStart: monthStart,
      value: 5,
      idempotencyKey: `usage-${new mongoose.Types.ObjectId().toString()}`,
    },
    {
      agencyId: agencyId.toString(),
      metric: 'plugin_execution',
      windowStart: monthStart,
      value: 12,
      idempotencyKey: `usage-${new mongoose.Types.ObjectId().toString()}`,
    },
  ]);

  await WorkflowRunModel.create([
    {
      workflowRunId: 'aggregate-run-1',
      workflowDefinitionId: workflowOne._id.toString(),
      conversationId: 'conversation-1',
      agencyId: agencyId.toString(),
      tenantId: tenantId.toString(),
      status: 'completed',
      currentNodeId: 'trigger_1',
      contextPatch: {},
      startedAt: new Date(now.getTime() - 10 * 60 * 1000),
      finishedAt: new Date(now.getTime() - 9 * 60 * 1000),
    },
    {
      workflowRunId: 'aggregate-run-2',
      workflowDefinitionId: workflowOne._id.toString(),
      conversationId: 'conversation-2',
      agencyId: agencyId.toString(),
      tenantId: tenantId.toString(),
      status: 'failed',
      currentNodeId: 'trigger_1',
      contextPatch: {},
      startedAt: new Date(now.getTime() - 5 * 60 * 1000),
      finishedAt: new Date(now.getTime() - 4 * 60 * 1000),
    },
  ]);

  await WorkflowExecutionEventModel.create({
    workflowRunId: 'aggregate-run-1',
    workflowDefinitionId: workflowOne._id.toString(),
    conversationId: 'conversation-1',
    agencyId: agencyId.toString(),
    tenantId: tenantId.toString(),
    nodeId: 'trigger_1',
    startedAt: new Date(now.getTime() - 2 * 60 * 1000),
    finishedAt: new Date(now.getTime() - 60 * 1000),
    status: 'completed',
    output: { ok: true },
    error: null,
  });

  return { agencyId, tenantId, userId };
}

describe('dashboard aggregate routes on workflow-engine', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-workflow-engine-dashboard-aggregates-routes-tests' });
    await Promise.all([
      AgencyModel.init(),
      TenantModel.init(),
      UserModel.init(),
      AuthSessionModel.init(),
      ConversationModel.init(),
      WorkflowDefinitionModel.init(),
      WorkflowRunModel.init(),
      WorkflowExecutionEventModel.init(),
      UsageMeterEventModel.init(),
      MessagingSessionBindingModel.init(),
    ]);
  });

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('returns shell, overview, and billing aggregates for authenticated dashboard sessions', async () => {
    const actor = await seedDashboardAggregateActor();
    const cookie = await createSessionCookie(actor);
    const server = await buildServer({ logger: false });

    try {
      const shellResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/dashboard-data/shell',
        headers: { cookie },
      });

      expect(shellResponse.statusCode).toBe(200);
      expect(shellResponse.json()).toMatchObject({
        user: {
          fullName: 'Aggregate Admin',
          email: 'aggregate-admin@test.dev',
          role: 'agency_admin',
        },
        agency: {
          id: actor.agencyId.toString(),
          name: 'Aggregate Agency',
        },
      });

      const overviewResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/dashboard-data/overview',
        headers: { cookie },
      });

      expect(overviewResponse.statusCode).toBe(200);
      expect(overviewResponse.json()).toMatchObject({
        stats: {
          conversations: 2,
          activeTenants: 1,
          activeWorkflows: 1,
          workflowCount: 2,
          activeSessions: 1,
          totalUsageEvents: 27,
          healthScore: 50,
          uptime: 50,
        },
      });

      const billingResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/dashboard-data/billing',
        headers: { cookie },
      });

      expect(billingResponse.statusCode).toBe(200);
      expect(billingResponse.json()).toMatchObject({
        plan: {
          name: 'Reseller Pro',
          price: 299,
          status: 'active',
        },
        usage: {
          messaging: {
            current: 15,
            limit: 50000,
          },
          workflows: {
            current: 2,
            limit: 2500,
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('rejects unauthenticated requests to dashboard aggregate endpoints', async () => {
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/dashboard-data/shell',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Unauthorized' });
    } finally {
      await server.close();
    }
  });
});
