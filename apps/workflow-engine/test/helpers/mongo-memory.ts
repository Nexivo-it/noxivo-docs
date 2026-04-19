import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

interface MongoMemoryCache {
  server: MongoMemoryServer | null;
  promise: Promise<MongoMemoryServer> | null;
  refCount: number;
  previousMongoUri: string | undefined;
}

const cache: MongoMemoryCache = {
  server: null,
  promise: null,
  refCount: 0,
  previousMongoUri: undefined
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createMongoMemoryServer(): Promise<MongoMemoryServer> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await MongoMemoryServer.create();
    } catch (error) {
      lastError = error;

      if (attempt < 3) {
        await sleep(250 * attempt);
      }
    }
  }

  throw lastError;
}

async function ensureMongoMemoryServer(): Promise<MongoMemoryServer> {
  if (cache.server) {
    return cache.server;
  }

  if (!cache.promise) {
    cache.promise = createMongoMemoryServer();
  }

  cache.server = await cache.promise;
  return cache.server;
}

export async function connectWorkflowEngineTestDb(input: { dbName?: string } = {}): Promise<string> {
  const server = await ensureMongoMemoryServer();
  cache.refCount += 1;

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  cache.previousMongoUri ??= process.env.MONGODB_URI;
  process.env.MONGODB_URI = server.getUri();

  await mongoose.connect(server.getUri(), input.dbName ? { dbName: input.dbName } : undefined);

  return server.getUri();
}

export async function resetWorkflowEngineTestDb(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({}))
  );
}

export async function disconnectWorkflowEngineTestDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  cache.refCount = Math.max(0, cache.refCount - 1);

  if (cache.refCount === 0) {
    if (cache.server) {
      await cache.server.stop();
    }

    cache.server = null;
    cache.promise = null;

    if (cache.previousMongoUri === undefined) {
      delete process.env.MONGODB_URI;
    } else {
      process.env.MONGODB_URI = cache.previousMongoUri;
    }

    cache.previousMongoUri = undefined;
  }
}
