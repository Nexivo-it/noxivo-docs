import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AgencyModel,
  AuthSessionModel,
  TenantModel,
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
    expiresAt: new Date(Date.now() + 60_000),
    lastSeenAt: new Date(),
  });

  return `noxivo_session=${encodeURIComponent(token)}`;
}

async function seedWorkflowActor(input: { role: 'agency_admin' | 'agency_member'; email: string }) {
  const agencyId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  await AgencyModel.create({
    _id: agencyId,
    name: 'Workflow Agency',
    slug: `workflow-agency-${userId.toString().slice(-6)}`,
    plan: 'enterprise',
    billingStripeCustomerId: null,
    billingStripeSubscriptionId: null,
    billingOwnerUserId: userId,
    whiteLabelDefaults: {
      customDomain: null,
      logoUrl: null,
      primaryColor: '#6366F1',
      supportEmail: 'workflow-ops@test.dev',
      hidePlatformBranding: false,
    },
    usageLimits: { tenants: 5, activeSessions: 25 },
    status: 'active',
  });

  await TenantModel.create({
    _id: tenantId,
    agencyId,
    slug: `workflow-tenant-${userId.toString().slice(-6)}`,
    name: 'Workflow Tenant',
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
    email: input.email,
    fullName: 'Workflow User',
    passwordHash: 'hash',
    role: input.role,
    status: 'active',
  });

  return { agencyId, tenantId, userId };
}

function buildStarterGraph() {
  return {
    nodes: [
      {
        id: 'trigger_1',
        type: 'trigger',
        position: { x: 100, y: 100 },
        data: { triggerType: 'message_received' },
      },
    ],
    edges: [],
  };
}

function buildStarterDag() {
  return {
    entryNodeId: 'trigger_1',
    topologicalOrder: ['trigger_1'],
    nodes: [
      {
        id: 'trigger_1',
        type: 'trigger',
        next: [],
        input: { triggerType: 'message_received' },
      },
    ],
    metadata: {
      compiledAt: new Date().toISOString(),
      version: '1.0.0',
      nodeCount: 1,
    },
  };
}

