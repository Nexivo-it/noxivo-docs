import { afterEach, describe, expect, it } from 'vitest';
import { resolveMongoUri } from '../lib/mongodb.js';

const originalEnv = {
  MONGODB_URI: process.env.MONGODB_URI,
  MONGO_USER: process.env.MONGO_USER,
  MONGO_PASSWORD: process.env.MONGO_PASSWORD,
  NODE_ENV: process.env.NODE_ENV,
};

describe('dashboard mongodb helper', () => {
  afterEach(() => {
    process.env.MONGODB_URI = originalEnv.MONGODB_URI;
    process.env.MONGO_USER = originalEnv.MONGO_USER;
    process.env.MONGO_PASSWORD = originalEnv.MONGO_PASSWORD;
    process.env.NODE_ENV = originalEnv.NODE_ENV;
  });

  it('uses explicit MONGODB_URI when configured', () => {
    process.env.MONGODB_URI = 'mongodb://custom-host:27017/custom-db';
    process.env.NODE_ENV = 'production';

    expect(resolveMongoUri()).toBe('mongodb://custom-host:27017/custom-db');
  });

  it('uses the docker-compose mongodb service fallback in production when MONGODB_URI is missing', () => {
    delete process.env.MONGODB_URI;
    delete process.env.MONGO_USER;
    delete process.env.MONGO_PASSWORD;
    process.env.NODE_ENV = 'production';

    expect(resolveMongoUri()).toBe('mongodb://nexus:nexuspassword@mongodb:27017/noxivo_dashboard?authSource=admin');
  });
});
