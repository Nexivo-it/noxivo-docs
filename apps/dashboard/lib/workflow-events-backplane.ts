import { getDashboardRedisPublisher, getDashboardRedisSubscriber } from './redis';
import { WorkflowExecutionEvent, buildWorkflowExecutionChannel } from '@noxivo/contracts';

type Subscriber = (event: WorkflowExecutionEvent) => void;

type RedisPublisher = {
  publish(channel: string, message: string): Promise<number>;
};

type RedisSubscriber = {
  subscribe(channel: string): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
  on(event: 'message', listener: (channel: string, message: string) => void): unknown;
  off(event: 'message', listener: (channel: string, message: string) => void): unknown;
};

export class WorkflowEventsBackplane {
  private readonly workflowSubscribers = new Map<string, Set<Subscriber>>();
  private readonly subscribedChannels = new Set<string>();
  private readonly handleRedisMessage = (channel: string, message: string) => {
    // Channel format: workflow:${workflowId}:execution
    const parts = channel.split(':');
    const workflowId = parts[1];

    if (!workflowId || parts[2] !== 'execution') {
      return;
    }

    try {
      const payload = JSON.parse(message) as WorkflowExecutionEvent;
      const subscribers = this.workflowSubscribers.get(workflowId);

      if (!subscribers) {
        return;
      }

      for (const subscriber of subscribers) {
        subscriber(payload);
      }
    } catch (error) {
      console.error('Failed to parse workflow execution event from Redis:', error);
    }
  };

  constructor(
    private readonly publisher: RedisPublisher | null = getDashboardRedisPublisher(),
    private readonly subscriber: RedisSubscriber | null = getDashboardRedisSubscriber()
  ) {
    this.subscriber?.on('message', this.handleRedisMessage);
  }

  async subscribe(workflowId: string, listener: Subscriber): Promise<() => Promise<void>> {
    const listeners = this.workflowSubscribers.get(workflowId) ?? new Set<Subscriber>();
    const wasEmpty = listeners.size === 0;
    listeners.add(listener);
    this.workflowSubscribers.set(workflowId, listeners);

    const channel = buildWorkflowExecutionChannel(workflowId);

    if (this.subscriber && wasEmpty && !this.subscribedChannels.has(channel)) {
      await this.subscriber.subscribe(channel);
      this.subscribedChannels.add(channel);
    }

    return async () => {
      const current = this.workflowSubscribers.get(workflowId);

      if (!current) {
        return;
      }

      current.delete(listener);

      if (current.size === 0) {
        this.workflowSubscribers.delete(workflowId);

        if (this.subscriber && this.subscribedChannels.has(channel)) {
          await this.subscriber.unsubscribe(channel);
          this.subscribedChannels.delete(channel);
        }
      }
    };
  }

  async publish(workflowId: string, event: WorkflowExecutionEvent): Promise<void> {
    if (!this.publisher || !this.subscriber) {
      const subscribers = this.workflowSubscribers.get(workflowId);

      if (!subscribers) {
        return;
      }

      for (const subscriber of subscribers) {
        subscriber(event);
      }

      return;
    }

    await this.publisher.publish(buildWorkflowExecutionChannel(workflowId), JSON.stringify(event));
  }
}

let workflowEventsBackplane: WorkflowEventsBackplane | null = null;

export function getWorkflowEventsBackplane(): WorkflowEventsBackplane {
  workflowEventsBackplane ??= new WorkflowEventsBackplane();
  return workflowEventsBackplane;
}
