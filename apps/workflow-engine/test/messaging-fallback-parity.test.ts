import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerMessagingFallbackRoutes } from '../src/routes/v1/messaging-fallback.routes.js';

type ProxyCase = {
  label: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  enginePath: string;
  expectedMessagingPath: string;
  body?: Record<string, unknown>;
};

const CHATTTING_AND_CHATS_CASES: ProxyCase[] = [
  { label: 'sendText post', method: 'POST', enginePath: '/api/v1/sendText', expectedMessagingPath: '/api/sendText', body: { session: 'dev', chatId: '15550001@c.us', text: 'hello' } },
  { label: 'sendText get', method: 'GET', enginePath: '/api/v1/sendText?session=dev&chatId=15550001%40c.us&text=hello', expectedMessagingPath: '/api/sendText?session=dev&chatId=15550001%40c.us&text=hello' },
  { label: 'sendImage', method: 'POST', enginePath: '/api/v1/sendImage', expectedMessagingPath: '/api/sendImage', body: { session: 'dev', chatId: '15550001@c.us', file: { url: 'https://example.com/a.jpg' } } },
  { label: 'sendFile', method: 'POST', enginePath: '/api/v1/sendFile', expectedMessagingPath: '/api/sendFile', body: { session: 'dev', chatId: '15550001@c.us', file: { url: 'https://example.com/a.pdf' } } },
  { label: 'sendVoice', method: 'POST', enginePath: '/api/v1/sendVoice', expectedMessagingPath: '/api/sendVoice', body: { session: 'dev', chatId: '15550001@c.us', file: { url: 'https://example.com/a.ogg' } } },
  { label: 'sendVideo', method: 'POST', enginePath: '/api/v1/sendVideo', expectedMessagingPath: '/api/sendVideo', body: { session: 'dev', chatId: '15550001@c.us', file: { url: 'https://example.com/a.mp4' } } },
  { label: 'send custom preview', method: 'POST', enginePath: '/api/v1/send/link-custom-preview', expectedMessagingPath: '/api/send/link-custom-preview', body: { session: 'dev', chatId: '15550001@c.us', text: 'https://example.com' } },
  { label: 'send buttons', method: 'POST', enginePath: '/api/v1/sendButtons', expectedMessagingPath: '/api/sendButtons', body: { session: 'dev', chatId: '15550001@c.us', body: 'hello' } },
  { label: 'send list', method: 'POST', enginePath: '/api/v1/sendList', expectedMessagingPath: '/api/sendList', body: { session: 'dev', chatId: '15550001@c.us', body: 'hello' } },
  { label: 'forward message', method: 'POST', enginePath: '/api/v1/forwardMessage', expectedMessagingPath: '/api/forwardMessage', body: { session: 'dev', chatId: '15550001@c.us', messageId: 'wamid-1' } },
  { label: 'send seen', method: 'POST', enginePath: '/api/v1/sendSeen', expectedMessagingPath: '/api/sendSeen', body: { session: 'dev', chatId: '15550001@c.us' } },
  { label: 'start typing', method: 'POST', enginePath: '/api/v1/startTyping', expectedMessagingPath: '/api/startTyping', body: { session: 'dev', chatId: '15550001@c.us' } },
  { label: 'stop typing', method: 'POST', enginePath: '/api/v1/stopTyping', expectedMessagingPath: '/api/stopTyping', body: { session: 'dev', chatId: '15550001@c.us' } },
  { label: 'reaction', method: 'PUT', enginePath: '/api/v1/reaction', expectedMessagingPath: '/api/reaction', body: { session: 'dev', chatId: '15550001@c.us', messageId: 'wamid-1', reaction: '👍' } },
  { label: 'star', method: 'PUT', enginePath: '/api/v1/star', expectedMessagingPath: '/api/star', body: { session: 'dev', chatId: '15550001@c.us', messageId: 'wamid-1', star: true } },
  { label: 'send poll', method: 'POST', enginePath: '/api/v1/sendPoll', expectedMessagingPath: '/api/sendPoll', body: { session: 'dev', chatId: '15550001@c.us', name: 'poll', options: ['a', 'b'] } },
  { label: 'poll vote', method: 'POST', enginePath: '/api/v1/sendPollVote', expectedMessagingPath: '/api/sendPollVote', body: { session: 'dev', chatId: '15550001@c.us', messageId: 'wamid-1', optionNames: ['a'] } },
  { label: 'send location', method: 'POST', enginePath: '/api/v1/sendLocation', expectedMessagingPath: '/api/sendLocation', body: { session: 'dev', chatId: '15550001@c.us', latitude: 1, longitude: 2 } },
  { label: 'send contact vcard', method: 'POST', enginePath: '/api/v1/sendContactVcard', expectedMessagingPath: '/api/sendContactVcard', body: { session: 'dev', chatId: '15550001@c.us', contact: { displayName: 'A' } } },
  { label: 'send button reply', method: 'POST', enginePath: '/api/v1/send/buttons/reply', expectedMessagingPath: '/api/send/buttons/reply', body: { session: 'dev', chatId: '15550001@c.us', buttonId: '1' } },
  { label: 'messages listing', method: 'GET', enginePath: '/api/v1/messages?session=dev&chatId=15550001%40c.us', expectedMessagingPath: '/api/messages?session=dev&chatId=15550001%40c.us' },
  { label: 'check number status', method: 'GET', enginePath: '/api/v1/checkNumberStatus?session=dev&phone=15550001', expectedMessagingPath: '/api/checkNumberStatus?session=dev&phone=15550001' },
  { label: 'reply deprecated', method: 'POST', enginePath: '/api/v1/reply', expectedMessagingPath: '/api/reply', body: { session: 'dev', chatId: '15550001@c.us', text: 'hello' } },
  { label: 'send link preview', method: 'POST', enginePath: '/api/v1/sendLinkPreview', expectedMessagingPath: '/api/sendLinkPreview', body: { session: 'dev', chatId: '15550001@c.us', text: 'https://example.com' } },
  { label: 'get chats', method: 'GET', enginePath: '/api/v1/dev/chats?limit=25', expectedMessagingPath: '/api/dev/chats?limit=25' },
  { label: 'get chats overview', method: 'GET', enginePath: '/api/v1/dev/chats/overview?limit=25&offset=10', expectedMessagingPath: '/api/dev/chats/overview?limit=25&offset=10' },
  { label: 'post chats overview', method: 'POST', enginePath: '/api/v1/dev/chats/overview', expectedMessagingPath: '/api/dev/chats/overview', body: { ids: ['1@c.us'] } },
  { label: 'delete chat', method: 'DELETE', enginePath: '/api/v1/dev/chats/15550001%40c.us', expectedMessagingPath: '/api/dev/chats/15550001%40c.us' },
  { label: 'get chat picture', method: 'GET', enginePath: '/api/v1/dev/chats/15550001%40c.us/picture', expectedMessagingPath: '/api/dev/chats/15550001%40c.us/picture' },
  { label: 'get chat messages', method: 'GET', enginePath: '/api/v1/dev/chats/15550001%40c.us/messages?limit=50', expectedMessagingPath: '/api/dev/chats/15550001%40c.us/messages?limit=50' },
  { label: 'delete all chat messages', method: 'DELETE', enginePath: '/api/v1/dev/chats/15550001%40c.us/messages', expectedMessagingPath: '/api/dev/chats/15550001%40c.us/messages' },
  { label: 'mark chat messages read', method: 'POST', enginePath: '/api/v1/dev/chats/15550001%40c.us/messages/read', expectedMessagingPath: '/api/dev/chats/15550001%40c.us/messages/read' },
  { label: 'get message by id', method: 'GET', enginePath: '/api/v1/dev/chats/15550001%40c.us/messages/wamid-1', expectedMessagingPath: '/api/dev/chats/15550001%40c.us/messages/wamid-1' },
  { label: 'delete message by id', method: 'DELETE', enginePath: '/api/v1/dev/chats/15550001%40c.us/messages/wamid-1', expectedMessagingPath: '/api/dev/chats/15550001%40c.us/messages/wamid-1' },
  { label: 'edit message by id', method: 'PUT', enginePath: '/api/v1/dev/chats/15550001%40c.us/messages/wamid-1', expectedMessagingPath: '/api/dev/chats/15550001%40c.us/messages/wamid-1', body: { text: 'edited' } },
  { label: 'pin message', method: 'POST', enginePath: '/api/v1/dev/chats/15550001%40c.us/messages/wamid-1/pin', expectedMessagingPath: '/api/dev/chats/15550001%40c.us/messages/wamid-1/pin' },
  { label: 'unpin message', method: 'POST', enginePath: '/api/v1/dev/chats/15550001%40c.us/messages/wamid-1/unpin', expectedMessagingPath: '/api/dev/chats/15550001%40c.us/messages/wamid-1/unpin' },
  { label: 'archive chat', method: 'POST', enginePath: '/api/v1/dev/chats/15550001%40c.us/archive', expectedMessagingPath: '/api/dev/chats/15550001%40c.us/archive' },
  { label: 'unarchive chat', method: 'POST', enginePath: '/api/v1/dev/chats/15550001%40c.us/unarchive', expectedMessagingPath: '/api/dev/chats/15550001%40c.us/unarchive' },
  { label: 'unread chat', method: 'POST', enginePath: '/api/v1/dev/chats/15550001%40c.us/unread', expectedMessagingPath: '/api/dev/chats/15550001%40c.us/unread' }
];

