import { Types } from 'mongoose';
import type { FastifyInstance } from 'fastify';
import {
  WorkflowDefinitionModel,
  WorkflowExecutionEventModel,
  WorkflowRunModel,
} from '@noxivo/database';
import { getSessionFromRequest } from '../../agency/session-auth.js';
import { canManageWorkflows } from '../authorization.js';
import { buildWorkflowTenantFilter, resolveWorkflowWriteTenantId } from '../scope.js';
import { cloneTemplateFromTemplate } from '../workflow-cloner.js';
import { getWorkflowEventsBackplane } from '../workflow-events-backplane.js';

function buildWorkflowKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function getBody(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  return input as Record<string, unknown>;
}

function writeSseEvent(write: (chunk: string) => void, payload: unknown): void {
  write(`data: ${JSON.stringify(payload)}\n\n`);
}

function writeSseComment(write: (chunk: string) => void, value: string): void {
  write(`: ${value}\n\n`);
}

export async function registerWorkflowsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const tenantFilter = buildWorkflowTenantFilter(session);
      const definitions = await WorkflowDefinitionModel.find({
        agencyId: session.actor.agencyId,
        ...tenantFilter,
      }).sort({ updatedAt: -1 }).lean().exec();

      return reply.send({
        workflows: definitions.map((definition) => ({
          id: definition._id.toString(),
          name: definition.name || definition.key,
          description: definition.description || `Workflow for ${definition.channel}`,
          status: definition.isActive ? 'active' : 'paused',
          lastRun: 'No recent runs',
          executions: 0,
          type: definition.channel,
        })),
      });
    } catch (error) {
      request.log.error(error, 'Failed to fetch workflows');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.post('/', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    if (!canManageWorkflows(session)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    try {
      const body = getBody(request.body);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const description = typeof body.description === 'string' ? body.description : '';
      const channel = typeof body.channel === 'string' ? body.channel : 'whatsapp';
      const writeTenantId = resolveWorkflowWriteTenantId(session);

      if (!name) {
        return reply.status(400).send({ error: 'Name is required' });
      }

      if (!writeTenantId) {
        return reply.status(409).send({ error: 'No tenant scope available for workflow creation' });
      }

      const key = buildWorkflowKey(name);
      const version = '1.0.0';

      const existing = await WorkflowDefinitionModel.findOne({
        agencyId: session.actor.agencyId,
        tenantId: writeTenantId,
        key,
        version,
      });

      if (existing) {
        return reply.status(409).send({ error: 'A workflow with this name already exists' });
      }

      const starterGraph = {
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

      const starterDag = {
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

      const workflow = await WorkflowDefinitionModel.create({
        agencyId: session.actor.agencyId,
        tenantId: writeTenantId,
        key,
        version,
        name,
        description: description || `Workflow for ${channel}`,
        channel,
        editorGraph: starterGraph,
        compiledDag: starterDag,
        isActive: false,
      });

      return reply.send({
        id: workflow._id.toString(),
        name: workflow.name,
        key: workflow.key,
        status: 'paused',
      });
    } catch (error) {
      request.log.error(error, 'Failed to create workflow');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.post('/clone', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    if (!canManageWorkflows(session)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    try {
      const body = getBody(request.body);
      const templateId = typeof body.templateId === 'string' ? body.templateId : '';
      const customName = typeof body.customName === 'string' ? body.customName : undefined;

      if (!templateId) {
        return reply.status(400).send({ error: 'Template ID is required' });
      }

      const result = await cloneTemplateFromTemplate(
        customName
          ? { templateId, customName, session }
          : { templateId, session },
      );

      if (!result.success) {
        return reply.status(400).send({ success: false, error: result.error });
      }

      return reply.send({
        success: true,
        workflowId: result.workflowId,
        workflowName: result.workflowName,
      });
    } catch (error) {
      request.log.error(error, 'Failed to clone template');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.get('/:workflowId', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const workflowId = (request.params as { workflowId: string }).workflowId;
    if (!Types.ObjectId.isValid(workflowId)) {
      return reply.status(404).send({ error: 'Workflow not found' });
    }

    try {
      const tenantFilter = buildWorkflowTenantFilter(session);
      const workflow = await WorkflowDefinitionModel.findOne({
        _id: workflowId,
        agencyId: session.actor.agencyId,
        ...tenantFilter,
      });

      if (!workflow) {
        return reply.status(404).send({ error: 'Workflow not found' });
      }

      return reply.send({ workflow });
    } catch (error) {
      request.log.error(error, 'Failed to fetch workflow');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.patch('/:workflowId', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    if (!canManageWorkflows(session)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const workflowId = (request.params as { workflowId: string }).workflowId;
    if (!Types.ObjectId.isValid(workflowId)) {
      return reply.status(404).send({ error: 'Workflow not found' });
    }

    try {
      const body = getBody(request.body);
      const tenantFilter = buildWorkflowTenantFilter(session);
      const workflow = await WorkflowDefinitionModel.findOne({
        _id: workflowId,
        agencyId: session.actor.agencyId,
        ...tenantFilter,
      });

      if (!workflow) {
        return reply.status(404).send({ error: 'Workflow not found' });
      }

      if (typeof body.name === 'string' && body.name.trim().length > 0) {
        workflow.name = body.name.trim();
      }

      if (typeof body.description === 'string') {
        workflow.description = body.description;
      }

      if ('editorGraph' in body) {
        workflow.editorGraph = body.editorGraph;
      }

      if ('compiledDag' in body) {
        workflow.compiledDag = body.compiledDag;
      }

      await workflow.save();

      return reply.send({ success: true, workflow });
    } catch (error) {
      request.log.error(error, 'Failed to update workflow');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.delete('/:workflowId', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    if (!canManageWorkflows(session)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const workflowId = (request.params as { workflowId: string }).workflowId;
    if (!Types.ObjectId.isValid(workflowId)) {
      return reply.status(404).send({ error: 'Workflow not found' });
    }

    try {
      const tenantFilter = buildWorkflowTenantFilter(session);
      const workflow = await WorkflowDefinitionModel.findOneAndDelete({
        _id: workflowId,
        agencyId: session.actor.agencyId,
        ...tenantFilter,
      });

      if (!workflow) {
        return reply.status(404).send({ error: 'Workflow not found' });
      }

      return reply.send({ success: true });
    } catch (error) {
      request.log.error(error, 'Failed to delete workflow');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.post('/:workflowId/toggle', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    if (!canManageWorkflows(session)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const workflowId = (request.params as { workflowId: string }).workflowId;
    if (!Types.ObjectId.isValid(workflowId)) {
      return reply.status(404).send({ error: 'Workflow not found' });
    }

    try {
      const tenantFilter = buildWorkflowTenantFilter(session);
      const workflow = await WorkflowDefinitionModel.findOne({
        _id: workflowId,
        agencyId: session.actor.agencyId,
        ...tenantFilter,
      });

      if (!workflow) {
        return reply.status(404).send({ error: 'Workflow not found' });
      }

      workflow.isActive = !workflow.isActive;
      await workflow.save();

      return reply.send({
        success: true,
        isActive: workflow.isActive,
      });
    } catch (error) {
      request.log.error(error, 'Failed to toggle workflow');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.get('/:workflowId/runs', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    if (!canManageWorkflows(session)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const workflowId = (request.params as { workflowId: string }).workflowId;
    if (!Types.ObjectId.isValid(workflowId)) {
      return reply.status(404).send({ error: 'Workflow not found' });
    }

    try {
      const tenantFilter = buildWorkflowTenantFilter(session);
      const runs = await WorkflowRunModel.find({
        workflowDefinitionId: workflowId,
        agencyId: session.actor.agencyId,
        ...tenantFilter,
      }).sort({ startedAt: -1 }).limit(5).lean().exec();

      const runIds = runs.map((run) => run.workflowRunId);

      const events = runIds.length === 0
        ? []
        : await WorkflowExecutionEventModel.find({
          workflowRunId: { $in: runIds },
          agencyId: session.actor.agencyId,
          ...tenantFilter,
        }).sort({ startedAt: 1 }).lean().exec();

      return reply.send({ runs, events });
    } catch (error) {
      request.log.error(error, 'Failed to fetch workflow runs');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.get('/:workflowId/analytics', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    if (!canManageWorkflows(session)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const workflowId = (request.params as { workflowId: string }).workflowId;
    if (!Types.ObjectId.isValid(workflowId)) {
      return reply.status(404).send({ error: 'Workflow not found' });
    }

    try {
      const tenantFilter = buildWorkflowTenantFilter(session);
      const analytics = await WorkflowExecutionEventModel.aggregate<{
        nodeId: string;
        executionCount: number;
        successCount: number;
        failureCount: number;
        avgDurationMs: number | null;
      }>([
        {
          $match: {
            workflowDefinitionId: workflowId,
            agencyId: session.actor.agencyId,
            ...tenantFilter,
          },
        },
        {
          $group: {
            _id: '$nodeId',
            executionCount: { $sum: 1 },
            successCount: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            failureCount: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
            },
            avgDurationMs: {
              $avg: {
                $cond: [
                  { $and: ['$startedAt', '$finishedAt'] },
                  { $subtract: ['$finishedAt', '$startedAt'] },
                  null,
                ],
              },
            },
          },
        },
        {
          $project: {
            nodeId: '$_id',
            _id: 0,
            executionCount: 1,
            successCount: 1,
            failureCount: 1,
            avgDurationMs: 1,
          },
        },
      ]);

      const analyticsMap: Record<string, {
        nodeId: string;
        executionCount: number;
        successCount: number;
        failureCount: number;
        avgDurationMs: number | null;
      }> = {};

      for (const item of analytics) {
        analyticsMap[item.nodeId] = item;
      }

      return reply.send({ analytics: analyticsMap });
    } catch (error) {
      request.log.error(error, 'Failed to fetch workflow analytics');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.get('/:workflowId/execution-events', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const workflowId = (request.params as { workflowId: string }).workflowId;
    if (!Types.ObjectId.isValid(workflowId)) {
      return reply.status(404).send({ error: 'Workflow not found' });
    }

    const tenantFilter = buildWorkflowTenantFilter(session);
    const workflow = await WorkflowDefinitionModel.findOne({
      _id: workflowId,
      agencyId: session.actor.agencyId,
      ...tenantFilter,
    }).lean();

    if (!workflow) {
      return reply.status(404).send({ error: 'Workflow not found' });
    }

    reply.hijack();
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');

    const write = (chunk: string) => {
      reply.raw.write(chunk);
    };

    writeSseEvent(write, { type: 'connected', workflowId });

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const latestRun = await WorkflowRunModel.findOne({
      workflowDefinitionId: workflowId,
      agencyId: session.actor.agencyId,
      ...tenantFilter,
      startedAt: { $gte: fifteenMinutesAgo },
    }).sort({ startedAt: -1 }).lean();

    if (latestRun) {
      const events = await WorkflowExecutionEventModel.find({
        workflowRunId: latestRun.workflowRunId,
        agencyId: session.actor.agencyId,
        ...tenantFilter,
      }).sort({ startedAt: 1 }).lean();

      for (const event of events) {
        writeSseEvent(write, {
          workflowId,
          workflowRunId: event.workflowRunId,
          nodeId: event.nodeId,
          status: event.status === 'running' ? 'hit' : event.status,
          output: event.output,
          error: event.error,
          timestamp: event.startedAt,
        });
      }
    }

    const backplane = getWorkflowEventsBackplane();
    const unsubscribe = await backplane.subscribe(workflowId, (event) => {
      writeSseEvent(write, event);
    });

    const keepAlive = setInterval(() => {
      writeSseComment(write, 'keepalive');
    }, 15_000);

    const cleanup = async () => {
      clearInterval(keepAlive);
      await unsubscribe();
      reply.raw.end();
    };

    request.raw.on('close', () => {
      void cleanup();
    });
  });
}
