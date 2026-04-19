import { describe, expect, it, vi } from 'vitest';
import { InboxEventsBackplane } from '../lib/inbox-events-backplane.js';

function createRedisMocks() {
  const listeners = new Map<string, Array<(channel: string, message: string) => void>>();
  const subscribedChannels = new Set<string>();

  const subscriber = {
    async subscribe(channel: string) {
      subscribedChannels.add(channel);
    },
    async unsubscribe(channel: string) {
      subscribedChannels.delete(channel);
    },
    on(event: 'message', listener: (channel: string, message: string) => void) {
      const current = listeners.get(event) ?? [];
      current.push(listener);
      listeners.set(event, current);
    },
    off(event: 'message', listener: (channel: string, message: string) => void) {
      listeners.set(event, (listeners.get(event) ?? []).filter((entry) => entry !== listener));
    }
  };

  const publisher = {
    async publish(channel: string, message: string) {
      for (const listener of listeners.get('message') ?? []) {
        listener(channel, message);
      }

      return 1;
    }
  };

  return { publisher, subscriber, subscribedChannels };
}

describe('InboxEventsBackplane', () => {
  it('publishes tenant-scoped events to local subscribers through the Redis backplane', async () => {
    const redis = createRedisMocks();
    const backplane = new InboxEventsBackplane(redis.publisher, redis.subscriber);
    const subscriber = vi.fn();
    const unsubscribe = await backplane.subscribe('tenant-1', subscriber);

    await backplane.publish('tenant-1', {
      type: 'message.created',
      conversationId: 'conv-1'
    });

    expect(subscriber).toHaveBeenCalledWith({
      type: 'message.created',
      conversationId: 'conv-1'
    });

    await unsubscribe();
  });

  it('does not leak events across tenants', async () => {
    const redis = createRedisMocks();
    const backplane = new InboxEventsBackplane(redis.publisher, redis.subscriber);
    const tenantOneSubscriber = vi.fn();
    const tenantTwoSubscriber = vi.fn();

    const unsubscribeOne = await backplane.subscribe('tenant-1', tenantOneSubscriber);
    const unsubscribeTwo = await backplane.subscribe('tenant-2', tenantTwoSubscriber);

    await backplane.publish('tenant-1', {
      type: 'assignment.updated',
      conversationId: 'conv-1'
    });

    expect(tenantOneSubscriber).toHaveBeenCalledTimes(1);
    expect(tenantTwoSubscriber).not.toHaveBeenCalled();

    await unsubscribeOne();
    await unsubscribeTwo();
  });

  it('unsubscribes Redis channels when the last local subscriber disconnects', async () => {
    const redis = createRedisMocks();
    const backplane = new InboxEventsBackplane(redis.publisher, redis.subscriber);
    const unsubscribe = await backplane.subscribe('tenant-1', vi.fn());

    expect(redis.subscribedChannels.has('tenant:tenant-1:inbox')).toBe(true);

    await unsubscribe();

    expect(redis.subscribedChannels.has('tenant:tenant-1:inbox')).toBe(false);
  });
});
