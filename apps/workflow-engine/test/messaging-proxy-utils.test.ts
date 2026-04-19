import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyToMessaging } from '../src/lib/messaging-proxy-utils.js';

describe('proxyToMessaging', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MESSAGING_PROVIDER_BASE_URL;
    delete process.env.MESSAGING_PROVIDER_API_KEY;
  });

  it('returns null for successful empty-body responses', async () => {
    process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';

    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await proxyToMessaging('/api/sendSeen', { method: 'POST' });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns plain text for successful non-json responses', async () => {
    process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';

    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await proxyToMessaging('/api/sendSeen', { method: 'POST' });

    expect(result).toBe('ok');
  });
});
