import Redis from 'ioredis';

let publisher: Redis | null = null;
let subscriber: Redis | null = null;

function createRedisClient(): Redis | null {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return null;
  }

  return new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null
  });
}

export function getDashboardRedisPublisher(): Redis | null {
  publisher ??= createRedisClient();
  return publisher;
}

export function getDashboardRedisSubscriber(): Redis | null {
  subscriber ??= createRedisClient();
  return subscriber;
}
