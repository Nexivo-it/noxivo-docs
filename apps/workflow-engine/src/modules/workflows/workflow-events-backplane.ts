import type Redis from 'ioredis';
import { type WorkflowExecutionEvent, buildWorkflowExecutionChannel } from '@noxivo/contracts';
import { getWorkflowRedisConnection } from '../../lib/redis.js';

type Subscriber = (event: WorkflowExecutionEvent) => void;

export class WorkflowEventsBackplane {
  private readonly workflowSubscribers = new Map<string, Set<Subscriber>>();
  private readonly subscribedChannels = new Set<string>();

  private readonly handleRedisMessage = (channel: string, message: string) => {
    const channelParts = channel.split(':');
    const workflowId = channelParts[1];

    if (!workflowId || channelParts[2] !== 'execution') {
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
    } catch {
      return;
    }
  };

  constructor(
    private readonly publisher: Redis | null = getWorkflowRedisConnection(),
    private readonly subscriber: Redis | null = getWorkflowRedisConnection()?.duplicate() ?? null,
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

  async close(): Promise<void> {
    this.subscriber?.off('message', this.handleRedisMessage);
    await this.subscriber?.quit();
  }
}

let workflowEventsBackplane: WorkflowEventsBackplane | null = null;

export function getWorkflowEventsBackplane(): WorkflowEventsBackplane {
  workflowEventsBackplane ??= new WorkflowEventsBackplane();
  return workflowEventsBackplane;
}
