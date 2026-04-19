import Redis from 'ioredis';

let redisConnection: Redis | null = null;

export function getWorkflowRedisConnection(): Redis | null {
  if (redisConnection) {
    return redisConnection;
  }

  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return null;
  }

  redisConnection = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null
  });

  return redisConnection;
}
