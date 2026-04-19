import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import {
  ContactProfileModel,
  ConversationModel,
  MessageDeliveryEventModel,
  MessageModel
} from '@noxivo/database';
import { DeliveryLifecycleService } from '../src/modules/inbox/delivery-lifecycle.service.js';
import { DeliveryRetryWorker } from '../src/modules/inbox/delivery-retry.worker.js';
import { InboxService } from '../src/modules/inbox/inbox.service.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('delivery lifecycle', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-delivery-lifecycle-tests' });
    await Promise.all([
      ContactProfileModel.init(),
      ConversationModel.init(),
      MessageModel.init(),
      MessageDeliveryEventModel.init()
    ]);
  });

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('appends delivery history as a message moves from queued to sent to delivered to read to failed', async () => {
    const inboxService = new InboxService();
    const deliveryLifecycleService = new DeliveryLifecycleService();
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    const { conversation, message } = await inboxService.recordMessage({
      agencyId,
      tenantId,
      contactId: '15550001111@c.us',
      role: 'assistant',
      content: 'Queued outbound message',
      providerMessageId: 'wamid-lifecycle-1',
      providerAck: 0,
      providerAckName: 'PENDING',
      deliveryStatus: 'queued',
      deliveryEventSource: 'message_create'
    });

    await deliveryLifecycleService.syncMessageState({
      agencyId,
      tenantId,
      conversationId: String(conversation._id),
      messageId: String(message._id),
      providerMessageId: 'wamid-lifecycle-1',
      deliveryStatus: 'sent',
      providerAck: 1,
      providerAckName: 'SERVER_ACK',
      source: 'webhook_ack'
    });
    await deliveryLifecycleService.syncMessageState({
      agencyId,
      tenantId,
      conversationId: String(conversation._id),
      messageId: String(message._id),
      providerMessageId: 'wamid-lifecycle-1',
      deliveryStatus: 'delivered',
      providerAck: 2,
      providerAckName: 'DELIVERED',
      source: 'webhook_ack'
    });
    await deliveryLifecycleService.syncMessageState({
      agencyId,
      tenantId,
      conversationId: String(conversation._id),
      messageId: String(message._id),
      providerMessageId: 'wamid-lifecycle-1',
      deliveryStatus: 'read',
      providerAck: 3,
      providerAckName: 'READ',
      source: 'webhook_ack'
    });
    await deliveryLifecycleService.syncMessageState({
      agencyId,
      tenantId,
      conversationId: String(conversation._id),
      messageId: String(message._id),
      providerMessageId: 'wamid-lifecycle-1',
      deliveryStatus: 'failed',
      providerAck: -1,
      providerAckName: 'FAILED',
      error: 'Provider rejected the message',
      source: 'retry_worker'
    });

    const [updatedMessage, events] = await Promise.all([
      MessageModel.findById(message._id).lean().exec(),
      MessageDeliveryEventModel.find({ messageId: message._id }).sort({ occurredAt: 1, createdAt: 1 }).lean().exec()
    ]);

    expect(updatedMessage).toMatchObject({
      deliveryStatus: 'failed',
      providerAck: -1,
      providerAckName: 'FAILED',
      error: 'Provider rejected the message'
    });
    expect(events.map((event) => event.deliveryStatus)).toEqual([
      'queued',
      'sent',
      'delivered',
      'read',
      'failed'
    ]);
  });

  it('queues retry attempts and tracks retry counters before exhausting them', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();
    const conversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550002222@c.us',
      status: 'open',
      unreadCount: 0
    });
    const message = await MessageModel.create({
      conversationId: conversation._id,
      role: 'assistant',
      content: 'Retry me',
      providerMessageId: 'wamid-retry-1',
      deliveryStatus: 'failed',
      error: 'Temporary provider outage',
      metadata: { retryCount: 0 }
    });

    const worker = new DeliveryRetryWorker();
    const result = await worker.processJob({
      agencyId,
      tenantId,
      conversationId: conversation._id.toString(),
      messageId: message._id.toString(),
      maxRetries: 3,
      reason: 'Temporary provider outage'
    });

    const [updatedMessage, lastEvent] = await Promise.all([
      MessageModel.findById(message._id).lean().exec(),
      MessageDeliveryEventModel.findOne({ messageId: message._id }).sort({ occurredAt: -1, createdAt: -1 }).lean().exec()
    ]);

    expect(result).toEqual({ status: 'queued', retryCount: 1 });
    expect(updatedMessage?.metadata).toMatchObject({ retryCount: 1, lastRetryReason: 'Temporary provider outage' });
    expect(updatedMessage?.deliveryStatus).toBe('queued');
    expect(updatedMessage?.providerAck).toBe(0);
    expect(lastEvent).toMatchObject({
      deliveryStatus: 'queued',
      providerAck: 0,
      providerAckName: 'RETRY_QUEUED',
      source: 'retry_worker'
    });
  });

  it('marks retries as exhausted once the max retry count is reached', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();
    const conversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550003333@c.us',
      status: 'open',
      unreadCount: 0
    });
    const message = await MessageModel.create({
      conversationId: conversation._id,
      role: 'assistant',
      content: 'Exhaust me',
      providerMessageId: 'wamid-retry-2',
      deliveryStatus: 'failed',
      error: 'Retry failed',
      metadata: { retryCount: 2 }
    });

    const worker = new DeliveryRetryWorker();
    const result = await worker.processJob({
      agencyId,
      tenantId,
      conversationId: conversation._id.toString(),
      messageId: message._id.toString(),
      maxRetries: 2,
      reason: 'Retry failed'
    });

    const [updatedMessage, lastEvent] = await Promise.all([
      MessageModel.findById(message._id).lean().exec(),
      MessageDeliveryEventModel.findOne({ messageId: message._id }).sort({ occurredAt: -1, createdAt: -1 }).lean().exec()
    ]);

    expect(result).toEqual({ status: 'exhausted', retryCount: 2 });
    expect(updatedMessage?.deliveryStatus).toBe('failed');
    expect(updatedMessage?.error).toContain('Retry attempts exhausted');
    expect(lastEvent).toMatchObject({
      deliveryStatus: 'failed',
      source: 'retry_worker'
    });
  });
});
