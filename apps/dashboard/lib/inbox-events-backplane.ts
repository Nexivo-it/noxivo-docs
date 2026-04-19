import { getDashboardRedisPublisher, getDashboardRedisSubscriber } from './redis';

export type InboxEvent = {
  type: 'conversation.updated' | 'message.created' | 'message.delivery_updated' | 'assignment.updated';
  conversationId: string;
};

type Subscriber = (event: InboxEvent) => void;

type RedisPublisher = {
  publish(channel: string, message: string): Promise<number>;
};

type RedisSubscriber = {
  subscribe(channel: string): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
  on(event: 'message', listener: (channel: string, message: string) => void): unknown;
  off(event: 'message', listener: (channel: string, message: string) => void): unknown;
};

function tenantChannel(tenantId: string): string {
  return `tenant:${tenantId}:inbox`;
}

export class InboxEventsBackplane {
  private readonly tenantSubscribers = new Map<string, Set<Subscriber>>();
  private readonly subscribedChannels = new Set<string>();
  private readonly handleRedisMessage = (channel: string, message: string) => {
    const tenantId = channel.split(':')[1];

    if (!tenantId) {
      return;
    }

    const payload = JSON.parse(message) as InboxEvent;
    const subscribers = this.tenantSubscribers.get(tenantId);

    if (!subscribers) {
      return;
    }

    for (const subscriber of subscribers) {
      subscriber(payload);
    }
  };

  constructor(
    private readonly publisher: RedisPublisher | null = getDashboardRedisPublisher(),
    private readonly subscriber: RedisSubscriber | null = getDashboardRedisSubscriber()
  ) {
    this.subscriber?.on('message', this.handleRedisMessage);
  }

  async subscribe(tenantId: string, listener: Subscriber): Promise<() => Promise<void>> {
    const listeners = this.tenantSubscribers.get(tenantId) ?? new Set<Subscriber>();
    const wasEmpty = listeners.size === 0;
    listeners.add(listener);
    this.tenantSubscribers.set(tenantId, listeners);

    const channel = tenantChannel(tenantId);

    if (this.subscriber && wasEmpty && !this.subscribedChannels.has(channel)) {
      await this.subscriber.subscribe(channel);
      this.subscribedChannels.add(channel);
    }

    return async () => {
      const current = this.tenantSubscribers.get(tenantId);

      if (!current) {
        return;
      }

      current.delete(listener);

      if (current.size === 0) {
        this.tenantSubscribers.delete(tenantId);

        if (this.subscriber && this.subscribedChannels.has(channel)) {
          await this.subscriber.unsubscribe(channel);
          this.subscribedChannels.delete(channel);
        }
      }
    };
  }

  async publish(tenantId: string, event: InboxEvent): Promise<void> {
    if (!this.publisher || !this.subscriber) {
      const subscribers = this.tenantSubscribers.get(tenantId);

      if (!subscribers) {
        return;
      }

      for (const subscriber of subscribers) {
        subscriber(event);
      }

      return;
    }

    await this.publisher.publish(tenantChannel(tenantId), JSON.stringify(event));
  }
}

let inboxEventsBackplane: InboxEventsBackplane | null = null;

export function getInboxEventsBackplane(): InboxEventsBackplane {
  inboxEventsBackplane ??= new InboxEventsBackplane();
  return inboxEventsBackplane;
}
