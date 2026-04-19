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

    const profile = await ContactProfileModel.findOne({ tenantId, contactId: '15550001111' }).lean();

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
});
