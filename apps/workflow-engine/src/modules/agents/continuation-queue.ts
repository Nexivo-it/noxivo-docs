import { Queue } from 'bullmq';
import { getWorkflowRedisConnection } from '../../lib/redis.js';

export const WORKFLOW_CONTINUATION_QUEUE_NAME = 'workflow-continuation';

let continuationQueue: Queue | null = null;

export function getWorkflowContinuationQueue(): Queue | null {
  if (continuationQueue) {
    return continuationQueue;
  }

  const connection = getWorkflowRedisConnection();

  if (!connection) {
    return null;
  }

  continuationQueue = new Queue(WORKFLOW_CONTINUATION_QUEUE_NAME, { connection });
  return continuationQueue;
}

export async function cancelWorkflowContinuationJob(jobId: string): Promise<void> {
  const queue = getWorkflowContinuationQueue();

  if (!queue) {
    return;
  }

  const job = await queue.getJob(jobId);

  if (job) {
    await job.remove();
  }
}
