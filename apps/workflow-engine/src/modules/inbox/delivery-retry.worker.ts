import { MessageModel } from '@noxivo/database';
import { z } from 'zod';
import { DeliveryLifecycleService } from './delivery-lifecycle.service.js';

export const DELIVERY_RETRY_JOB_NAME = 'inbox.delivery.retry';

const DeliveryRetryJobDataSchema = z.object({
  agencyId: z.string().min(1),
  tenantId: z.string().min(1),
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  maxRetries: z.number().int().positive().default(3),
  reason: z.string().min(1)
}).strict();

export type DeliveryRetryJobData = z.infer<typeof DeliveryRetryJobDataSchema>;

function readRetryCount(metadata: unknown): number {
  if (typeof metadata !== 'object' || metadata === null) {
    return 0;
  }

  if (!('retryCount' in metadata) || typeof (metadata as { retryCount?: unknown }).retryCount !== 'number') {
    return 0;
  }

  return (metadata as { retryCount: number }).retryCount;
}

function toMetadataRecord(metadata: unknown): Record<string, unknown> {
  return typeof metadata === 'object' && metadata !== null
    ? { ...(metadata as Record<string, unknown>) }
    : {};
}

export class DeliveryRetryWorker {
  constructor(private readonly deliveryLifecycleService: DeliveryLifecycleService = new DeliveryLifecycleService()) {}

  async processJob(input: DeliveryRetryJobData) {
    const parsed = DeliveryRetryJobDataSchema.parse(input);
    const message = await MessageModel.findById(parsed.messageId).lean().exec();

    if (!message) {
      throw new Error('Message not found for retry');
    }

    const retryCount = readRetryCount(message.metadata);

    if (retryCount >= parsed.maxRetries) {
      await this.deliveryLifecycleService.syncMessageState({
        agencyId: parsed.agencyId,
        tenantId: parsed.tenantId,
        conversationId: parsed.conversationId,
        messageId: parsed.messageId,
        providerMessageId: message.providerMessageId ?? message.messagingMessageId ?? null,
        deliveryStatus: 'failed',
        providerAck: message.providerAck ?? null,
        providerAckName: message.providerAckName ?? null,
        error: `Retry attempts exhausted: ${parsed.reason}`,
        source: 'retry_worker',
        metadata: {
          retryCount,
          maxRetries: parsed.maxRetries,
          exhausted: true
        }
      });

      return { status: 'exhausted' as const, retryCount };
    }

    const nextRetryCount = retryCount + 1;
    await MessageModel.findByIdAndUpdate(parsed.messageId, {
      $set: {
        metadata: {
          ...toMetadataRecord(message.metadata),
          retryCount: nextRetryCount,
          lastRetryReason: parsed.reason
        }
      }
    }).exec();

    await this.deliveryLifecycleService.syncMessageState({
      agencyId: parsed.agencyId,
      tenantId: parsed.tenantId,
      conversationId: parsed.conversationId,
      messageId: parsed.messageId,
      providerMessageId: message.providerMessageId ?? message.messagingMessageId ?? null,
      deliveryStatus: 'queued',
      providerAck: 0,
      providerAckName: 'RETRY_QUEUED',
      error: null,
      source: 'retry_worker',
      metadata: {
        retryCount: nextRetryCount,
        maxRetries: parsed.maxRetries,
        retryReason: parsed.reason
      }
    });

    return { status: 'queued' as const, retryCount: nextRetryCount };
  }
}

export function createDeliveryRetryProcessor(worker: DeliveryRetryWorker) {
  return async (job: { data: DeliveryRetryJobData }) => worker.processJob(job.data);
}