describe('messaging fallback parity proxy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.MESSAGING_PROVIDER_BASE_URL;
    delete process.env.MESSAGING_PROVIDER_API_KEY;
  });

  it.each(CHATTTING_AND_CHATS_CASES)('forwards $label', async (testCase) => {
    process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      return new Response(JSON.stringify({ url, method: init?.method ?? 'GET' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const app = Fastify({ logger: false });
    await registerMessagingFallbackRoutes(app);

    try {
      const response = await app.inject({
        method: testCase.method,
        url: testCase.enginePath,
        ...(testCase.body ? { payload: testCase.body } : {})
      });

      expect(response.statusCode).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [actualUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      const actualParsedUrl = new URL(actualUrl);
      const expectedParsedUrl = new URL(`https://messaging.test${testCase.expectedMessagingPath}`);

      expect(decodeURIComponent(actualParsedUrl.pathname)).toBe(decodeURIComponent(expectedParsedUrl.pathname));
      expect(actualParsedUrl.search).toBe(expectedParsedUrl.search);
      expect(requestInit.method).toBe(testCase.method);

      const forwardedHeaders = requestInit.headers as Headers;
      expect(forwardedHeaders.get('X-Api-Key')).toBe('messaging-token');

      if (testCase.body) {
        expect(requestInit.body).toBe(JSON.stringify(testCase.body));
        expect(forwardedHeaders.get('Content-Type')).toBe('application/json');
      } else {
        expect(requestInit.body).toBeUndefined();
      }
    } finally {
      await app.close();
    }
  });

  it('passes through non-json response bodies', async () => {
    process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';

    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('plain-text-response', {
        status: 202,
        headers: { 'content-type': 'text/plain' }
      })
    ));

    const app = Fastify({ logger: false });
    await registerMessagingFallbackRoutes(app);

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/version'
      });

      expect(response.statusCode).toBe(202);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toBe('plain-text-response');
    } finally {
      await app.close();
    }
  });

  it('does not proxy admin-prefixed wildcard requests', async () => {
    process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const app = Fastify({ logger: false });
    await registerMessagingFallbackRoutes(app);

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/sessions'
      });

      expect(response.statusCode).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
