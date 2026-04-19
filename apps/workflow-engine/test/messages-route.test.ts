import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MessageModel, MessagingSessionBindingModel } from '@noxivo/database';
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
