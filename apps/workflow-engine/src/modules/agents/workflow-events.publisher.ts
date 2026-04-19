import { WorkflowExecutionEvent, buildWorkflowExecutionChannel } from '@noxivo/contracts';
import { getWorkflowRedisConnection } from '../../lib/redis.js';

type RedisPublisher = {
  publish(channel: string, message: string): Promise<number>;
};

export class WorkflowEventsPublisher {
  private readonly publisher: RedisPublisher | null;

  constructor(publisher: RedisPublisher | null = getWorkflowRedisConnection()) {
    this.publisher = publisher;
  }

  async publish(event: WorkflowExecutionEvent): Promise<void> {
    if (!this.publisher) {
      return;
    }

    const channel = buildWorkflowExecutionChannel(event.workflowId);
    await this.publisher.publish(channel, JSON.stringify(event));
  }

  async publishHit(workflowId: string, workflowRunId: string, nodeId: string): Promise<void> {
    await this.publish({
      workflowId,
      workflowRunId,
      nodeId,
      status: 'hit',
      timestamp: new Date().toISOString()
    });
  }

  async publishCompleted(workflowId: string, workflowRunId: string, nodeId: string, output?: Record<string, unknown>): Promise<void> {
    await this.publish({
      workflowId,
      workflowRunId,
      nodeId,
      status: 'completed',
      timestamp: new Date().toISOString(),
      output
    });
  }

  async publishFailed(workflowId: string, workflowRunId: string, nodeId: string, error: string): Promise<void> {
    await this.publish({
      workflowId,
      workflowRunId,
      nodeId,
      status: 'failed',
      timestamp: new Date().toISOString(),
      error
    });
  }
}
