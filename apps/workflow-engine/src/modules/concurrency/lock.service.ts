import { randomUUID } from 'node:crypto';

export interface LockRedisClient {
  set(
    key: string,
    value: string,
    condition: 'NX',
    expiry: 'PX',
    ttlMs: number
  ): Promise<'OK' | null>;
  eval(script: string, numKeys: number, key: string, expectedValue: string): Promise<number>;
}

const RELEASE_LOCK_SCRIPT =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";

export class LockService {
  constructor(private readonly redis: LockRedisClient) {}

  async acquire(resourceId: string, ttlMs: number): Promise<string | null> {
    this.assertResourceId(resourceId);
    this.assertTtl(ttlMs);

    const token = randomUUID();
    const key = this.lockKey(resourceId);
    const result = await this.redis.set(key, token, 'NX', 'PX', ttlMs);

    if (result !== 'OK') {
      return null;
    }

    return token;
  }

  async release(resourceId: string, token: string): Promise<boolean> {
    this.assertResourceId(resourceId);

    if (token.trim().length === 0) {
      throw new Error('Lock token must not be empty');
    }

    const key = this.lockKey(resourceId);
    const deleted = await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
    return deleted === 1;
  }

  private lockKey(resourceId: string): string {
    return `lock:${resourceId}`;
  }

  private assertResourceId(resourceId: string): void {
    if (resourceId.trim().length === 0) {
      throw new Error('Lock resourceId must not be empty');
    }
  }

  private assertTtl(ttlMs: number): void {
    if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
      throw new Error('Lock ttlMs must be a positive integer');
    }
  }
}
