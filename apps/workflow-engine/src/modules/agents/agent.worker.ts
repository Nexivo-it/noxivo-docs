import { Queue } from 'bullmq';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { WorkflowDefinitionModel } from '@noxivo/database';
import { WorkflowRunModel } from '@noxivo/database';
import { ConversationModel } from '@noxivo/database';
import { parseCompiledDag } from '@noxivo/contracts';
import { type PluginRegistry } from '../plugins/registry.service.js';
import {
  DagExecutor,
  type ContinuationQueue,
  type DagExecutionResult,
  type DagExecutorDependencies,
  type MessagingSendOperation
} from './dag-executor.js';
import { createInitialRuntimeContext } from './runtime-context.js';
import { type WorkflowActionService } from './workflow-action.service.js';
import { WorkflowEventsPublisher } from './workflow-events.publisher.js';
import { notificationService } from '../notifications/notification.service.js';
import { memoryService } from '../memory/memory.service.js';

const MAX_ID_LENGTH = 128;
const MAX_PAYLOAD_BYTES = 16_384;
const MAX_RUNTIME_NODE_IDS = 1_024;
const MAX_RUNTIME_BRANCH_DECISIONS = 1_024;

function ensurePayloadWithinSizeLimit(payload: Record<string, unknown> | undefined): void {
  if (!payload) {
    return;
  }

  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_PAYLOAD_BYTES) {
    throw new Error('Workflow payload exceeds maximum allowed size');
  }
}

const PersistedContextPatchSchema = z.object({
  payload: z.record(z.string(), z.unknown()).optional(),
  pendingNodeIds: z.array(z.string().min(1).max(MAX_ID_LENGTH)).max(MAX_RUNTIME_NODE_IDS).optional(),
  visitedNodeIds: z.array(z.string().min(1).max(MAX_ID_LENGTH)).max(MAX_RUNTIME_NODE_IDS).optional(),
  currentNodeId: z.string().min(1).max(MAX_ID_LENGTH).nullable().optional(),
  branchDecisions: z.record(z.string(), z.boolean()).optional()
}).strict();

interface PersistedContextPatch {
  payload: Record<string, unknown>;
  pendingNodeIds: string[];
  visitedNodeIds: string[];
  currentNodeId: string | null;
  branchDecisions: Record<string, boolean>;
}

function parsePersistedContextPatch(value: unknown): PersistedContextPatch {
  if (!value || typeof value !== 'object') {
    return {
      payload: {},
      pendingNodeIds: [],
      visitedNodeIds: [],
      currentNodeId: null,
      branchDecisions: {}
    };
  }

  const parsed = PersistedContextPatchSchema.parse(value);

  if (parsed.branchDecisions && Object.keys(parsed.branchDecisions).length > MAX_RUNTIME_BRANCH_DECISIONS) {
    throw new Error('Persisted runtime state exceeds maximum branch decision count');
  }

  ensurePayloadWithinSizeLimit(parsed.payload);

  return {
    payload: { ...(parsed.payload ?? {}) },
    pendingNodeIds: [...(parsed.pendingNodeIds ?? [])],
    visitedNodeIds: [...(parsed.visitedNodeIds ?? [])],
    currentNodeId: parsed.currentNodeId ?? null,
    branchDecisions: { ...(parsed.branchDecisions ?? {}) }
  };
}

const ExecuteWorkflowInputSchema = z.object({
  workflowDefinitionId: z.string().min(1).max(MAX_ID_LENGTH),
  workflowRunId: z.string().min(1).max(MAX_ID_LENGTH),
  conversationId: z.string().min(1).max(MAX_ID_LENGTH),
  agencyId: z.string().min(1).max(MAX_ID_LENGTH),
  tenantId: z.string().min(1).max(MAX_ID_LENGTH),
  payload: z.record(z.string(), z.unknown()).optional()
}).strict();

