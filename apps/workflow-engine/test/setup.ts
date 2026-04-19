import { vi, beforeEach } from 'vitest';

// Global mocks for environment variables used in tests
const DEFAULT_ENV = {
  MESSAGING_PROVIDER_PROXY_BASE_URL: 'http://messaging.test',
  MESSAGING_PROVIDER_PROXY_AUTH_TOKEN: 'messaging-api-key',
  MESSAGING_PROVIDER_BASE_URL: 'http://messaging.test',
  MESSAGING_PROVIDER_API_KEY: 'messaging-api-key',
  WORKFLOW_ENGINE_INTERNAL_PSK: 'internal-psk',
  ENGINE_API_KEY: 'test-engine-api-key',
  MESSAGING_PROVIDER_WEBHOOK_SECRET: 'test-webhook-secret'
};

beforeEach(() => {
  // Restore default test environment variables before each test
  // This counteracts tests that delete them in afterEach
  for (const [key, value] of Object.entries(DEFAULT_ENV)) {
    process.env[key] = value;
  }
  
  // Always ensure REDIS_URL is unset to avoid real connection attempts
  delete process.env.REDIS_URL;
});

vi.mock('ioredis', () => {
  const Redis = vi.fn(() => ({
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    publish: vi.fn().mockResolvedValue(1),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue('OK'),
    disconnect: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    ping: vi.fn().mockResolvedValue('PONG'),
  }));
  return { default: Redis };
});
