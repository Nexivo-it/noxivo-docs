import { type UsageCaptureService } from '../metering/capture.service.js';
import { WorkflowDefinitionModel, ConversationModel } from '@noxivo/database';
import { type Queue } from 'bullmq';
import mongoose from 'mongoose';

export interface WorkflowTriggerInput {
  workflowDefinitionId: string;
  workflowRunId: string;
  conversationId: string;
  agencyId: string;
  tenantId: string;
  payload: Record<string, unknown>;
}

export class ConversationIngestService {
  constructor(
    private readonly usageCapture: Pick<UsageCaptureService, 'captureInboundMessage'>,
    private readonly continuationQueue: Queue | null
  ) {}

  async ingestInboundMessage(input: {
    agencyId: string;
    tenantId: string;
    conversationId: string;
    contactId: string;
    content: string;
    receivedAt?: Date;
  }): Promise<{ persisted: true }> {
    const captureInput: { agencyId: string; occurredAt?: Date } = {
      agencyId: input.agencyId
    };
    if (input.receivedAt) {
      captureInput.occurredAt = input.receivedAt;
    }
    await this.usageCapture.captureInboundMessage(captureInput);

    // Skip automation if conversation is assigned to a human
    const conversation = await ConversationModel.findById(input.conversationId).lean().exec();
    if (conversation && (conversation.status === 'assigned' || conversation.status === 'handoff')) {
      return { persisted: true };
    }

    // Trigger workflow if available
    if (this.continuationQueue) {
      const workflow = await WorkflowDefinitionModel.findOne({
        agencyId: input.agencyId,
        tenantId: input.tenantId,
        isActive: true
      }).lean().exec();

      if (workflow) {
        const workflowRunId = new mongoose.Types.ObjectId().toString();
        await this.continuationQueue.add('workflow.start', {
          workflowDefinitionId: workflow._id.toString(),
          workflowRunId,
          conversationId: input.conversationId,
          agencyId: input.agencyId,
          tenantId: input.tenantId,
          payload: {
            message: input.content,
            contactId: input.contactId,
            receivedAt: input.receivedAt?.toISOString() || new Date().toISOString()
          }
        });
      }
    }

    return { persisted: true };
  }
}
