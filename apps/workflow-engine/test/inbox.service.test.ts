import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { ContactProfileModel, ConversationModel, MessageDeliveryEventModel, MessageModel } from '@noxivo/database';
import { InboxService } from '../src/modules/inbox/inbox.service.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('InboxService contact profile projection', () => {
  const inboxService = new InboxService();

  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-inbox-service-tests' });
  });

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('projects persisted contact profile counters and timestamps from message writes', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    await inboxService.recordMessage({
      agencyId,
      tenantId,
      contactId: '15550001111',
      contactName: 'Alice Smith',
      contactPhone: '+1 555-000-1111',
      role: 'user',
      content: 'Hello'
    });

    await inboxService.recordMessage({
      agencyId,
      tenantId,
      contactId: '15550001111',
      contactName: 'Alice Smith',
      contactPhone: '+1 555-000-1111',
      role: 'assistant',
      content: 'Hi there'
    });

    const profile = await ContactProfileModel.findOne({ tenantId, contactId: '15550001111@c.us' }).lean();

    expect(profile).toBeTruthy();
    expect(profile?.contactName).toBe('Alice Smith');
    expect(profile?.contactPhone).toBe('+1 555-000-1111');
    expect(profile?.totalMessages).toBe(2);
    expect(profile?.inboundMessages).toBe(1);
    expect(profile?.outboundMessages).toBe(1);
    expect(profile?.firstSeenAt).toBeTruthy();
    expect(profile?.lastInboundAt).toBeTruthy();
    expect(profile?.lastOutboundAt).toBeTruthy();
  }, 60000);

  it('persists media attachments and delivery metadata for media-only assistant messages', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    const { conversation, message } = await inboxService.recordMessage({
      agencyId,
      tenantId,
      contactId: '15550002222',
      role: 'assistant',
      content: '',
      deliveryStatus: 'queued',
      providerMessageId: 'wamid-media-1',
      providerAck: 0,
      providerAckName: 'PENDING',
      replyToMessageId: 'wamid-parent-1',
      attachments: [
        {
          kind: 'image',
          url: 'https://cdn.example.com/image.jpg',
          mimeType: 'image/jpeg',
          fileName: 'image.jpg',
          caption: 'See this',
          sizeBytes: 1024
        }
      ]
    });

    const updatedConversation = await ConversationModel.findById(conversation._id).lean().exec();
    const persistedMessage = await MessageModel.findById(message._id).lean().exec();

    expect(updatedConversation?.lastMessageContent).toBe('[image]');
    expect(persistedMessage?.content).toBe('');
    expect(persistedMessage?.deliveryStatus).toBe('queued');
    expect(persistedMessage?.providerMessageId).toBe('wamid-media-1');
    expect(persistedMessage?.providerAck).toBe(0);
    expect(persistedMessage?.providerAckName).toBe('PENDING');
    expect(persistedMessage?.replyToMessageId).toBe('wamid-parent-1');
    expect(persistedMessage?.attachments).toEqual([
      expect.objectContaining({
        kind: 'image',
        url: 'https://cdn.example.com/image.jpg',
        mimeType: 'image/jpeg',
        fileName: 'image.jpg',
        caption: 'See this',
        sizeBytes: 1024
      })
    ]);

    const deliveryEvents = await MessageDeliveryEventModel.find({ messageId: message._id }).lean().exec();
    expect(deliveryEvents).toEqual([
      expect.objectContaining({
        deliveryStatus: 'queued',
        providerAck: 0,
        providerAckName: 'PENDING',
        source: 'message_create'
      })
    ]);
  }, 60000);

  it('rejects empty message payloads without content or attachments', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    await expect(inboxService.recordMessage({
      agencyId,
      tenantId,
      contactId: '15550003333',
      role: 'assistant',
      content: '',
      attachments: []
    })).rejects.toThrow('Inbox message requires content or attachments');
  }, 60000);

  it('reuses and normalizes an alias conversation onto the canonical @c.us identity', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    const legacyConversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550001111@lid',
      contactName: 'Legacy LID',
      status: 'open',
      unreadCount: 0,
      metadata: {
        messagingChatId: '15550001111@lid',
        messagingAliases: ['15550001111@lid']
      }
    });

    const result = await inboxService.recordMessage({
      agencyId,
      tenantId,
      contactId: '15550001111@c.us',
      canonicalContactId: '15550001111@c.us',
      rawContactId: '15550001111@lid',
      contactAliases: ['15550001111@lid', '15550001111@c.us'],
      contactName: 'Alice Smith',
      contactPhone: '15550001111',
      role: 'user',
      content: 'Hello from canonical identity'
    });

    const conversations = await ConversationModel.find({ tenantId }).lean().exec();
    const updatedConversation = await ConversationModel.findById(result.conversation._id).lean().exec();

    expect(conversations).toHaveLength(1);
    expect(String(updatedConversation?._id)).toBe(String(legacyConversation._id));
    expect(updatedConversation?.contactId).toBe('15550001111@c.us');
    expect(updatedConversation?.contactName).toBe('Alice Smith');
    expect(updatedConversation?.contactPhone).toBe('15550001111');
    expect(updatedConversation?.metadata).toEqual(expect.objectContaining({
      messagingCanonicalContactId: '15550001111@c.us',
      messagingChatId: '15550001111@lid',
      messagingAliases: expect.arrayContaining(['15550001111@lid', '15550001111@c.us'])
    }));
  }, 60000);

  it('does not falsely merge unresolved lid digits into an existing canonical @c.us conversation', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    const existingCanonical = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550006666@c.us',
      contactName: 'Canonical Contact',
      status: 'open',
      unreadCount: 0,
      metadata: {
        messagingCanonicalContactId: '15550006666@c.us',
        messagingAliases: ['15550006666@c.us']
      }
    });

    const unresolvedLidWrite = await inboxService.recordMessage({
      agencyId,
      tenantId,
      contactId: '15550006666@lid',
      canonicalContactId: '15550006666@lid',
      rawContactId: '15550006666@lid',
      contactAliases: ['15550006666@lid'],
      role: 'user',
      content: 'unresolved lid message'
    });

    const conversations = await ConversationModel.find({ agencyId, tenantId }).sort({ contactId: 1 }).lean().exec();
    const persistedCanonical = await ConversationModel.findById(existingCanonical._id).lean().exec();
    const unresolvedConversation = await ConversationModel.findById(unresolvedLidWrite.conversation._id).lean().exec();

    expect(conversations).toHaveLength(2);
    expect(String(unresolvedLidWrite.conversation._id)).not.toBe(String(existingCanonical._id));
    expect(persistedCanonical?.contactId).toBe('15550006666@c.us');
    expect(unresolvedConversation?.contactId).toBe('15550006666@lid');
    expect(unresolvedConversation?.metadata).toEqual(expect.objectContaining({
      messagingCanonicalContactId: '15550006666@lid',
      messagingAliases: expect.arrayContaining(['15550006666@lid'])
    }));
  }, 60000);

  it('converges lid-first inbound write and later sync canonical identity into one conversation', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    const firstInbound = await inboxService.recordMessage({
      agencyId,
      tenantId,
      contactId: '15550004444@lid',
      canonicalContactId: '15550004444@lid',
      rawContactId: '15550004444@lid',
      contactAliases: ['15550004444@lid'],
      contactName: 'Unresolved LID',
      role: 'user',
      content: 'first inbound lid message'
    });

    const syncConversation = await inboxService.upsertConversationIdentity({
      agencyId,
      tenantId,
      contactId: '15550004444@c.us',
      canonicalContactId: '15550004444@c.us',
      rawContactId: '15550004444@c.us',
      contactAliases: ['15550004444@c.us'],
      contactName: 'Resolved Canonical',
      contactPhone: '15550004444'
    });

    const secondInbound = await inboxService.recordMessage({
      agencyId,
      tenantId,
      contactId: '15550004444@c.us',
      canonicalContactId: '15550004444@c.us',
      rawContactId: '15550004444@c.us',
      contactAliases: ['15550004444@c.us'],
      contactName: 'Resolved Canonical',
      contactPhone: '15550004444',
      role: 'user',
      content: 'second inbound canonical message'
    });

    const conversations = await ConversationModel.find({ agencyId, tenantId }).lean().exec();
    const canonicalConversation = await ConversationModel.findById(syncConversation._id).lean().exec();

    expect(conversations).toHaveLength(1);
    expect(String(syncConversation._id)).toBe(String(firstInbound.conversation._id));
    expect(String(secondInbound.conversation._id)).toBe(String(firstInbound.conversation._id));
    expect(canonicalConversation?.contactId).toBe('15550004444@c.us');
    expect(canonicalConversation?.contactName).toBe('Resolved Canonical');
    expect(canonicalConversation?.contactPhone).toBe('15550004444');
    expect(canonicalConversation?.metadata).toEqual(expect.objectContaining({
      messagingCanonicalContactId: '15550004444@c.us',
      messagingAliases: expect.arrayContaining(['15550004444@lid', '15550004444@c.us'])
    }));
  }, 60000);
});