describe('workflows module routes on workflow-engine', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-workflow-engine-workflows-routes-tests' });
    await Promise.all([
      AgencyModel.init(),
      TenantModel.init(),
      UserModel.init(),
      AuthSessionModel.init(),
      WorkflowDefinitionModel.init(),
      WorkflowRunModel.init(),
      WorkflowExecutionEventModel.init(),
    ]);
  });

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('supports list/create/fetch/update/toggle/runs/analytics/delete/clone workflow routes', async () => {
    const actor = await seedWorkflowActor({ role: 'agency_admin', email: 'workflow-admin@test.dev' });
    const cookie = await createSessionCookie(actor);

    const existingWorkflow = await WorkflowDefinitionModel.create({
      agencyId: actor.agencyId,
      tenantId: actor.tenantId,
      key: 'existing-workflow',
      version: '1.0.0',
      name: 'Existing Workflow',
      description: 'Existing workflow description',
      channel: 'whatsapp',
      editorGraph: buildStarterGraph(),
      compiledDag: buildStarterDag(),
      isActive: false,
      isTemplate: false,
    });

    await WorkflowRunModel.create({
      workflowRunId: 'run-1',
      workflowDefinitionId: existingWorkflow._id.toString(),
      conversationId: 'conversation-1',
      agencyId: actor.agencyId.toString(),
      tenantId: actor.tenantId.toString(),
      status: 'completed',
      currentNodeId: 'trigger_1',
      contextPatch: {},
      startedAt: new Date('2026-01-01T10:00:00.000Z'),
      finishedAt: new Date('2026-01-01T10:00:05.000Z'),
    });

    await WorkflowExecutionEventModel.create({
      workflowRunId: 'run-1',
      workflowDefinitionId: existingWorkflow._id.toString(),
      conversationId: 'conversation-1',
      agencyId: actor.agencyId.toString(),
      tenantId: actor.tenantId.toString(),
      nodeId: 'trigger_1',
      startedAt: new Date('2026-01-01T10:00:00.000Z'),
      finishedAt: new Date('2026-01-01T10:00:05.000Z'),
      status: 'completed',
      output: { ok: true },
      error: null,
    });

    const server = await buildServer({ logger: false });

    try {
      const listResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/workflows',
        headers: { cookie },
      });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual(
        expect.objectContaining({
          workflows: expect.arrayContaining([
            expect.objectContaining({
              id: existingWorkflow._id.toString(),
              name: 'Existing Workflow',
              status: 'paused',
            }),
          ]),
        }),
      );

      const createResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/workflows',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Sales Followup Flow',
          description: 'Created from workflow-engine route',
          channel: 'whatsapp',
        },
      });
      expect(createResponse.statusCode).toBe(200);

      const createdPayload = createResponse.json() as {
        id: string;
        name: string;
        status: string;
      };
      expect(createdPayload.name).toBe('Sales Followup Flow');
      expect(createdPayload.status).toBe('paused');

      const fetchResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/${createdPayload.id}`,
        headers: { cookie },
      });
      expect(fetchResponse.statusCode).toBe(200);

      const patchResponse = await server.inject({
        method: 'PATCH',
        url: `/api/v1/workflows/${createdPayload.id}`,
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Sales Followup Flow Updated',
          description: 'Updated description',
          editorGraph: buildStarterGraph(),
          compiledDag: buildStarterDag(),
        },
      });
      expect(patchResponse.statusCode).toBe(200);
      expect(patchResponse.json()).toEqual(
        expect.objectContaining({
          success: true,
          workflow: expect.objectContaining({ name: 'Sales Followup Flow Updated' }),
        }),
      );

      const toggleResponse = await server.inject({
        method: 'POST',
        url: `/api/v1/workflows/${existingWorkflow._id.toString()}/toggle`,
        headers: { cookie },
      });
      expect(toggleResponse.statusCode).toBe(200);
      expect(toggleResponse.json()).toEqual({ success: true, isActive: true });

      const runsResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/${existingWorkflow._id.toString()}/runs`,
        headers: { cookie },
      });
      expect(runsResponse.statusCode).toBe(200);
      expect(runsResponse.json()).toEqual(
        expect.objectContaining({
          runs: expect.arrayContaining([expect.objectContaining({ workflowRunId: 'run-1' })]),
          events: expect.arrayContaining([expect.objectContaining({ workflowRunId: 'run-1', nodeId: 'trigger_1' })]),
        }),
      );

      const analyticsResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/${existingWorkflow._id.toString()}/analytics`,
        headers: { cookie },
      });
      expect(analyticsResponse.statusCode).toBe(200);
      expect(analyticsResponse.json()).toEqual(
        expect.objectContaining({
          analytics: expect.objectContaining({
            trigger_1: expect.objectContaining({
              executionCount: 1,
              successCount: 1,
              failureCount: 0,
            }),
          }),
        }),
      );

      const cloneResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/workflows/clone',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          templateId: 'airtable-lead-sync',
          customName: 'Airtable Clone',
        },
      });
      expect(cloneResponse.statusCode).toBe(200);
      expect(cloneResponse.json()).toEqual(
        expect.objectContaining({
          success: true,
          workflowName: 'Airtable Clone',
        }),
      );

      const deleteResponse = await server.inject({
        method: 'DELETE',
        url: `/api/v1/workflows/${createdPayload.id}`,
        headers: { cookie },
      });
      expect(deleteResponse.statusCode).toBe(200);
      expect(deleteResponse.json()).toEqual({ success: true });
    } finally {
      await server.close();
    }
  });

  it('supports execution-events route auth/access checks', async () => {
    const actor = await seedWorkflowActor({ role: 'agency_admin', email: 'workflow-events@test.dev' });
    const cookie = await createSessionCookie(actor);
    const workflow = await WorkflowDefinitionModel.create({
      agencyId: actor.agencyId,
      tenantId: actor.tenantId,
      key: 'events-workflow',
      version: '1.0.0',
      name: 'Events Workflow',
      description: 'Workflow events stream test',
      channel: 'whatsapp',
      editorGraph: buildStarterGraph(),
      compiledDag: buildStarterDag(),
      isActive: false,
      isTemplate: false,
    });

    const server = await buildServer({ logger: false });

    try {
      const unauthorized = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/${workflow._id.toString()}/execution-events`,
      });
      expect(unauthorized.statusCode).toBe(401);

      const notFound = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/${new mongoose.Types.ObjectId().toString()}/execution-events`,
        headers: { cookie },
      });
      expect(notFound.statusCode).toBe(404);
    } finally {
      await server.close();
    }
  });

  it('forbids workflow mutation routes for non-managers', async () => {
    const actor = await seedWorkflowActor({ role: 'agency_member', email: 'workflow-member@test.dev' });
    const cookie = await createSessionCookie(actor);

    const server = await buildServer({ logger: false });

    try {
      const createResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/workflows',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Blocked Workflow',
        },
      });

      expect(createResponse.statusCode).toBe(403);
    } finally {
      await server.close();
    }
  });
});
