import { ConversationModel, WorkflowRunModel } from '@noxivo/database';
import { cancelWorkflowContinuationJob } from '../agents/continuation-queue.js';
import { InboxEventsPublisher } from '../inbox/inbox-events.publisher.js';

interface HandoffConversationRecord {
  _id: { toString(): string };
  assignedTo?: { toString(): string } | string | null;
  status: string;
}

interface HandoffWorkflowRunRecord {
  workflowRunId: string;
  status: string;
  currentNodeId?: string | null;
}

export interface HandoffServiceDependencies {
  cancelContinuationJob?: (jobId: string) => Promise<void>;
  conversationRepo?: {
    findOneAndUpdate: typeof ConversationModel.findOneAndUpdate;
  };
  workflowRunRepo?: {
    find: typeof WorkflowRunModel.find;
    updateMany: typeof WorkflowRunModel.updateMany;
  };
  inboxEventsPublisher?: InboxEventsPublisher;
}

export class HandoffService {
  private readonly conversationRepo: NonNullable<HandoffServiceDependencies['conversationRepo']>;
  private readonly workflowRunRepo: NonNullable<HandoffServiceDependencies['workflowRunRepo']>;
  private readonly inboxEventsPublisher: InboxEventsPublisher;

  constructor(private readonly dependencies: HandoffServiceDependencies = {}) {
    this.conversationRepo = dependencies.conversationRepo ?? ConversationModel;
    this.workflowRunRepo = dependencies.workflowRunRepo ?? WorkflowRunModel;
    this.dependencies.cancelContinuationJob ??= cancelWorkflowContinuationJob;
    this.inboxEventsPublisher = dependencies.inboxEventsPublisher ?? new InboxEventsPublisher();
  }

  async handoffConversation(input: {
    agencyId: string;
    tenantId: string;
    conversationId: string;
    assignedTo: string;
  }) {
    const conversation = await this.conversationRepo.findOneAndUpdate(
      {
        _id: input.conversationId,
        agencyId: input.agencyId,
        tenantId: input.tenantId
      },
      {
        assignedTo: input.assignedTo,
        status: 'assigned'
      },
      { new: true }
    ).lean().exec();

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const activeRuns = await this.workflowRunRepo.find({
      agencyId: input.agencyId,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      status: { $in: ['running', 'suspended'] }
    }).lean().exec();

    for (const run of activeRuns as unknown as HandoffWorkflowRunRecord[]) {
      if (run.status === 'suspended' && run.currentNodeId && this.dependencies.cancelContinuationJob) {
        await this.dependencies.cancelContinuationJob(`workflow.delay.resume:${run.workflowRunId}:${run.currentNodeId}`);
      }
    }

    await this.workflowRunRepo.updateMany(
      {
        agencyId: input.agencyId,
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        status: { $in: ['running', 'suspended'] }
      },
      {
        $set: {
          status: 'cancelled',
          finishedAt: new Date()
        }
      }
    ).exec();

    await this.inboxEventsPublisher.publish(input.tenantId, {
      type: 'assignment.updated',
      conversationId: input.conversationId
    });

    return conversation as unknown as HandoffConversationRecord | null;
  }

  async clearHandoff(input: {
    agencyId: string;
    tenantId: string;
    conversationId: string;
  }) {
    const conversation = await this.conversationRepo.findOneAndUpdate(
      {
        _id: input.conversationId,
        agencyId: input.agencyId,
        tenantId: input.tenantId
      },
      {
        assignedTo: null,
        status: 'open'
      },
      { new: true }
    ).lean().exec();

    if (conversation) {
      await this.inboxEventsPublisher.publish(input.tenantId, {
        type: 'assignment.updated',
        conversationId: input.conversationId
      });
    }

    return conversation as unknown as HandoffConversationRecord | null;
  }
}
