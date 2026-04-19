import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MessagingSessionBindingModel } from '@noxivo/database';
import { buildServer } from '../src/server.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('status route', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-status-route-tests' });
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

  it('fetches stories from the status broadcast chat endpoint', async () => {
    process.env.ENGINE_API_KEY = 'engine-key';
    process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';

    const binding = await MessagingSessionBindingModel.create({
      agencyId: new mongoose.Types.ObjectId(),
      tenantId: new mongoose.Types.ObjectId(),
      clusterId: new mongoose.Types.ObjectId(),
      sessionName: 'status-session',
      messagingSessionName: 'status-session',
      status: 'active'
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/status-session/chats/status%40broadcast/messages?')) {
        return new Response(JSON.stringify([{ id: 'story-1' }]), {
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
        method: 'GET',
        url: `/api/v1/sessions/${binding._id.toString()}/status/stories`,
        headers: {
          'x-api-key': 'engine-key'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([{ id: 'story-1' }]);
    } finally {
      await server.close();
    }
  });

  it('sends text status via MessagingProvider status endpoint with defaults', async () => {
    process.env.ENGINE_API_KEY = 'engine-key';
    process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';

    const binding = await MessagingSessionBindingModel.create({
      agencyId: new mongoose.Types.ObjectId(),
      tenantId: new mongoose.Types.ObjectId(),
      clusterId: new mongoose.Types.ObjectId(),
      sessionName: 'status-session',
      messagingSessionName: 'status-session',
      status: 'active'
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/status-session/status/text') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body).toEqual({
          text: 'Hello story',
          backgroundColor: '#38b42f',
          font: 0,
          linkPreview: true,
          linkPreviewHighQuality: false
        });

        return new Response(JSON.stringify({ id: 'story-msg-1' }), {
          status: 201,
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
        url: `/api/v1/sessions/${binding._id.toString()}/status/text`,
        headers: {
          'x-api-key': 'engine-key'
        },
        payload: {
          text: 'Hello story'
        }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ id: 'story-msg-1' });
    } finally {
      await server.close();
    }
  });
});
