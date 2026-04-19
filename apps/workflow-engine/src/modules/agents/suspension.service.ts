import { randomUUID } from 'node:crypto';

const WorkflowRunRepoInterface = {
  findById: {} as unknown as (id: string) => Promise<unknown | null>,
  findOneAndUpdate: {} as unknown as (filter: Record<string, unknown>, update: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown | null>,
  findOneAndDelete: {} as unknown as (filter: Record<string, unknown>) => Promise<unknown | null>
};

const WorkflowDefinitionRepoInterface = {
  findById: {} as unknown as (id: string) => Promise<unknown | null>
};

export interface SuspensionResult {
  taskToken: string;
  status: string;
  suspension: {
    taskToken: string;
    expectedEvent: string;
    suspendedAt: Date;
  } | null;
}

export class SuspensionService {
  private readonly workflowRunRepo: typeof WorkflowRunRepoInterface;
  private readonly workflowDefinitionRepo: typeof WorkflowDefinitionRepoInterface;

  constructor(input: {
    workflowRunRepo: typeof WorkflowRunRepoInterface;
    workflowDefinitionRepo: typeof WorkflowDefinitionRepoInterface;
  }) {
    this.workflowRunRepo = input.workflowRunRepo;
    this.workflowDefinitionRepo = input.workflowDefinitionRepo;
  }

  async suspend(runId: string, expectedEvent: string): Promise<SuspensionResult> {
    if (!runId || runId.trim().length === 0) {
      throw new Error('runId must not be empty');
    }
    if (!expectedEvent || expectedEvent.trim().length === 0) {
      throw new Error('expectedEvent must not be empty');
    }

    const existingRun = await this.workflowRunRepo.findById(runId);
    if (!existingRun) {
      throw new Error(`Workflow run not found: ${runId}`);
    }

    const run = existingRun as {
      id: string;
      status: string;
      tenantId?: string;
      workflowId?: string;
      conversationId?: string;
      currentNodeId?: string;
      suspension?: Record<string, unknown> | null;
    };

    if (run.status !== 'running') {
      throw new Error(`Cannot suspend run with status: ${run.status}`);
    }

    const taskToken = randomUUID();
    const suspendedAt = new Date();

    const updated = await this.workflowRunRepo.findOneAndUpdate(
      { id: runId, status: 'running' },
      {
        $set: {
          status: 'suspended',
          suspension: {
            taskToken,
            expectedEvent,
            suspendedAt
          }
        }
      },
      { new: true }
    );

    if (!updated) {
      throw new Error('Failed to suspend workflow run');
    }

    const updatedRun = updated as {
      status: string;
      suspension: Record<string, unknown> | null;
    };

    return {
      taskToken,
      status: updatedRun.status,
      suspension: updatedRun.suspension as SuspensionResult['suspension']
    };
  }

  async resume(token: string, eventType: string, payload: Record<string, unknown> = {}): Promise<SuspensionResult | null> {
    if (!token || token.trim().length === 0) {
      throw new Error('token must not be empty');
    }
    if (!eventType || eventType.trim().length === 0) {
      throw new Error('eventType must not be empty');
    }

    const updated = await this.workflowRunRepo.findOneAndUpdate(
      {
        'suspension.taskToken': token,
        'suspension.expectedEvent': eventType,
        status: 'suspended'
      },
      {
        $set: {
          status: 'running',
          suspension: null
        }
      },
      { new: true }
    );

    if (!updated) {
      return null;
    }

    const updatedRun = updated as {
      status: string;
      suspension: Record<string, unknown> | null;
    };

    return {
      taskToken: token,
      status: updatedRun.status,
      suspension: updatedRun.suspension as SuspensionResult['suspension']
    };
  }
}