export interface AgentWorkerDependencies {
  pluginRegistry: Pick<PluginRegistry, 'execute'>;
  continuationQueue: ContinuationQueue;
  resolveMessagingTarget: DagExecutorDependencies['resolveMessagingTarget'];
  workflowActionService?: WorkflowActionService;
  meteringCounter?: DagExecutorDependencies['meteringCounter'];
  workflowEventsPublisher?: WorkflowEventsPublisher;
}

function isMessagingOperation(value: unknown): value is MessagingSendOperation {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    typeof (value as any).kind === 'string' &&
    (value as any).kind.startsWith('messaging.')
  );
}

export class AgentWorker {
  constructor(private readonly dependencies: AgentWorkerDependencies) {}

  private async assertConversationAutomationAllowed(input: {
    conversationId: string;
    agencyId: string;
    tenantId: string;
  }): Promise<void> {
    if (!isValidObjectId(input.conversationId)) {
      return;
    }

    const conversation = await ConversationModel.findOne({
      _id: input.conversationId,
      agencyId: input.agencyId,
      tenantId: input.tenantId
    }).lean().exec();

    const conversationStatus = conversation?.status as string | undefined;

    if (conversationStatus === 'handoff') {
      throw new Error(`Conversation ${input.conversationId} is in handoff`);
    }
  }

  async executeWorkflow(input: {
    workflowDefinitionId: string;
    workflowRunId: string;
    conversationId: string;
    agencyId: string;
    tenantId: string;
    payload?: Record<string, unknown>;
  }): Promise<DagExecutionResult> {
    const parsedInput = ExecuteWorkflowInputSchema.parse(input);
    ensurePayloadWithinSizeLimit(parsedInput.payload);

    await this.assertConversationAutomationAllowed({
      conversationId: parsedInput.conversationId,
      agencyId: parsedInput.agencyId,
      tenantId: parsedInput.tenantId
    });

    const workflowDefinition = await WorkflowDefinitionModel.findOne({
      _id: parsedInput.workflowDefinitionId,
      agencyId: parsedInput.agencyId,
      tenantId: parsedInput.tenantId,
      isActive: true
    }).lean().exec();

    if (!workflowDefinition) {
      throw new Error(`Workflow definition ${parsedInput.workflowDefinitionId} not found`);
    }

    const dag = parseCompiledDag(workflowDefinition.compiledDag);
    const executorDependencies: DagExecutorDependencies = {
      pluginRegistry: this.dependencies.pluginRegistry,
      continuationQueue: this.dependencies.continuationQueue,
      resolveMessagingTarget: this.dependencies.resolveMessagingTarget,
      notifyWorkflowFailure: async (input) => {
        await notificationService.notifyWorkflowFailure(input);
      },
      notifyHandoffRequested: async (input) => {
        await notificationService.notifyHandoffRequested(input);
      },
      memoryService: {
        getContext: async (input) => memoryService.getContext(input),
        upsert: async (input) => memoryService.upsert(input)
      },
      workflowEventsPublisher: this.dependencies.workflowEventsPublisher
    };

    if (this.dependencies.meteringCounter) {
      executorDependencies.meteringCounter = this.dependencies.meteringCounter;
    }

    const executor = new DagExecutor(dag, executorDependencies);

    const existingRun = await WorkflowRunModel.findOne({
      workflowRunId: parsedInput.workflowRunId,
      conversationId: parsedInput.conversationId,
      workflowDefinitionId: parsedInput.workflowDefinitionId,
      agencyId: parsedInput.agencyId,
      tenantId: parsedInput.tenantId
    }).lean().exec();

    const persistedContextPatch = parsePersistedContextPatch(existingRun?.contextPatch);
    const mergedPayload = {
      ...(parsedInput.payload ?? {}),
      ...persistedContextPatch.payload
    };
    ensurePayloadWithinSizeLimit(mergedPayload);

    const runtimeContextInput = {
      workflowRunId: parsedInput.workflowRunId,
      conversationId: parsedInput.conversationId,
      workflowDefinitionId: parsedInput.workflowDefinitionId,
      agencyId: parsedInput.agencyId,
      tenantId: parsedInput.tenantId,
      payload: mergedPayload,
      pendingNodeIds: persistedContextPatch.pendingNodeIds,
      visitedNodeIds: persistedContextPatch.visitedNodeIds,
      currentNodeId: persistedContextPatch.currentNodeId ?? existingRun?.currentNodeId ?? null,
      branchDecisions: persistedContextPatch.branchDecisions
    };

    const result = await executor.execute(createInitialRuntimeContext(runtimeContextInput));

    // ADR-001 Phase 4: Dispatch side-effects (MessagingProvider operations) generated by the DAG
    if (this.dependencies.workflowActionService) {
      for (const step of result.results) {
        if (step.status === 'completed' && isMessagingOperation(step.output)) {
          try {
            await this.dependencies.workflowActionService.executeMessagingOperation({
              agencyId: parsedInput.agencyId,
              tenantId: parsedInput.tenantId,
              conversationId: parsedInput.conversationId,
              operation: step.output
            });
          } catch (error) {
            // Log action failure but don't crash the worker
            console.error(`Failed to dispatch MessagingProvider action ${step.nodeId}:`, error);
          }
        }
      }
    }

    return result;
  }

