import type { InboxEvent } from '@noxivo/contracts';
import { buildTenantInboxChannel } from '@noxivo/contracts';
import { getWorkflowRedisConnection } from '../../lib/redis.js';

type RedisPublisher = {
  publish(channel: string, message: string): Promise<number>;
};

export class InboxEventsPublisher {
  private readonly publisher: RedisPublisher | null;

  constructor(publisher: RedisPublisher | null = getWorkflowRedisConnection()) {
    this.publisher = publisher;
  }

  async publish(tenantId: string, event: InboxEvent): Promise<void> {
    if (!this.publisher) {
      return;
    }

    const channel = buildTenantInboxChannel(tenantId);
    await this.publisher.publish(channel, JSON.stringify(event));
  }

  async publishMessageCreated(tenantId: string, conversationId: string): Promise<void> {
    await this.publish(tenantId, {
      type: 'message.created',
      conversationId
    });
  }

  async publishDeliveryUpdated(tenantId: string, conversationId: string): Promise<void> {
    await this.publish(tenantId, {
      type: 'message.delivery_updated',
      conversationId
    });
  }

  async publishConversationUpdated(tenantId: string, conversationId: string): Promise<void> {
    await this.publish(tenantId, {
      type: 'conversation.updated',
      conversationId
    });
  }

  async publishAssignmentUpdated(tenantId: string, conversationId: string): Promise<void> {
    await this.publish(tenantId, {
      type: 'assignment.updated',
      conversationId
    });
  }
}