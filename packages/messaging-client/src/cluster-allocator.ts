import { type HydratedDocument, type Model } from 'mongoose';
import { MessagingClusterModel, type MessagingCluster } from '@noxivo/database';

export class ClusterAllocator {
  /**
   * Allocate a cluster based on the designated region.
   * Finds an active cluster where activeSessionCount is strictly less than capacity.
   * If none is found, throws an Error.
   * In a more complete allocator, this could apply load-balancing heuristics.
   */
  async allocateCluster(region: string): Promise<HydratedDocument<MessagingCluster>> {
    const cluster = await MessagingClusterModel.findOneAndUpdate(
      {
        region,
        status: 'active',
        $expr: { $lt: ['$activeSessionCount', '$capacity'] }
      },
      {
        $inc: { activeSessionCount: 1 }
      },
      {
        new: true,
        sort: { activeSessionCount: 1 } // Pick the one with the lowest session count (simple load balancing)
      }
    ).exec();

    if (!cluster) {
      throw new Error(`No available clusters found in region ${region}`);
    }

    return cluster;
  }
}