  async resumeWorkflow(input: {
    workflowDefinitionId: string;
    workflowRunId: string;
    conversationId: string;
    agencyId: string;
    tenantId: string;
  }): Promise<DagExecutionResult> {
    const parsedInput = ExecuteWorkflowInputSchema.parse(input);

    await this.assertConversationAutomationAllowed({
      conversationId: parsedInput.conversationId,
      agencyId: parsedInput.agencyId,
      tenantId: parsedInput.tenantId
    });

    const runIdentityFilter = {
      workflowRunId: parsedInput.workflowRunId,
      conversationId: parsedInput.conversationId,
      workflowDefinitionId: parsedInput.workflowDefinitionId,
      agencyId: parsedInput.agencyId,
      tenantId: parsedInput.tenantId
    };

    const claimedRun = await WorkflowRunModel.findOneAndUpdate(
      {
        ...runIdentityFilter,
        status: 'suspended'
      },
      {
        $set: {
          status: 'running'
        }
      },
      {
        new: true
      }
    ).lean().exec();

    if (!claimedRun) {
      const existingRun = await WorkflowRunModel.findOne(runIdentityFilter).lean().exec();

      if (!existingRun) {
        throw new Error(`Workflow run ${parsedInput.workflowRunId} not found for resume`);
      }

      throw new Error(`Workflow run ${parsedInput.workflowRunId} is not suspended`);
    }

    const persistedContextPatch = parsePersistedContextPatch(claimedRun.contextPatch);

    if (persistedContextPatch.pendingNodeIds.length === 0) {
      await WorkflowRunModel.findOneAndUpdate(runIdentityFilter, {
        $set: {
          status: 'suspended'
        }
      }).exec();

      throw new Error(`Workflow run ${parsedInput.workflowRunId} has no pending nodes to resume`);
    }

    if (parsedInput.payload) {
      ensurePayloadWithinSizeLimit({
        ...parsedInput.payload,
        ...persistedContextPatch.payload
      });
    }

    if (parsedInput.payload) {
      return this.executeWorkflow({
        workflowDefinitionId: parsedInput.workflowDefinitionId,
        workflowRunId: parsedInput.workflowRunId,
        conversationId: parsedInput.conversationId,
        agencyId: parsedInput.agencyId,
        tenantId: parsedInput.tenantId,
        payload: parsedInput.payload
      });
    }

    return this.executeWorkflow({
      workflowDefinitionId: parsedInput.workflowDefinitionId,
      workflowRunId: parsedInput.workflowRunId,
      conversationId: parsedInput.conversationId,
      agencyId: parsedInput.agencyId,
      tenantId: parsedInput.tenantId
    });
  }
}

export function createContinuationQueue(queue: Queue): ContinuationQueue {
  return {
    add(name, data, options) {
      return queue.add(name, data, options);
    }
  };
}
