import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { ConversationModel, MessageModel, MessagingClusterModel, MessagingSessionBindingModel } from '@noxivo/database';
import { connectWorkflowEngineTestDb, disconnectWorkflowEngineTestDb, resetWorkflowEngineTestDb } from './helpers/mongo-memory.js';
import { MessagingInboxSyncService } from '../src/modules/inbox/messaging-sync.service.js';
import { InboxEventsPublisher } from '../src/modules/inbox/inbox-events.publisher.js';

describe('messaging inbox sync service', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-messaging-inbox-sync-tests' });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN;
    delete process.env.MESSAGING_PROVIDER_API_KEY;
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  async function seedBinding() {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const clusterId = new mongoose.Types.ObjectId();

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

    return {
      agencyId: agencyId.toString(),
      tenantId: tenantId.toString()
    };
  }

  it('syncs recent MessagingProvider chats into conversation summaries', async () => {
    const { agencyId, tenantId } = await seedBinding();
    process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'messaging-token';

    const fetchMock = vi.fn(async () => new Response(JSON.stringify([
      {
        id: '15550001111@c.us',
        name: 'Alice Smith',
        lastMessage: { body: 'Hello from MessagingProvider', timestamp: 1710000000, fromMe: false },
        _chat: { unreadCount: 3 }
      }
    ]), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new MessagingInboxSyncService();
    const result = await service.syncRecentChats({ agencyId, tenantId, limit: 20 });

    const conversation = await ConversationModel.findOne({ agencyId, tenantId, contactId: '15550001111@c.us' }).lean().exec();

    expect(result).toEqual({ syncedConversations: 1, syncedMessages: 0, sessionName: 'tenant-main' });
    expect(conversation?.contactName).toBe('Alice Smith');
    expect(conversation?.contactPhone).toBe('15550001111');
    expect(conversation?.lastMessageContent).toBe('Hello from MessagingProvider');
    expect(conversation?.unreadCount).toBe(3);
  });

  it('canonicalizes @lid recent chats onto a single @c.us conversation', async () => {
    const { agencyId, tenantId } = await seedBinding();
    process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'messaging-token';

    const legacyConversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550001111@lid',
      contactName: 'Unknown',
      status: 'open',
      unreadCount: 0,
      metadata: {
        messagingChatId: '15550001111@lid',
        messagingAliases: ['15550001111@lid']
      }
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/chats/overview?')) {
        return new Response(JSON.stringify([
          {
            id: '15550001111@lid',
            name: 'Alice Smith',
            lastMessage: { body: 'Hello from lid', timestamp: 1710000000, fromMe: false },
            _chat: { unreadCount: 2 }
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/api/tenant-main/contacts/15550001111%40lid')) {
        return new Response(JSON.stringify({
          id: '15550001111@lid',
          number: '15550001111',
          name: 'Alice Smith'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/api/tenant-main/lids/15550001111')) {
        return new Response(JSON.stringify({
          lid: '15550001111@lid',
          pn: '15550001111@c.us'
        }), {
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

    const service = new MessagingInboxSyncService();
    const result = await service.syncRecentChats({ agencyId, tenantId, limit: 20 });

    const conversations = await ConversationModel.find({ tenantId }).lean().exec();
    expect(result).toEqual({ syncedConversations: 1, syncedMessages: 0, sessionName: 'tenant-main' });
    expect(conversations).toHaveLength(1);
    expect(conversations[0]?._id.toString()).toBe(legacyConversation._id.toString());
    expect(conversations[0]?.contactId).toBe('15550001111@c.us');
    expect(conversations[0]?.contactName).toBe('Alice Smith');
    expect(conversations[0]?.contactPhone).toBe('15550001111');
    expect(conversations[0]?.metadata).toEqual(expect.objectContaining({
      messagingCanonicalContactId: '15550001111@c.us',
      messagingChatId: '15550001111@lid',
      messagingAliases: expect.arrayContaining(['15550001111@lid', '15550001111@c.us'])
    }));
  });

  it('syncs MessagingProvider chat messages into inbox messages without duplicating provider ids', async () => {
    const { agencyId, tenantId } = await seedBinding();
    process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'messaging-token';
    process.env.MESSAGING_PROVIDER_PROXY_BASE_URL = 'https://api-workflow-engine.noxivo.app';

    const conversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550001111@c.us',
      contactName: 'Alice Smith',
      contactPhone: '15550001111',
      status: 'open',
      unreadCount: 0
    });

    const fetchMock = vi.fn(async () => new Response(JSON.stringify([
      {
        id: 'wamid-sync-1',
        from: '15550001111@c.us',
        to: '15550002222@c.us',
        fromMe: false,
        body: 'See image',
        ack: 0,
        ackName: 'PENDING',
        hasMedia: true,
        media: {
          url: 'https://messaging.local/files/photo.jpg',
          mimetype: 'image/jpeg',
          filename: 'photo.jpg'
        },
        replyTo: {
          id: 'quoted-sync-1',
          participant: '15550009999@c.us',
          body: 'Quoted source',
          media: {
            url: 'https://messaging.local/files/quoted.mp4',
            mimetype: 'video/mp4',
            filename: 'quoted.mp4'
          }
        },
        source: 'mobile'
      },
      {
        id: 'wamid-sync-2',
        from: '15550002222@c.us',
        to: '15550001111@c.us',
        fromMe: true,
        body: 'Sent from phone',
        ack: 1,
        ackName: 'SERVER',
        source: 'mobile'
      }
    ]), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new MessagingInboxSyncService();
    const firstResult = await service.syncConversationMessages({
      agencyId,
      tenantId,
      conversationId: conversation._id.toString(),
      limit: 50
    });
    const secondResult = await service.syncConversationMessages({
      agencyId,
      tenantId,
      conversationId: conversation._id.toString(),
      limit: 50
    });

    const messages = await MessageModel.find({ conversationId: conversation._id }).sort({ providerMessageId: 1 }).lean().exec();

    expect(firstResult.syncedMessages).toBe(2);
    expect(secondResult.syncedMessages).toBe(0);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('http://messaging.test/api/tenant-main/chats/15550001111%40c.us/messages')
      )
    ).toBe(true);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.attachments).toEqual([
      expect.objectContaining({
        kind: 'image',
        url: 'https://messaging.local/files/photo.jpg',
        mimeType: 'image/jpeg',
        fileName: 'photo.jpg'
      })
    ]);
    expect(messages[0]?.replyToMessageId).toBe('quoted-sync-1');
    expect(messages[0]?.metadata).toEqual(expect.objectContaining({
      source: 'mobile',
      syncedFrom: 'messaging-sync',
      quotedMessage: expect.objectContaining({
        messageId: 'quoted-sync-1',
        participant: '15550009999@c.us',
        body: 'Quoted source',
        media: expect.objectContaining({
          kind: 'video',
          url: 'https://messaging.local/files/quoted.mp4',
          mimeType: 'video/mp4',
          fileName: 'quoted.mp4'
        })
      })
    }));
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[1]?.metadata).toEqual(expect.objectContaining({ source: 'mobile', syncedFrom: 'messaging-sync' }));
  });

  it('publishes a realtime inbox event when sync inserts a new message', async () => {
    const { agencyId, tenantId } = await seedBinding();
    process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'messaging-token';

    const conversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550001111@c.us',
      contactName: 'Alice Smith',
      contactPhone: '15550001111',
      status: 'open',
      unreadCount: 0
    });

    const publishMessageCreatedSpy = vi.spyOn(InboxEventsPublisher.prototype, 'publishMessageCreated').mockResolvedValue(undefined);

    const fetchMock = vi.fn(async () => new Response(JSON.stringify([
      {
        id: 'wamid-sync-event-1',
        from: '15550001111@c.us',
        to: '15550002222@c.us',
        fromMe: false,
        body: 'Realtime from sync',
        messageTimestamp: 1710000000,
        ack: 2,
        ackName: 'DEVICE',
        hasMedia: false
      }
    ]), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new MessagingInboxSyncService();
    const result = await service.syncConversationMessages({
      agencyId,
      tenantId,
      conversationId: conversation._id.toString(),
      limit: 50
    });

    expect(result.syncedMessages).toBe(1);
    expect(publishMessageCreatedSpy).toHaveBeenCalledWith(tenantId, conversation._id.toString());
  });

  it('publishes a delivery update event when sync refreshes an existing message state', async () => {
    const { agencyId, tenantId } = await seedBinding();
    process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'messaging-token';

    const conversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550001111@c.us',
      contactName: 'Alice Smith',
      contactPhone: '15550001111',
      status: 'open',
      unreadCount: 0
    });

    await MessageModel.create({
      conversationId: conversation._id,
      role: 'assistant',
      content: 'Existing message',
      messagingMessageId: 'wamid-sync-existing-1',
      providerMessageId: 'wamid-sync-existing-1',
      deliveryStatus: 'sent'
    });

    const publishDeliveryUpdatedSpy = vi.spyOn(InboxEventsPublisher.prototype, 'publishDeliveryUpdated').mockResolvedValue(undefined);

    const fetchMock = vi.fn(async () => new Response(JSON.stringify([
      {
        id: 'wamid-sync-existing-1',
        from: '15550002222@c.us',
        to: '15550001111@c.us',
        fromMe: true,
        body: 'Existing message',
        messageTimestamp: 1710000001,
        ack: 3,
        ackName: 'READ',
        hasMedia: false
      }
    ]), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new MessagingInboxSyncService();
    const result = await service.syncConversationMessages({
      agencyId,
      tenantId,
      conversationId: conversation._id.toString(),
      limit: 50
    });

    expect(result.syncedMessages).toBe(0);
    expect(publishDeliveryUpdatedSpy).toHaveBeenCalledWith(tenantId, conversation._id.toString());
  });

  it('serializes concurrent sync runs for the same conversation to avoid duplicate inserts', async () => {
    const { agencyId, tenantId } = await seedBinding();
    process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'messaging-token';

    const conversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550001111@c.us',
      contactName: 'Alice Smith',
      contactPhone: '15550001111',
      status: 'open',
      unreadCount: 0
    });

    const fetchMock = vi.fn(async () => new Response(JSON.stringify([
      {
        id: 'wamid-race-1',
        from: '15550001111@c.us',
        to: '15550002222@c.us',
        fromMe: false,
        body: 'Race test',
        messageTimestamp: 1710000000,
        ack: 0,
        ackName: 'PENDING',
        hasMedia: false
      }
    ]), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new MessagingInboxSyncService();
    const [first, second] = await Promise.all([
      service.syncConversationMessages({
        agencyId,
        tenantId,
        conversationId: conversation._id.toString(),
        limit: 50
      }),
      service.syncConversationMessages({
        agencyId,
        tenantId,
        conversationId: conversation._id.toString(),
        limit: 50
      })
    ]);

    const messages = await MessageModel.find({
      conversationId: conversation._id,
      providerMessageId: 'wamid-race-1'
    }).lean().exec();

    expect(messages).toHaveLength(1);
    expect([first.syncedMessages, second.syncedMessages].sort()).toEqual([0, 1]);
  });

  it('recovers conversation history from resolved @c.us chat when @lid chat history fails', async () => {
    const { agencyId, tenantId } = await seedBinding();
    process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'messaging-token';

    const conversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550001111@lid',
      contactName: 'Alice Smith',
      contactPhone: '15550001111',
      status: 'open',
      unreadCount: 0,
      metadata: { messagingChatId: '15550001111@lid' }
    });

    const fetchMock = vi.fn(async (input: unknown) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/chats/15550001111%40lid/messages')) {
        return new Response(JSON.stringify({ error: 'chat unavailable' }), { status: 500 });
      }

      if (url.includes('/contacts/15550001111%40lid')) {
        return new Response(JSON.stringify({
          id: '15550001111@c.us',
          number: '15550001111'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('/chats/15550001111%40c.us/messages')) {
        return new Response(JSON.stringify([
          {
            id: 'wamid-recovered-1',
            from: '15550001111@c.us',
            to: '15550002222@c.us',
            fromMe: false,
            body: 'Recovered old message',
            messageTimestamp: 1710000000,
            ack: 2,
            ackName: 'DEVICE',
            hasMedia: false
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const service = new MessagingInboxSyncService();
    const result = await service.syncConversationMessages({
      agencyId,
      tenantId,
      conversationId: conversation._id.toString(),
      limit: 50,
      pages: 2
    });

    const messages = await MessageModel.find({ conversationId: conversation._id }).lean().exec();

    expect(result.syncedMessages).toBe(1);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('Recovered old message');
    expect(messages[0]?.metadata).toEqual(expect.objectContaining({
      syncedFrom: 'messaging-sync',
      syncedFromChatId: '15550001111@c.us'
    }));
  });

  it('falls back to chat overview lastMessage when MessagingProvider message history endpoints fail', async () => {
    const { agencyId, tenantId } = await seedBinding();
    process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'messaging-token';

    const conversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550001111@c.us',
      contactName: 'Alice Smith',
      contactPhone: '15550001111',
      status: 'open',
      unreadCount: 0
    });

    const fetchMock = vi.fn(async (input: unknown) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/chats/15550001111%40c.us/messages')) {
        return new Response(JSON.stringify({ error: 'chat loading failed' }), { status: 500 });
      }

      if (url.includes('/api/messages?')) {
        return new Response(JSON.stringify({ error: 'legacy chat loading failed' }), { status: 500 });
      }

      if (url.includes('/chats/overview')) {
        return new Response(JSON.stringify([
          {
            id: '15550001111@c.us',
            name: 'Alice Smith',
            lastMessage: {
              id: 'wamid-overview-1',
              body: 'Overview fallback message',
              timestamp: 1711111111,
              fromMe: false,
              source: 'app'
            },
            _chat: { unreadCount: 4 }
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new MessagingInboxSyncService();
    const result = await service.syncConversationMessages({
      agencyId,
      tenantId,
      conversationId: conversation._id.toString(),
      limit: 50,
      pages: 2
    });

    const messages = await MessageModel.find({ conversationId: conversation._id }).lean().exec();
    const refreshedConversation = await ConversationModel.findById(conversation._id).lean().exec();

    expect(result.syncedMessages).toBe(1);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('Overview fallback message');
    expect(messages[0]?.providerMessageId).toBe('wamid-overview-1');
    expect(messages[0]?.metadata).toEqual(expect.objectContaining({
      syncedFrom: 'messaging-sync-overview-fallback',
      syncedFromChatId: '15550001111@c.us'
    }));
    expect(refreshedConversation?.unreadCount).toBe(4);
    expect(refreshedConversation?.lastMessageContent).toBe('Overview fallback message');
  });

  it('canonicalizes mapped-LID to @c.us when trustworthy phone mapping exists', async () => {
    const { agencyId, tenantId } = await seedBinding();
    process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'messaging-token';

    // Seed existing @lid conversation
    const legacyConversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550009999@lid',
      contactName: 'Unknown Caller',
      status: 'open',
      unreadCount: 1,
      metadata: {
        messagingChatId: '15550009999@lid',
        messagingAliases: ['15550009999@lid']
      }
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      // Chat overview returns the @lid chat
      if (url.includes('/chats/overview')) {
        return new Response(JSON.stringify([
          {
            id: '15550009999@lid',
            name: 'Known Contact',
            lastMessage: { body: 'Hello from mapped LID', timestamp: 1710000000, fromMe: false },
            _chat: { unreadCount: 1 }
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      // Contact endpoint returns a @c.us ID with a phone number - this is a trustworthy mapping
      if (url.endsWith('/api/tenant-main/contacts/15550009999%40lid')) {
        return new Response(JSON.stringify({
          id: '15550009999@c.us',
          number: '15550009999',
          name: 'Known Contact'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      // LID endpoint confirms mapping to phone number - this makes it trustworthy
      if (url.endsWith('/api/tenant-main/lids/15550009999')) {
        return new Response(JSON.stringify({
          lid: '15550009999@lid',
          pn: '15550009999@c.us'
        }), {
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

    const service = new MessagingInboxSyncService();
    const result = await service.syncRecentChats({ agencyId, tenantId, limit: 20 });

    const conversations = await ConversationModel.find({ tenantId }).lean().exec();
    expect(result).toEqual({ syncedConversations: 1, syncedMessages: 0, sessionName: 'tenant-main' });
    expect(conversations).toHaveLength(1);
    // When mapping exists and is trustworthy, @lid should canonicalize to @c.us
    expect(conversations[0]?.contactId).toBe('15550009999@c.us');
    expect(conversations[0]?.contactName).toBe('Known Contact');
    expect(conversations[0]?.metadata).toEqual(expect.objectContaining({
      messagingCanonicalContactId: '15550009999@c.us',
      messagingChatId: '15550009999@lid',
      messagingAliases: expect.arrayContaining(['15550009999@lid', '15550009999@c.us'])
    }));
  });

  it('canonicalizes LID to @c.us using only lids/{lid} phone mapping when contacts lookup has no number', async () => {
    const { agencyId, tenantId } = await seedBinding();
    process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'messaging-token';

    const legacyConversation = await ConversationModel.create({
      agencyId,
      tenantId,
        contactId: 'anonliduser@lid',
      contactName: 'Unknown',
      status: 'open',
      unreadCount: 0,
      metadata: {
          messagingChatId: 'anonliduser@lid',
          messagingAliases: ['anonliduser@lid']
      }
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/chats/overview')) {
        return new Response(JSON.stringify([
          {
            id: 'anonliduser@lid',
            name: 'LID Contact',
            lastMessage: { body: 'Hello', timestamp: 1710000000, fromMe: false },
            _chat: { unreadCount: 0 }
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/api/tenant-main/contacts/anonliduser%40lid')) {
        return new Response(JSON.stringify({
          id: 'anonliduser@lid',
          name: 'LID Contact'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/api/tenant-main/lids/anonliduser')) {
        return new Response(JSON.stringify({
          lid: 'anonliduser@lid',
          pn: '15550007777@c.us'
        }), {
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

    const service = new MessagingInboxSyncService();
    const result = await service.syncRecentChats({ agencyId, tenantId, limit: 20 });

    const conversations = await ConversationModel.find({ tenantId }).lean().exec();
    expect(result).toEqual({ syncedConversations: 1, syncedMessages: 0, sessionName: 'tenant-main' });
    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.contactId).toBe('15550007777@c.us');
    expect(conversations[0]?.contactPhone).toBe('15550007777');
    expect(conversations[0]?.metadata).toEqual(expect.objectContaining({
      messagingCanonicalContactId: '15550007777@c.us',
      messagingChatId: 'anonliduser@lid'
    }));
  });

  it('preserves anonymous-LID as @lid when no trustworthy mapping exists', async () => {
    const { agencyId, tenantId } = await seedBinding();
    process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'messaging-token';

    // Seed existing @lid conversation
    const legacyConversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550008888@lid',
      contactName: 'Unknown',
      status: 'open',
      unreadCount: 0,
      metadata: {
        messagingChatId: '15550008888@lid',
        messagingAliases: ['15550008888@lid']
      }
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      // Chat overview returns @lid chat
      if (url.includes('/chats/overview')) {
        return new Response(JSON.stringify([
          {
            id: '15550008888@lid',
            name: 'Anonymous Caller',
            lastMessage: { body: 'Hello anonymous', timestamp: 1710000000, fromMe: false },
            _chat: { unreadCount: 0 }
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      // Contact endpoint either 404s or returns no phone mapping
      if (url.endsWith('/api/tenant-main/contacts/15550008888%40lid')) {
        return new Response(JSON.stringify({
          id: '15550008888@lid',
          name: 'Anonymous Caller'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      // LID endpoint returns no pn field - no trustworthy mapping exists
      if (url.endsWith('/api/tenant-main/lids/15550008888')) {
        return new Response(JSON.stringify({
          lid: '15550008888@lid'
        }), {
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

    const service = new MessagingInboxSyncService();
    const result = await service.syncRecentChats({ agencyId, tenantId, limit: 20 });

    const conversations = await ConversationModel.find({ tenantId }).lean().exec();
    expect(result).toEqual({ syncedConversations: 1, syncedMessages: 0, sessionName: 'tenant-main' });
    expect(conversations).toHaveLength(1);
    // When no trustworthy mapping exists, @lid should stay @lid
    expect(conversations[0]?.contactId).toBe('15550008888@lid');
    expect(conversations[0]?.contactPhone ?? null).toBeNull();
    expect(conversations[0]?.metadata).toEqual(expect.objectContaining({
      messagingCanonicalContactId: '15550008888@lid',
      messagingChatId: '15550008888@lid'
    }));
  });
});
