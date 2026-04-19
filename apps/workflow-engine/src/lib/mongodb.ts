import mongoose, { type Connection } from 'mongoose';

interface MongooseCache {
  conn: Connection | null;
  promise: Promise<Connection> | null;
}

const globalWithMongoose = globalThis as typeof globalThis & {
  __noxivoWorkflowEngineMongoose?: MongooseCache;
};

const cached = globalWithMongoose.__noxivoWorkflowEngineMongoose ?? {
  conn: null,
  promise: null
};

globalWithMongoose.__noxivoWorkflowEngineMongoose = cached;

export async function dbConnect(): Promise<Connection> {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/noxivo';

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(mongoUri, {
      bufferCommands: false
    }).then((instance) => instance.connection);
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}
