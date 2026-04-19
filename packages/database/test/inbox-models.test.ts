import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { ConversationModel, MessageModel } from '../src/index.js';
import {
  connectDatabaseTestDb,
  disconnectDatabaseTestDb,
  resetDatabaseTestDb
} from './helpers/mongo-memory.js';

describe('Team Inbox Models', () => {
  beforeAll(async () => {
    await connectDatabaseTestDb({ dbName: 'noxivo-database-inbox-model-tests' });
    await ConversationModel.init();
    await MessageModel.init();
  });

  afterEach(async () => {
    await resetDatabaseTestDb();
  });

  afterAll(async () => {
    await disconnectDatabaseTestDb();
  });

  it('should create a conversation and add messages', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();

    const conversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '123456@c.us',
      contactName: 'Test User',
      status: 'open'
    });

    expect(conversation.contactId).toBe('123456@c.us');

    const message = await MessageModel.create({
      conversationId: conversation._id,
      role: 'user',
      content: 'Hello World'
    });

    expect(message.content).toBe('Hello World');
    expect(message.conversationId.toString()).toBe(conversation._id.toString());
  });

  it('should enforce unique contactId per tenant', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();

    await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: 'dup@c.us'
    });

    await expect(ConversationModel.create({
      agencyId,
      tenantId,
      contactId: 'dup@c.us'
    })).rejects.toThrow();
  });

  it('stores delivery and attachment metadata on messages', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();

    const conversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: 'media@c.us'
    });

    const message = await MessageModel.create({
      conversationId: conversation._id,
      role: 'assistant',
      content: '',
      deliveryStatus: 'queued',
      providerMessageId: 'wamid-model-1',
      providerAck: 1,
      providerAckName: 'SERVER',
      replyToMessageId: 'wamid-parent-2',
      attachments: [
        {
          kind: 'document',
          url: 'https://cdn.example.com/file.pdf',
          mimeType: 'application/pdf',
          fileName: 'file.pdf',
          caption: 'Proposal',
          sizeBytes: 2048
        }
      ]
    });

    expect(message.deliveryStatus).toBe('queued');
    expect(message.providerMessageId).toBe('wamid-model-1');
    expect(message.providerAck).toBe(1);
    expect(message.providerAckName).toBe('SERVER');
    expect(message.replyToMessageId).toBe('wamid-parent-2');
    expect(message.attachments).toEqual([
      expect.objectContaining({
        kind: 'document',
        url: 'https://cdn.example.com/file.pdf',
        mimeType: 'application/pdf',
        fileName: 'file.pdf',
        caption: 'Proposal',
        sizeBytes: 2048
      })
    ]);
  });
});
