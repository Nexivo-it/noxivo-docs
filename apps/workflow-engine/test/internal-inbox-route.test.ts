import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import {
  ContactProfileModel,
  ConversationModel,
  InternalInboxSendReservationModel,
  MessageDeliveryEventModel,
  MessageModel,
  MessagingClusterModel,
  MessagingSessionBindingModel
} from '@noxivo/database';
import { buildServer } from '../src/server.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('internal inbox route', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-internal-inbox-tests' });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  beforeEach(() => {
    process.env.WORKFLOW_ENGINE_INTERNAL_PSK = 'internal-psk';
    process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-api-key';
  });

  async function seedConversation() {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const clusterId = new mongoose.Types.ObjectId();
    const conversationId = new mongoose.Types.ObjectId();

    await MessagingClusterModel.create({
      _id: clusterId,
      name: 'Primary MessagingProvider Cluster',
      region: 'eu-west-1',
      baseUrl: 'http://messaging.test',
      dashboardUrl: 'http://messaging.test/dashboard',
      swaggerUrl: 'http://messaging.test/docs',
      capacity: 10,
      activeSessionCount: 1,
      status: 'active',
      secretRefs: { webhookSecretVersion: 'v1' }
    });

    await MessagingSessionBindingModel.create({
      agencyId,
      tenantId,
      clusterId,
      sessionName: 'tenant-main',
      messagingSessionName: 'tenant-main',
      routingMetadata: {},
      status: 'active'
    });

    await ConversationModel.create({
      _id: conversationId,
      agencyId,
      tenantId,
      contactId: '15550001111@c.us',
      contactName: 'Alice Smith',
      contactPhone: '+1 555-000-1111',
      status: 'assigned',
      lastMessageContent: 'Hello',
      lastMessageAt: new Date(),
      unreadCount: 0
    });

    return {
      agencyId: agencyId.toString(),
      tenantId: tenantId.toString(),
      conversationId: conversationId.toString()
    };
  }

  it('rejects sends without the internal PSK header', async () => {
    const { agencyId, tenantId, conversationId } = await seedConversation();
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/internal/inbox/conversations/${conversationId}/messages`,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'send-1'
        },
        payload: {
          agencyId,
          tenantId,
          operatorUserId: 'user-1',
          content: 'We are on it.'
        }
      });

      expect(response.statusCode).toBe(401);
    } finally {
      await server.close();
    }
  });

  it('rejects sends without an idempotency key', async () => {
    const { agencyId, tenantId, conversationId } = await seedConversation();
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/internal/inbox/conversations/${conversationId}/messages`,
        headers: {
          'content-type': 'application/json',
          'x-nexus-internal-psk': process.env.WORKFLOW_ENGINE_INTERNAL_PSK ?? ''
        },
        payload: {
          agencyId,
          tenantId,
          operatorUserId: 'user-1',
          content: 'We are on it.'
        }
      });

      expect(response.statusCode).toBe(400);
    } finally {
      await server.close();
    }
  });

  it('sends outbound operator messages through MessagingProvider and persists one assistant message', async () => {
    const { agencyId, tenantId, conversationId } = await seedConversation();
    process.env.MESSAGING_PROVIDER_PROXY_BASE_URL = 'https://api-workflow-engine.noxivo.app';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'wamid-123' }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/internal/inbox/conversations/${conversationId}/messages`,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'send-1',
          'x-nexus-internal-psk': process.env.WORKFLOW_ENGINE_INTERNAL_PSK ?? ''
        },
        payload: {
          agencyId,
          tenantId,
          operatorUserId: 'user-1',
          content: 'We are on it.'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const firstCall = fetchMock.mock.calls[0];
      expect(firstCall).toBeTruthy();
      if (!firstCall) {
        throw new Error('Expected MessagingProvider fetch call');
      }

      const [rawUrl, rawInit] = firstCall as unknown as [unknown, unknown];
      const url = String(rawUrl);
      const init = (rawInit ?? {}) as RequestInit;

      expect(url).toBe('http://messaging.test/api/sendText');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>)['X-Api-Key']).toBe('messaging-api-key');

      const body = JSON.parse(String(init?.body)) as {
        session: string;
        chatId: string;
        text: string;
      };

      expect(body).toEqual({
        session: 'tenant-main',
        chatId: '15550001111@c.us',
        text: 'We are on it.'
      });

      expect(await MessageModel.countDocuments({ conversationId })).toBe(1);
      const message = await MessageModel.findOne({ conversationId }).lean();
      const deliveryEvents = await MessageDeliveryEventModel.find({ conversationId }).lean().exec();
      expect(message?.deliveryStatus).toBe('sent');
      expect(deliveryEvents).toEqual([
        expect.objectContaining({
          deliveryStatus: 'sent',
          source: 'message_create'
        })
      ]);
      const profile = await ContactProfileModel.findOne({ tenantId, contactId: '15550001111@c.us' }).lean();
      expect(profile?.outboundMessages).toBe(1);
      expect(profile?.totalMessages).toBe(1);
    } finally {
      await server.close();
    }
  });

  it('acknowledges duplicate sends with the same idempotency key without persisting again', async () => {
    const { agencyId, tenantId, conversationId } = await seedConversation();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'wamid-123' }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const requestInit = {
        method: 'POST' as const,
        url: `/v1/internal/inbox/conversations/${conversationId}/messages`,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'send-dup-1',
          'x-nexus-internal-psk': process.env.WORKFLOW_ENGINE_INTERNAL_PSK ?? ''
        },
        payload: {
          agencyId,
          tenantId,
          operatorUserId: 'user-1',
          content: 'We are on it.'
        }
      };

      const first = await server.inject(requestInit);
      const second = await server.inject(requestInit);

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(await MessageModel.countDocuments({ conversationId })).toBe(1);

      const firstPayload = first.json() as { _id: string };
      const secondPayload = second.json() as { _id: string };
      expect(secondPayload._id).toBe(firstPayload._id);
    } finally {
      await server.close();
    }
  });

  it('keeps concurrent duplicate sends to a single MessagingProvider call', async () => {
    const { agencyId, tenantId, conversationId } = await seedConversation();
    let releaseFetch!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });

    const fetchMock = vi.fn(async () => {
      await fetchStarted;

      return new Response(JSON.stringify({ id: 'wamid-concurrent' }), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const requestInit = {
        method: 'POST' as const,
        url: `/v1/internal/inbox/conversations/${conversationId}/messages`,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'send-concurrent-1',
          'x-nexus-internal-psk': process.env.WORKFLOW_ENGINE_INTERNAL_PSK ?? ''
        },
        payload: {
          agencyId,
          tenantId,
          operatorUserId: 'user-1',
          content: 'We are on it.'
        }
      };

      const firstPromise = server.inject(requestInit);
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      const secondPromise = server.inject(requestInit);
      releaseFetch();

      const [first, second] = await Promise.all([firstPromise, secondPromise]);

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(await MessageModel.countDocuments({ conversationId })).toBe(1);
      expect(await InternalInboxSendReservationModel.countDocuments({ conversationId })).toBe(1);

      const firstPayload = first.json() as { _id: string };
      const secondPayload = second.json() as { _id: string };
      expect(secondPayload._id).toBe(firstPayload._id);
    } finally {
      await server.close();
    }
  });

  it('rejects reusing an idempotency key with a different payload', async () => {
    const { agencyId, tenantId, conversationId } = await seedConversation();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'wamid-123' }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const first = await server.inject({
        method: 'POST',
        url: `/v1/internal/inbox/conversations/${conversationId}/messages`,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'send-mismatch-1',
          'x-nexus-internal-psk': process.env.WORKFLOW_ENGINE_INTERNAL_PSK ?? ''
        },
        payload: {
          agencyId,
          tenantId,
          operatorUserId: 'user-1',
          content: 'First reply'
        }
      });

      const second = await server.inject({
        method: 'POST',
        url: `/v1/internal/inbox/conversations/${conversationId}/messages`,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'send-mismatch-1',
          'x-nexus-internal-psk': process.env.WORKFLOW_ENGINE_INTERNAL_PSK ?? ''
        },
        payload: {
          agencyId,
          tenantId,
          operatorUserId: 'user-1',
          content: 'Different reply'
        }
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(409);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      await server.close();
    }
  });

  it('sends image attachments through MessagingProvider and persists attachment metadata', async () => {
    const { agencyId, tenantId, conversationId } = await seedConversation();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'wamid-image-1' }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/internal/inbox/conversations/${conversationId}/messages`,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'send-image-1',
          'x-nexus-internal-psk': process.env.WORKFLOW_ENGINE_INTERNAL_PSK ?? ''
        },
        payload: {
          agencyId,
          tenantId,
          operatorUserId: 'user-1',
          content: 'Look at this',
          attachments: [
            {
              kind: 'image',
              url: 'https://cdn.example.com/photo.jpg',
              mimeType: 'image/jpeg',
              fileName: 'photo.jpg',
              caption: 'Original caption'
            }
          ]
        }
      });

      if (response.statusCode !== 200) {
        throw new Error(`Unexpected response ${response.statusCode}: ${response.body}`);
      }
      const firstCall = fetchMock.mock.calls[0];
      expect(firstCall).toBeTruthy();
      if (!firstCall) {
        throw new Error('Expected MessagingProvider fetch call');
      }

      const [rawUrl, rawInit] = firstCall as unknown as [unknown, unknown];
      const url = String(rawUrl);
      const init = (rawInit ?? {}) as RequestInit;
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;

      expect(url).toBe('http://messaging.test/api/sendImage');
      expect(body).toEqual({
        session: 'tenant-main',
        chatId: '15550001111@c.us',
        file: {
          mimetype: 'image/jpeg',
          filename: 'photo.jpg',
          url: 'https://cdn.example.com/photo.jpg'
        },
        caption: 'Look at this'
      });

      const message = await MessageModel.findOne({ conversationId }).lean();
      expect(message?.attachments).toEqual([
        expect.objectContaining({
          kind: 'image',
          url: 'https://cdn.example.com/photo.jpg',
          mimeType: 'image/jpeg',
          fileName: 'photo.jpg',
          caption: 'Original caption'
        })
      ]);
      expect(message?.deliveryStatus).toBe('sent');
    } finally {
      await server.close();
    }
  });

  it.each([
    {
      label: 'document',
      payload: {
        content: 'Please review',
        attachments: [
          {
            kind: 'document',
            url: 'https://cdn.example.com/proposal.pdf',
            mimeType: 'application/pdf',
            fileName: 'proposal.pdf',
            caption: 'Proposal'
          }
        ]
      },
      expectedUrl: 'http://messaging.test/api/sendFile',
      expectedBody: {
        session: 'tenant-main',
        chatId: '15550001111@c.us',
        file: {
          mimetype: 'application/pdf',
          filename: 'proposal.pdf',
          url: 'https://cdn.example.com/proposal.pdf'
        },
        caption: 'Please review'
      }
    },
    {
      label: 'voice',
      payload: {
        attachments: [
          {
            kind: 'audio',
            url: 'https://cdn.example.com/voice.ogg',
            mimeType: 'audio/ogg; codecs=opus',
            fileName: 'voice.ogg',
            convert: true
          }
        ]
      },
      expectedUrl: 'http://messaging.test/api/sendVoice',
      expectedBody: {
        session: 'tenant-main',
        chatId: '15550001111@c.us',
        file: {
          mimetype: 'audio/ogg; codecs=opus',
          filename: 'voice.ogg',
          url: 'https://cdn.example.com/voice.ogg'
        },
        convert: true
      }
    },
    {
      label: 'video',
      payload: {
        content: 'Watch this',
        attachments: [
          {
            kind: 'video',
            url: 'https://cdn.example.com/demo.mp4',
            mimeType: 'video/mp4',
            fileName: 'demo.mp4',
            asNote: false,
            convert: false
          }
        ]
      },
      expectedUrl: 'http://messaging.test/api/sendVideo',
      expectedBody: {
        session: 'tenant-main',
        chatId: '15550001111@c.us',
        file: {
          mimetype: 'video/mp4',
          filename: 'demo.mp4',
          url: 'https://cdn.example.com/demo.mp4'
        },
        convert: false,
        asNote: false,
        caption: 'Watch this'
      }
    }
  ])('maps $label attachments to the correct MessagingProvider endpoint', async ({ payload, expectedUrl, expectedBody }) => {
    const { agencyId, tenantId, conversationId } = await seedConversation();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: `wamid-${expectedUrl.split('/').pop()}` }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/internal/inbox/conversations/${conversationId}/messages`,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `send-${expectedUrl.split('/').pop()}-1`,
          'x-nexus-internal-psk': process.env.WORKFLOW_ENGINE_INTERNAL_PSK ?? ''
        },
        payload: {
          agencyId,
          tenantId,
          operatorUserId: 'user-1',
          ...payload
        }
      });

      expect(response.statusCode).toBe(200);
      const firstCall = fetchMock.mock.calls[0];
      expect(firstCall).toBeTruthy();
      if (!firstCall) {
        throw new Error('Expected MessagingProvider fetch call');
      }

      const [rawUrl, rawInit] = firstCall as unknown as [unknown, unknown];
      const url = String(rawUrl);
      const init = (rawInit ?? {}) as RequestInit;
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;

      expect(url).toBe(expectedUrl);
      expect(body).toEqual(expectedBody);
    } finally {
      await server.close();
    }
  });
});
