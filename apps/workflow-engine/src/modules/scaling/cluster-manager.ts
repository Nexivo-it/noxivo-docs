import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';

const CLUSTER_HEARTBEAT_KEY_PREFIX = 'workflow-engine:node-heartbeat:';
const HEARTBEAT_INTERVAL_MS = 5000;
const HEARTBEAT_TTL_SEC = 15;

export interface ClusterNode {
  instanceId: string;
  nodeUrl: string;
}

export class ClusterManager {
  private instanceId: string;
  private nodeUrl: string | null = null;
  private redis: Redis | null;
  private heartbeatInterval: ReturnType<typeof setInterval> | undefined;

  constructor(redis: Redis | null) {
    this.instanceId = randomUUID();
    this.redis = redis;
  }

  public getInstanceId(): string {
    return this.instanceId;
  }

  public getCurrentNodeUrl(): string | null {
    return this.nodeUrl;
  }

  public async start(nodeUrl: string): Promise<void> {
    this.nodeUrl = nodeUrl;
    if (!this.redis) return;

    await this.ping();
    this.heartbeatInterval = setInterval(() => {
      this.ping().catch((error) => console.error('Cluster heartbeat failed:', error));
    }, HEARTBEAT_INTERVAL_MS);
  }

  public stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    if (this.redis) {
      this.redis.del(`${CLUSTER_HEARTBEAT_KEY_PREFIX}${this.instanceId}`).catch(() => {});
    }
  }

  private async ping(): Promise<void> {
    if (!this.redis || !this.nodeUrl) return;
    await this.redis.set(
      `${CLUSTER_HEARTBEAT_KEY_PREFIX}${this.instanceId}`,
      this.nodeUrl,
      'EX',
      HEARTBEAT_TTL_SEC
    );
  }

  public async getActiveNodes(): Promise<ClusterNode[]> {
    if (!this.redis) {
      return this.nodeUrl ? [{ instanceId: this.instanceId, nodeUrl: this.nodeUrl }] : [];
    }

    const keys = await this.redis.keys(`${CLUSTER_HEARTBEAT_KEY_PREFIX}*`);
    if (keys.length === 0) return [];

    const urls = await this.redis.mget(...keys);
    return keys
      .map((key, i) => ({
        instanceId: key.substring(CLUSTER_HEARTBEAT_KEY_PREFIX.length),
        nodeUrl: urls[i]
      }))
      .filter((n): n is ClusterNode => n.nodeUrl != null);
  }
}
