import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { ConversationModel, MessageModel, MessagingSessionBindingModel } from '@noxivo/database';
import { buildServer } from '../src/server.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('messages route', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-messages-route-tests' });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.ENGINE_API_KEY;
    delete process.env.MESSAGING_PROVIDER_BASE_URL;
    delete process.env.MESSAGING_PROVIDER_API_KEY;
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('falls back to direct MessagingProvider send when no active session binding exists', async () => {
    process.env.ENGINE_API_KEY = 'engine-key';
    process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';

    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/sessions?all=true')) {
        return new Response(JSON.stringify([
          {
            name: 'agency-session',
            config: {
              metadata: {
                agencyId,
                tenantId
              }
            }
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/api/sendText') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body).toEqual({
          session: 'agency-session',
          chatId: '84961566302@c.us',
          text: 'Hello from fallback'
        });

        return new Response(JSON.stringify({ id: 'wamid-fallback-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/messages/send',
        headers: {
          'x-api-key': 'engine-key'
        },
        payload: {
          to: '84961566302',
          text: 'Hello from fallback',
          agencyId,
          tenantId
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(
        expect.objectContaining({
          status: 'sent'
        })
      );

      const message = await MessageModel.findOne({ providerMessageId: 'wamid-fallback-1' }).lean().exec();
      expect(message).not.toBeNull();
      expect(message?.deliveryStatus).toBe('sent');
    } finally {
      await server.close();
    }
  });

  it('uses canonical phone-backed outbound target when an existing conversation maps the LID alias', async () => {
    process.env.ENGINE_API_KEY = 'engine-key';
    process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';

    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    const canonicalConversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550001111@c.us',
      contactName: 'Alice Smith',
      contactPhone: '+1 555-000-1111',
      status: 'open',
      unreadCount: 0,
      lastMessageAt: new Date(),
      metadata: {
        messagingCanonicalContactId: '15550001111@c.us',
        messagingAliases: ['15550001111@c.us', '15550001111@lid']
      }
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/sessions?all=true')) {
        return new Response(JSON.stringify([
          {
            name: 'agency-session',
            config: {
              metadata: {
                agencyId,
                tenantId
              }
            }
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/api/sendText') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body).toEqual({
          session: 'agency-session',
          chatId: '15550001111@c.us',
          text: 'Use canonical target'
        });

        return new Response(JSON.stringify({ id: 'wamid-canonical-fallback-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/messages/send',
        headers: {
          'x-api-key': 'engine-key'
        },
        payload: {
          to: '15550001111@lid',
          text: 'Use canonical target',
          agencyId,
          tenantId
        }
      });

      expect(response.statusCode).toBe(200);
      const message = await MessageModel.findOne({ providerMessageId: 'wamid-canonical-fallback-1' }).lean().exec();
      expect(message?.conversationId.toString()).toBe(canonicalConversation._id.toString());

      const conversations = await ConversationModel.find({ agencyId, tenantId }).lean().exec();
      expect(conversations).toHaveLength(1);
      expect(conversations[0]?.contactId).toBe('15550001111@c.us');
    } finally {
      await server.close();
    }
  });

  it('keeps outbound @lid target when prior alias/chatId-only records exist without canonical @c.us proof', async () => {
    process.env.ENGINE_API_KEY = 'engine-key';
    process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';

    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550002222@lid',
      contactName: 'Anonymous Numeric LID',
      status: 'open',
      unreadCount: 0,
      lastMessageAt: new Date(),
      metadata: {
        messagingChatId: '15550002222@lid',
        messagingAliases: ['15550002222@lid']
      }
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/sessions?all=true')) {
        return new Response(JSON.stringify([
          {
            name: 'agency-session',
            config: {
              metadata: {
                agencyId,
                tenantId
              }
            }
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/api/sendText') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body).toEqual({
          session: 'agency-session',
          chatId: '15550002222@lid',
          text: 'Anonymous lid outbound'
        });

        return new Response(JSON.stringify({ id: 'wamid-anon-lid-external-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/messages/send',
        headers: {
          'x-api-key': 'engine-key'
        },
        payload: {
          to: '15550002222@lid',
          text: 'Anonymous lid outbound',
          agencyId,
          tenantId
        }
      });

      expect(response.statusCode).toBe(200);
      const conversations = await ConversationModel.find({ agencyId, tenantId }).sort({ createdAt: 1 }).lean().exec();
      expect(conversations).toHaveLength(1);
      expect(conversations[0]?.contactId).toBe('15550002222@lid');
    } finally {
      await server.close();
    }
  });

  it('falls back to direct MessagingProvider send when the active binding points to a missing cluster row', async () => {
    process.env.ENGINE_API_KEY = 'engine-key';
    process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';

    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    await MessagingSessionBindingModel.create({
      agencyId,
      tenantId,
      clusterId: new mongoose.Types.ObjectId(),
      sessionName: 'recovered-session',
      messagingSessionName: 'recovered-session',
      routingMetadata: {},
      status: 'active'
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/sendText') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body).toEqual({
          session: 'recovered-session',
          chatId: '84961566302@c.us',
          text: 'Hello from missing cluster fallback'
        });

        return new Response(JSON.stringify({ id: 'wamid-fallback-cluster-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/messages/send',
        headers: {
          'x-api-key': 'engine-key'
        },
        payload: {
          to: '84961566302',
          text: 'Hello from missing cluster fallback',
          agencyId,
          tenantId
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(
        expect.objectContaining({
          status: 'sent'
        })
      );

      const message = await MessageModel.findOne({ providerMessageId: 'wamid-fallback-cluster-1' }).lean().exec();
      expect(message).not.toBeNull();
      expect(message?.deliveryStatus).toBe('sent');
    } finally {
      await server.close();
    }
  });
});
