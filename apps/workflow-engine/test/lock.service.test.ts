import { beforeEach, describe, expect, it } from 'vitest';
import { LockService, type LockRedisClient } from '../src/modules/concurrency/lock.service.js';

class InMemoryLockRedisClient implements LockRedisClient {
  private readonly values = new Map<string, { value: string; expiresAt: number }>();

  async set(
    key: string,
    value: string,
    condition: 'NX',
    expiry: 'PX',
    ttlMs: number
  ): Promise<'OK' | null> {
    if (condition !== 'NX' || expiry !== 'PX' || ttlMs <= 0) {
      throw new Error('Unsupported Redis set invocation');
    }

    this.evictIfExpired(key);

    if (this.values.has(key)) {
      return null;
    }

    this.values.set(key, { value, expiresAt: Date.now() + ttlMs });
    return 'OK';
  }

  async eval(script: string, numKeys: number, key: string, expectedValue: string): Promise<number> {
    if (!script || numKeys !== 1) {
      throw new Error('Unsupported Redis eval invocation');
    }

    this.evictIfExpired(key);

    if (this.values.get(key)?.value !== expectedValue) {
      return 0;
    }

    this.values.delete(key);
    return 1;
  }

  private evictIfExpired(key: string): void {
    const existing = this.values.get(key);
    if (!existing) {
      return;
    }

    if (existing.expiresAt <= Date.now()) {
      this.values.delete(key);
    }
  }
}

describe('LockService', () => {
  let service: LockService;

  beforeEach(() => {
    service = new LockService(new InMemoryLockRedisClient());
  });

  it('acquires a conversation-scoped lock once', async () => {
    const token = await service.acquire('conversation-1', 30_000);

    expect(token).toEqual(expect.any(String));
  });

  it('rejects concurrent acquisition on the same resource', async () => {
    const firstToken = await service.acquire('conversation-1', 30_000);
    const secondToken = await service.acquire('conversation-1', 30_000);

    expect(firstToken).toEqual(expect.any(String));
    expect(secondToken).toBeNull();
  });

  it('enforces ownership-safe release and allows reacquisition', async () => {
    const firstToken = await service.acquire('conversation-1', 30_000);

    expect(firstToken).toEqual(expect.any(String));

    const releaseWithWrongToken = await service.release('conversation-1', 'wrong-token');
    const blockedToken = await service.acquire('conversation-1', 30_000);
    const releaseWithOwnerToken = await service.release('conversation-1', firstToken as string);
    const reacquiredToken = await service.acquire('conversation-1', 30_000);

    expect(releaseWithWrongToken).toBe(false);
    expect(blockedToken).toBeNull();
    expect(releaseWithOwnerToken).toBe(true);
    expect(reacquiredToken).toEqual(expect.any(String));
    expect(reacquiredToken).not.toBe(firstToken);
  });

  it('allows reacquisition after TTL expiration', async () => {
    const firstToken = await service.acquire('conversation-ttl', 5);

    expect(firstToken).toEqual(expect.any(String));

    await new Promise((resolve) => {
      setTimeout(resolve, 15);
    });

    const secondToken = await service.acquire('conversation-ttl', 30_000);

    expect(secondToken).toEqual(expect.any(String));
    expect(secondToken).not.toBe(firstToken);
  });

  it('rejects blank resource and blank token inputs', async () => {
    await expect(service.acquire('   ', 30_000)).rejects.toThrow('Lock resourceId must not be empty');

    const token = await service.acquire('conversation-1', 30_000);
    expect(token).toEqual(expect.any(String));

    await expect(service.release('conversation-1', '   ')).rejects.toThrow('Lock token must not be empty');
  });
});
