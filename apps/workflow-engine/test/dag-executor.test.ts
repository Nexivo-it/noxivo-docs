import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseCompiledDag } from '@noxivo/contracts';
import {
  ConversationModel,
  WorkflowExecutionEventModel,
  WorkflowRunModel
} from '@noxivo/database';
import { DagExecutor } from '../src/modules/agents/dag-executor.js';
import { createInitialRuntimeContext } from '../src/modules/agents/runtime-context.js';
import { AgentWorker } from '../src/modules/agents/agent.worker.js';
import { WorkflowDefinitionModel } from '@noxivo/database';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('Dag executor', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({
      dbName: 'noxivo-dag-executor-tests'
    });
    await Promise.all([
      WorkflowDefinitionModel.init(),
      WorkflowRunModel.init(),
      WorkflowExecutionEventModel.init()
    ]);
  }, 60000);

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  }, 60000);

  it('condition nodes choose the correct branch', async () => {
    const pluginRegistry = { execute: vi.fn() };
    const queue = { add: vi.fn() };
    const dag = parseCompiledDag({
      entryNodeId: 'trigger-1',
      topologicalOrder: ['trigger-1', 'condition-1', 'action-false', 'action-true'],
      nodes: [
        { id: 'trigger-1', type: 'trigger', next: ['condition-1'], input: {} },
        {
          id: 'condition-1',
          type: 'condition',
          next: ['action-false', 'action-true'],
          onTrue: 'action-true',
          onFalse: 'action-false',
          input: { sourceKey: 'shouldSend', operator: 'equals', value: true }
        },
        { id: 'action-false', type: 'action', next: [], input: { operation: 'sendText', text: 'nope' } },
        { id: 'action-true', type: 'action', next: [], input: { operation: 'sendText', text: 'sent' } }
      ],
      metadata: {
        compiledAt: new Date().toISOString(),
        version: '1.0.0',
        nodeCount: 4
      }
    });

    const executor = new DagExecutor(dag, {
      pluginRegistry,
      continuationQueue: queue,
      resolveMessagingTarget: vi.fn().mockResolvedValue({
        sessionName: 'tenant-session',
        chatId: '1555000111'
      })
    });

    const result = await executor.execute(
      createInitialRuntimeContext({
        workflowRunId: 'run-condition',
        conversationId: 'conv-condition',
        workflowDefinitionId: 'workflow-1',
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        payload: { shouldSend: true }
      })
    );

    expect(result.results.map((entry) => entry.nodeId)).toEqual(['trigger-1', 'condition-1', 'action-true']);
    expect(result.results.at(-1)?.output).toMatchObject({
      kind: 'messaging.sendText',
      chatId: '1555000111'
    });
  });

  it('plugin nodes call PluginRegistry.execute', async () => {
    const pluginRegistry = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        output: { bookingId: 'booking-1' },
        error: null,
        executedAt: new Date().toISOString()
      })
    };
    const queue = { add: vi.fn() };
    const dag = parseCompiledDag({
      entryNodeId: 'trigger-1',
      topologicalOrder: ['trigger-1', 'plugin-1'],
      nodes: [
        { id: 'trigger-1', type: 'trigger', next: ['plugin-1'], input: {} },
        { id: 'plugin-1', type: 'plugin', next: [], input: { pluginId: 'calendar-booking', customerEmail: 'ada@example.com' } }
      ],
      metadata: {
        compiledAt: new Date().toISOString(),
        version: '1.0.0',
        nodeCount: 2
      }
    });

    const executor = new DagExecutor(dag, {
      pluginRegistry,
      continuationQueue: queue,
      resolveMessagingTarget: vi.fn()
    });

    await executor.execute(
      createInitialRuntimeContext({
        workflowRunId: 'run-plugin',
        conversationId: 'conv-plugin',
        workflowDefinitionId: 'workflow-2',
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        payload: { message: 'hello' }
      })
    );

    expect(pluginRegistry.execute).toHaveBeenCalledWith({
      pluginId: 'calendar-booking',
      subject: { agencyId: 'agency-1', tenantId: 'tenant-1' },
      payload: {
        message: 'hello',
        customerEmail: 'ada@example.com'
      }
    });
  });

  it('AgentWorker path forwards metering counter to plugin and action runtime execution', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();
    const workflowDefinition = await WorkflowDefinitionModel.create({
      agencyId,
      tenantId,
      key: 'metering-forward-workflow',
      version: '1.0.0',
      name: 'Metering Forward Workflow',
      channel: 'whatsapp',
      editorGraph: {
        nodes: [],
        edges: []
      },
      compiledDag: parseCompiledDag({
        entryNodeId: 'trigger-1',
        topologicalOrder: ['trigger-1', 'plugin-1', 'action-1'],
        nodes: [
          { id: 'trigger-1', type: 'trigger', next: ['plugin-1'], input: { event: 'incomingMessage' } },
          { id: 'plugin-1', type: 'plugin', next: ['action-1'], input: { pluginId: 'calendar-booking' } },
          { id: 'action-1', type: 'action', next: [], input: { operation: 'sendText', text: 'meter me' } }
        ],
        metadata: {
          compiledAt: new Date().toISOString(),
          version: '1.0.0',
          nodeCount: 3
        }
      }),
      isActive: true
    });

    const meteringCounter = {
      increment: vi.fn().mockResolvedValue(1)
    };

    const worker = new AgentWorker({
      pluginRegistry: {
        execute: vi.fn().mockResolvedValue({
          success: true,
          output: { ok: true },
          error: null,
          executedAt: new Date().toISOString()
        })
      },
      continuationQueue: { add: vi.fn() },
      resolveMessagingTarget: vi.fn().mockResolvedValue({
        sessionName: 'tenant-session',
        chatId: '1555111222'
      }),
      meteringCounter
    });

    const result = await worker.executeWorkflow({
      workflowDefinitionId: workflowDefinition._id.toString(),
      workflowRunId: 'run-metering-forward',
      conversationId: 'conv-metering-forward',
      agencyId,
      tenantId,
      payload: {}
    });

    expect(result.status).toBe('completed');
    expect(meteringCounter.increment).toHaveBeenCalledWith(expect.objectContaining({
      agencyId,
      metric: 'plugin_execution',
      amount: 1
    }));
    expect(meteringCounter.increment).toHaveBeenCalledWith(expect.objectContaining({
      agencyId,
      metric: 'outbound_message',
      amount: 1
    }));
    expect(meteringCounter.increment).toHaveBeenCalledTimes(2);
  });

  it('action nodes emit concrete MessagingProvider send operations', async () => {
    const pluginRegistry = { execute: vi.fn() };
    const queue = { add: vi.fn() };
    const dag = parseCompiledDag({
      entryNodeId: 'trigger-1',
      topologicalOrder: ['trigger-1', 'action-1'],
      nodes: [
        { id: 'trigger-1', type: 'trigger', next: ['action-1'], input: {} },
        {
          id: 'action-1',
          type: 'action',
          next: [],
          input: {
            operation: 'sendText',
            text: 'Hello from Noxivo'
          }
        }
      ],
      metadata: {
        compiledAt: new Date().toISOString(),
        version: '1.0.0',
        nodeCount: 2
      }
    });

    const executor = new DagExecutor(dag, {
      pluginRegistry,
      continuationQueue: queue,
      resolveMessagingTarget: vi.fn().mockResolvedValue({
        sessionName: 'tenant-session',
        chatId: '1555000222'
      })
    });

    const result = await executor.execute(
      createInitialRuntimeContext({
        workflowRunId: 'run-action',
        conversationId: 'conv-action',
        workflowDefinitionId: 'workflow-3',
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        payload: {}
      })
    );

    expect(result.results.at(-1)?.output).toEqual({
      kind: 'messaging.sendText',
      sessionName: 'tenant-session',
      chatId: '1555000222',
      payload: {
        text: 'Hello from Noxivo'
      }
    });
  });

  it('delay nodes enqueue a BullMQ continuation job', async () => {
    const pluginRegistry = { execute: vi.fn() };
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    const dag = parseCompiledDag({
      entryNodeId: 'trigger-1',
      topologicalOrder: ['trigger-1', 'delay-1'],
      nodes: [
        { id: 'trigger-1', type: 'trigger', next: ['delay-1'], input: {} },
        {
          id: 'delay-1',
          type: 'delay',
          next: [],
          input: {
            delayMs: 300000,
            resumeStrategy: 'bullmq'
          }
        }
      ],
      metadata: {
        compiledAt: new Date().toISOString(),
        version: '1.0.0',
        nodeCount: 2
      }
    });

    const executor = new DagExecutor(dag, {
      pluginRegistry,
      continuationQueue: queue,
      resolveMessagingTarget: vi.fn()
    });

    await executor.execute(
      createInitialRuntimeContext({
        workflowRunId: 'run-delay',
        conversationId: 'conv-delay',
        workflowDefinitionId: 'workflow-4',
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        payload: {}
      })
    );

    expect(queue.add).toHaveBeenCalledWith(
      'workflow.delay.resume',
      expect.objectContaining({
        workflowRunId: 'run-delay',
        nodeId: 'delay-1',
        conversationId: 'conv-delay'
      }),
      expect.objectContaining({
        delay: 300000,
        jobId: 'workflow.delay.resume:run-delay:delay-1'
      })
    );
  });

  it('blocks new workflow execution while the conversation is in handoff', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const conversationId = new mongoose.Types.ObjectId();

    await ConversationModel.create({
      _id: conversationId,
      agencyId,
      tenantId,
      contactId: '15550009999@c.us',
      status: 'handoff',
      unreadCount: 0
    });

    const workflowDefinition = await WorkflowDefinitionModel.create({
      agencyId,
      tenantId,
      key: 'handoff-block-workflow',
      version: '1.0.0',
      name: 'Handoff Block Workflow',
      channel: 'whatsapp',
      editorGraph: { nodes: [], edges: [] },
      compiledDag: parseCompiledDag({
        entryNodeId: 'trigger-1',
        topologicalOrder: ['trigger-1'],
        nodes: [{ id: 'trigger-1', type: 'trigger', next: [], input: {} }],
        metadata: { compiledAt: new Date().toISOString(), version: '1.0.0', nodeCount: 1 }
      }),
      isActive: true
    });

    const worker = new AgentWorker({
      pluginRegistry: { execute: vi.fn() },
      continuationQueue: { add: vi.fn() },
      resolveMessagingTarget: vi.fn().mockResolvedValue({ sessionName: 'tenant-session', chatId: '15550009999@c.us' })
    });

    await expect(worker.executeWorkflow({
      workflowDefinitionId: workflowDefinition._id.toString(),
      workflowRunId: 'run-handoff-block',
      conversationId: conversationId.toString(),
      agencyId: agencyId.toString(),
      tenantId: tenantId.toString(),
      payload: {}
    })).rejects.toThrow(/handoff/i);
  });

  it('blocks resume while the conversation is in handoff', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const conversationId = new mongoose.Types.ObjectId();

    await ConversationModel.create({
      _id: conversationId,
      agencyId,
      tenantId,
      contactId: '15550008888@c.us',
      status: 'handoff',
      unreadCount: 0
    });

    const workflowDefinition = await WorkflowDefinitionModel.create({
      agencyId,
      tenantId,
      key: 'handoff-resume-block-workflow',
      version: '1.0.0',
      name: 'Handoff Resume Block Workflow',
      channel: 'whatsapp',
      editorGraph: { nodes: [], edges: [] },
      compiledDag: parseCompiledDag({
        entryNodeId: 'trigger-1',
        topologicalOrder: ['trigger-1', 'action-1'],
        nodes: [
          { id: 'trigger-1', type: 'trigger', next: ['action-1'], input: {} },
          { id: 'action-1', type: 'action', next: [], input: { operation: 'sendText', text: 'resume blocked' } }
        ],
        metadata: { compiledAt: new Date().toISOString(), version: '1.0.0', nodeCount: 2 }
      }),
      isActive: true
    });

    await WorkflowRunModel.create({
      workflowRunId: 'run-handoff-resume',
      conversationId: conversationId.toString(),
      workflowDefinitionId: workflowDefinition._id.toString(),
      agencyId: agencyId.toString(),
      tenantId: tenantId.toString(),
      status: 'suspended',
      currentNodeId: 'delay-1',
      contextPatch: {
        payload: {},
        pendingNodeIds: ['action-1'],
        visitedNodeIds: ['trigger-1'],
        branchDecisions: {}
      },
      startedAt: new Date()
    });

    const worker = new AgentWorker({
      pluginRegistry: { execute: vi.fn() },
      continuationQueue: { add: vi.fn() },
      resolveMessagingTarget: vi.fn().mockResolvedValue({ sessionName: 'tenant-session', chatId: '15550008888@c.us' })
    });

    await expect(worker.resumeWorkflow({
      workflowDefinitionId: workflowDefinition._id.toString(),
      workflowRunId: 'run-handoff-resume',
      conversationId: conversationId.toString(),
      agencyId: agencyId.toString(),
      tenantId: tenantId.toString()
    })).rejects.toThrow(/handoff/i);
  });

  it('failed nodes produce deterministic execution records and stop descendant execution', async () => {
    const pluginRegistry = {
      execute: vi.fn().mockRejectedValue(new Error('Plugin execution failed'))
    };
    const queue = { add: vi.fn() };
    const dag = parseCompiledDag({
      entryNodeId: 'trigger-1',
      topologicalOrder: ['trigger-1', 'plugin-1', 'action-1'],
      nodes: [
        { id: 'trigger-1', type: 'trigger', next: ['plugin-1'], input: {} },
        { id: 'plugin-1', type: 'plugin', next: ['action-1'], input: { pluginId: 'calendar-booking' } },
        { id: 'action-1', type: 'action', next: [], input: { operation: 'sendText', text: 'should not send' } }
      ],
      metadata: {
        compiledAt: new Date().toISOString(),
        version: '1.0.0',
        nodeCount: 3
      }
    });

    const executor = new DagExecutor(dag, {
      pluginRegistry,
      continuationQueue: queue,
      resolveMessagingTarget: vi.fn()
    });

    const result = await executor.execute(
      createInitialRuntimeContext({
        workflowRunId: 'run-failure',
        conversationId: 'conv-failure',
        workflowDefinitionId: 'workflow-5',
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        payload: {}
      })
    );

    expect(result.status).toBe('failed');
    expect(result.results.map((entry) => entry.nodeId)).toEqual(['trigger-1', 'plugin-1']);
    expect(result.results.at(-1)).toMatchObject({
      nodeId: 'plugin-1',
      status: 'failed',
      error: 'Plugin execution failed'
    });

    const events = await WorkflowExecutionEventModel.find({ workflowRunId: 'run-failure' })
      .sort({ startedAt: 1 })
      .lean()
      .exec();

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      workflowRunId: 'run-failure',
      nodeId: 'plugin-1',
      status: 'failed',
      output: { error: 'Plugin execution failed' }
    });
    expect(events[1]?.finishedAt).toBeTruthy();
  });

  it('resumes execution from persisted pending nodes instead of restarting at the entry node', async () => {
    const workflowDefinition = await WorkflowDefinitionModel.create({
      agencyId: new mongoose.Types.ObjectId(),
      tenantId: new mongoose.Types.ObjectId(),
      key: 'resume-workflow',
      version: '1.0.0',
      name: 'Resume Workflow',
      channel: 'whatsapp',
      editorGraph: {
        nodes: [],
        edges: []
      },
      compiledDag: parseCompiledDag({
        entryNodeId: 'trigger-1',
        topologicalOrder: ['trigger-1', 'action-1'],
        nodes: [
          { id: 'trigger-1', type: 'trigger', next: ['action-1'], input: { event: 'resume' } },
          { id: 'action-1', type: 'action', next: [], input: { operation: 'sendText', text: 'resumed' } }
        ],
        metadata: {
          compiledAt: new Date().toISOString(),
          version: '1.0.0',
          nodeCount: 2
        }
      }),
      isActive: true
    });

    await WorkflowRunModel.create({
      workflowRunId: 'run-resume',
      conversationId: 'conv-resume',
      workflowDefinitionId: workflowDefinition._id.toString(),
      agencyId: workflowDefinition.agencyId.toString(),
      tenantId: workflowDefinition.tenantId.toString(),
      status: 'suspended',
      currentNodeId: 'trigger-1',
      contextPatch: {
        payload: {},
        pendingNodeIds: ['action-1'],
        visitedNodeIds: ['trigger-1'],
        branchDecisions: {}
      },
      startedAt: new Date()
    });

    const worker = new AgentWorker({
      pluginRegistry: { execute: vi.fn() },
      continuationQueue: { add: vi.fn() },
      resolveMessagingTarget: vi.fn().mockResolvedValue({
        sessionName: 'tenant-session',
        chatId: '1555000333'
      })
    });

    const result = await worker.resumeWorkflow({
      workflowDefinitionId: workflowDefinition._id.toString(),
      workflowRunId: 'run-resume',
      conversationId: 'conv-resume',
      agencyId: workflowDefinition.agencyId.toString(),
      tenantId: workflowDefinition.tenantId.toString()
    });

    expect(result.status).toBe('completed');
    expect(result.results.map((entry) => entry.nodeId)).toEqual(['action-1']);
  });

  it('allows only one concurrent resume attempt to claim a suspended run', async () => {
    const workflowDefinition = await WorkflowDefinitionModel.create({
      agencyId: new mongoose.Types.ObjectId(),
      tenantId: new mongoose.Types.ObjectId(),
      key: 'resume-concurrency-workflow',
      version: '1.0.0',
      name: 'Resume Concurrency Workflow',
      channel: 'whatsapp',
      editorGraph: {
        nodes: [],
        edges: []
      },
      compiledDag: parseCompiledDag({
        entryNodeId: 'trigger-1',
        topologicalOrder: ['trigger-1', 'action-1'],
        nodes: [
          { id: 'trigger-1', type: 'trigger', next: ['action-1'], input: { event: 'resume-concurrency' } },
          { id: 'action-1', type: 'action', next: [], input: { operation: 'sendText', text: 'claimed once' } }
        ],
        metadata: {
          compiledAt: new Date().toISOString(),
          version: '1.0.0',
          nodeCount: 2
        }
      }),
      isActive: true
    });

    await WorkflowRunModel.create({
      workflowRunId: 'run-resume-concurrency',
      conversationId: 'conv-resume-concurrency',
      workflowDefinitionId: workflowDefinition._id.toString(),
      agencyId: workflowDefinition.agencyId.toString(),
      tenantId: workflowDefinition.tenantId.toString(),
      status: 'suspended',
      currentNodeId: 'trigger-1',
      contextPatch: {
        payload: {},
        pendingNodeIds: ['action-1'],
        visitedNodeIds: ['trigger-1'],
        branchDecisions: {}
      },
      startedAt: new Date()
    });

    const worker = new AgentWorker({
      pluginRegistry: { execute: vi.fn() },
      continuationQueue: { add: vi.fn() },
      resolveMessagingTarget: vi.fn().mockResolvedValue({
        sessionName: 'tenant-session',
        chatId: '1555000400'
      })
    });

    const resumeInput = {
      workflowDefinitionId: workflowDefinition._id.toString(),
      workflowRunId: 'run-resume-concurrency',
      conversationId: 'conv-resume-concurrency',
      agencyId: workflowDefinition.agencyId.toString(),
      tenantId: workflowDefinition.tenantId.toString()
    };

    const outcomes = await Promise.allSettled([
      worker.resumeWorkflow(resumeInput),
      worker.resumeWorkflow(resumeInput)
    ]);

    const fulfilled = outcomes.filter((outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof worker.resumeWorkflow>>> => {
      return outcome.status === 'fulfilled';
    });
    const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
    const firstFulfilled = fulfilled.at(0);
    const firstRejected = rejected.at(0);

    if (fulfilled.length !== 1 || rejected.length !== 1 || !firstFulfilled || !firstRejected) {
      throw new Error('Concurrent resume assertions require one fulfilled and one rejected outcome');
    }

    expect(firstFulfilled.value.status).toBe('completed');
    expect(firstRejected.reason).toBeInstanceOf(Error);
    expect((firstRejected.reason as Error).message).toMatch(/not suspended/i);

    const actionEvents = await WorkflowExecutionEventModel.find({
      workflowRunId: 'run-resume-concurrency',
      nodeId: 'action-1'
    }).lean().exec();

    expect(actionEvents).toHaveLength(1);
  });

  it('executes a converging join node after a selected condition branch without deadlocking', async () => {
    const pluginRegistry = { execute: vi.fn() };
    const queue = { add: vi.fn() };
    const dag = parseCompiledDag({
      entryNodeId: 'trigger-1',
      topologicalOrder: ['trigger-1', 'condition-1', 'action-true', 'action-false', 'join-action'],
      nodes: [
        { id: 'trigger-1', type: 'trigger', next: ['condition-1'], input: {} },
        {
          id: 'condition-1',
          type: 'condition',
          next: ['action-false', 'action-true'],
          onTrue: 'action-true',
          onFalse: 'action-false',
          input: { sourceKey: 'allow', operator: 'equals', value: true }
        },
        { id: 'action-true', type: 'action', next: ['join-action'], input: { operation: 'sendText', text: 'true path' } },
        { id: 'action-false', type: 'action', next: ['join-action'], input: { operation: 'sendText', text: 'false path' } },
        { id: 'join-action', type: 'action', next: [], input: { operation: 'sendText', text: 'joined' } }
      ],
      metadata: {
        compiledAt: new Date().toISOString(),
        version: '1.0.0',
        nodeCount: 5
      }
    });

    const executor = new DagExecutor(dag, {
      pluginRegistry,
      continuationQueue: queue,
      resolveMessagingTarget: vi.fn().mockResolvedValue({
        sessionName: 'tenant-session',
        chatId: '1555000444'
      })
    });

    const result = await executor.execute(
      createInitialRuntimeContext({
        workflowRunId: 'run-join',
        conversationId: 'conv-join',
        workflowDefinitionId: 'workflow-join',
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        payload: { allow: true }
      })
    );

    expect(result.status).toBe('completed');
    expect(result.results.map((entry) => entry.nodeId)).toEqual([
      'trigger-1',
      'condition-1',
      'action-true',
      'join-action'
    ]);
  });

  it('rejects resume when workflow run is not suspended', async () => {
    const workflowDefinition = await WorkflowDefinitionModel.create({
      agencyId: new mongoose.Types.ObjectId(),
      tenantId: new mongoose.Types.ObjectId(),
      key: 'resume-guard-workflow',
      version: '1.0.0',
      name: 'Resume Guard Workflow',
      channel: 'whatsapp',
      editorGraph: {
        nodes: [],
        edges: []
      },
      compiledDag: parseCompiledDag({
        entryNodeId: 'trigger-1',
        topologicalOrder: ['trigger-1', 'action-1'],
        nodes: [
          { id: 'trigger-1', type: 'trigger', next: ['action-1'], input: { event: 'guard' } },
          { id: 'action-1', type: 'action', next: [], input: { operation: 'sendText', text: 'done' } }
        ],
        metadata: {
          compiledAt: new Date().toISOString(),
          version: '1.0.0',
          nodeCount: 2
        }
      }),
      isActive: true
    });

    await WorkflowRunModel.create({
      workflowRunId: 'run-resume-guard',
      conversationId: 'conv-resume-guard',
      workflowDefinitionId: workflowDefinition._id.toString(),
      agencyId: workflowDefinition.agencyId.toString(),
      tenantId: workflowDefinition.tenantId.toString(),
      status: 'completed',
      currentNodeId: 'action-1',
      contextPatch: {
        payload: {},
        pendingNodeIds: ['action-1'],
        visitedNodeIds: ['trigger-1'],
        branchDecisions: {}
      },
      startedAt: new Date(),
      finishedAt: new Date()
    });

    const worker = new AgentWorker({
      pluginRegistry: { execute: vi.fn() },
      continuationQueue: { add: vi.fn() },
      resolveMessagingTarget: vi.fn().mockResolvedValue({
        sessionName: 'tenant-session',
        chatId: '1555000555'
      })
    });

    await expect(
      worker.resumeWorkflow({
        workflowDefinitionId: workflowDefinition._id.toString(),
        workflowRunId: 'run-resume-guard',
        conversationId: 'conv-resume-guard',
        agencyId: workflowDefinition.agencyId.toString(),
        tenantId: workflowDefinition.tenantId.toString()
      })
    ).rejects.toThrow(/not suspended/i);
  });

  it('rejects execution when an existing run belongs to a different workflow definition', async () => {
    const workflowA = await WorkflowDefinitionModel.create({
      agencyId: new mongoose.Types.ObjectId(),
      tenantId: new mongoose.Types.ObjectId(),
      key: 'definition-a',
      version: '1.0.0',
      name: 'Definition A',
      channel: 'whatsapp',
      editorGraph: { nodes: [], edges: [] },
      compiledDag: parseCompiledDag({
        entryNodeId: 'trigger-1',
        topologicalOrder: ['trigger-1', 'action-a'],
        nodes: [
          { id: 'trigger-1', type: 'trigger', next: ['action-a'], input: { event: 'a' } },
          { id: 'action-a', type: 'action', next: [], input: { operation: 'sendText', text: 'A' } }
        ],
        metadata: {
          compiledAt: new Date().toISOString(),
          version: '1.0.0',
          nodeCount: 2
        }
      }),
      isActive: true
    });

    const workflowB = await WorkflowDefinitionModel.create({
      agencyId: workflowA.agencyId,
      tenantId: workflowA.tenantId,
      key: 'definition-b',
      version: '1.0.0',
      name: 'Definition B',
      channel: 'whatsapp',
      editorGraph: { nodes: [], edges: [] },
      compiledDag: parseCompiledDag({
        entryNodeId: 'trigger-1',
        topologicalOrder: ['trigger-1', 'action-b'],
        nodes: [
          { id: 'trigger-1', type: 'trigger', next: ['action-b'], input: { event: 'b' } },
          { id: 'action-b', type: 'action', next: [], input: { operation: 'sendText', text: 'B' } }
        ],
        metadata: {
          compiledAt: new Date().toISOString(),
          version: '1.0.0',
          nodeCount: 2
        }
      }),
      isActive: true
    });

    await WorkflowRunModel.create({
      workflowRunId: 'run-collision',
      conversationId: 'conv-collision',
      workflowDefinitionId: workflowA._id.toString(),
      agencyId: workflowA.agencyId.toString(),
      tenantId: workflowA.tenantId.toString(),
      status: 'running',
      currentNodeId: 'trigger-1',
      contextPatch: {
        payload: { marker: 'definition-a' },
        pendingNodeIds: ['action-a'],
        visitedNodeIds: ['trigger-1'],
        branchDecisions: {}
      },
      startedAt: new Date()
    });

    const executor = new DagExecutor(parseCompiledDag(workflowB.compiledDag), {
      pluginRegistry: { execute: vi.fn() },
      continuationQueue: { add: vi.fn() },
      resolveMessagingTarget: vi.fn().mockResolvedValue({
        sessionName: 'tenant-session',
        chatId: '1555000666'
      })
    });

    await expect(
      executor.execute(
        createInitialRuntimeContext({
          workflowRunId: 'run-collision',
          conversationId: 'conv-collision',
          workflowDefinitionId: workflowB._id.toString(),
          agencyId: workflowB.agencyId.toString(),
          tenantId: workflowB.tenantId.toString(),
          payload: { marker: 'definition-b' }
        })
      )
    ).rejects.toThrow(/different workflow definition/i);

    const originalRun = await WorkflowRunModel.findOne({
      workflowRunId: 'run-collision',
      conversationId: 'conv-collision',
      workflowDefinitionId: workflowA._id.toString()
    }).lean().exec();

    expect(originalRun?.contextPatch).toMatchObject({
      payload: { marker: 'definition-a' }
    });
  });

  it('allows identical run identifiers across different tenant scopes', async () => {
    const sharedRunId = 'run-shared-scope';
    const sharedConversationId = 'conv-shared-scope';

    const firstRun = await WorkflowRunModel.create({
      workflowRunId: sharedRunId,
      conversationId: sharedConversationId,
      workflowDefinitionId: 'workflow-scope-1',
      agencyId: 'agency-scope-1',
      tenantId: 'tenant-scope-1',
      status: 'running',
      currentNodeId: 'trigger-1',
      contextPatch: {
        payload: {},
        pendingNodeIds: ['action-1'],
        visitedNodeIds: ['trigger-1'],
        branchDecisions: {}
      },
      startedAt: new Date()
    });

    const secondRun = await WorkflowRunModel.create({
      workflowRunId: sharedRunId,
      conversationId: sharedConversationId,
      workflowDefinitionId: 'workflow-scope-2',
      agencyId: 'agency-scope-2',
      tenantId: 'tenant-scope-2',
      status: 'running',
      currentNodeId: 'trigger-1',
      contextPatch: {
        payload: {},
        pendingNodeIds: ['action-1'],
        visitedNodeIds: ['trigger-1'],
        branchDecisions: {}
      },
      startedAt: new Date()
    });

    expect(firstRun._id.toString()).not.toBe(secondRun._id.toString());

    const runCount = await WorkflowRunModel.countDocuments({
      workflowRunId: sharedRunId,
      conversationId: sharedConversationId
    });

    expect(runCount).toBe(2);
  });
});
