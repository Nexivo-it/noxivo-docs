import mongoose, { type Connection } from 'mongoose';

interface MongooseCache {
  conn: Connection | null;
  promise: Promise<Connection> | null;
}

let cached: MongooseCache = (global as Record<string, unknown>).mongoose as MongooseCache ?? { conn: null, promise: null };

if (!(global as Record<string, unknown>).mongoose) {
  (global as Record<string, unknown>).mongoose = cached;
}

async function dbConnect() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/noxivo';

  if (!mongoUri) {
    throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    console.log('[DEBUG] DB: Initiating new connection attempt...');
    
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('MongoDB connection timed out after 10s')), 10000)
    );

    cached.promise = Promise.race([
      mongoose.connect(mongoUri, opts).then((m) => m.connection),
      timeoutPromise
    ]);
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
