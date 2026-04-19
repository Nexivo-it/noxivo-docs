import type { Redis } from 'ioredis';
import { ClusterManager } from './cluster-manager.js';

const SESSION_OWNER_KEY_PREFIX = 'workflow-engine:session-owner:';

export class SessionAffinity {
  private redis: Redis | null;
  private clusterManager: ClusterManager;
  private locallyOwnedSessions = new Set<string>();

  constructor(redis: Redis | null, clusterManager: ClusterManager) {
    this.redis = redis;
    this.clusterManager = clusterManager;
  }

  public async getOwnerUrl(sessionName: string): Promise<string | null> {
    if (!this.redis) return this.clusterManager.getCurrentNodeUrl();

    const instanceId = await this.redis.get(`${SESSION_OWNER_KEY_PREFIX}${sessionName}`);
    if (!instanceId) return null;

    // Check if the owner is still active in the cluster
    const activeNodes = await this.clusterManager.getActiveNodes();
    const ownerNode = activeNodes.find(n => n.instanceId === instanceId);
    
    if (ownerNode) {
      return ownerNode.nodeUrl;
    }

    return null;
  }

  public async claimSession(sessionName: string): Promise<boolean> {
    if (!this.redis) {
      this.locallyOwnedSessions.add(sessionName);
      return true;
    }

    const instanceId = this.clusterManager.getInstanceId();
    // Try to set ownership (NX ensures we only set if it doesn't exist)
    const result = await this.redis.setnx(`${SESSION_OWNER_KEY_PREFIX}${sessionName}`, instanceId);
    if (result === 1) {
       await this.redis.expire(`${SESSION_OWNER_KEY_PREFIX}${sessionName}`, 60 * 60 * 24 * 7); // 7 days TTL
       this.locallyOwnedSessions.add(sessionName);
       return true;
    }
    
    // If we didn't acquire it, check who holds it
    const currentOwner = await this.redis.get(`${SESSION_OWNER_KEY_PREFIX}${sessionName}`);
    if (currentOwner === instanceId) {
       this.locallyOwnedSessions.add(sessionName);
       return true;
    }

    const activeNodes = await this.clusterManager.getActiveNodes();
    if (!activeNodes.some(n => n.instanceId === currentOwner)) {
       // Previous owner is dead, we steal it
       await this.redis.set(`${SESSION_OWNER_KEY_PREFIX}${sessionName}`, instanceId, 'EX', 60 * 60 * 24 * 7);
       this.locallyOwnedSessions.add(sessionName);
       return true;
    }

    return false;
  }

  public async releaseSession(sessionName: string): Promise<void> {
    this.locallyOwnedSessions.delete(sessionName);
    if (!this.redis) return;

    const owner = await this.redis.get(`${SESSION_OWNER_KEY_PREFIX}${sessionName}`);
    if (owner === this.clusterManager.getInstanceId()) {
      await this.redis.del(`${SESSION_OWNER_KEY_PREFIX}${sessionName}`);
    }
  }

  public getLocalSessionCount(): number {
    return this.locallyOwnedSessions.size;
  }
}
