import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { ConversationModel, MessageModel } from '@noxivo/database';
import {
  connectDashboardTestDb,
  disconnectDashboardTestDb,
  resetDashboardTestDb
} from './helpers/mongo-memory.js';

const { mockGetCurrentSession, mockSubscribeToInboxEvents, mockUnsubscribe } = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn(),
  mockSubscribeToInboxEvents: vi.fn(),
  mockUnsubscribe: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession
}));

vi.mock('../lib/inbox-events', () => ({
  subscribeToInboxEvents: mockSubscribeToInboxEvents
}));

import { GET as getInboxEvents } from '../app/api/team-inbox/events/route.js';

function extractSsePayloads(value: Uint8Array): unknown[] {
  const chunk = new TextDecoder().decode(value);
  const frames = chunk.split('\n\n');
  const payloads: unknown[] = [];

  for (const frame of frames) {
    if (!frame.includes('data: ')) {
      continue;
    }

    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice('data: '.length))
      .join('\n')
      .trim();

    if (!data) {
      continue;
    }

    payloads.push(JSON.parse(data));
  }

  return payloads;
}

async function readNextSsePayload(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 1_500
): Promise<unknown> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Timed out waiting for SSE payload')), timeoutMs);
  });

  while (true) {
    const result = await Promise.race([
      reader.read(),
      timeoutPromise
    ]) as ReadableStreamReadResult<Uint8Array>;

    if (result.done) {
      throw new Error('SSE stream closed unexpectedly');
    }

    const payloads = extractSsePayloads(result.value);
    if (payloads.length > 0) {
      return payloads[0];
    }
  }
}

describe('team inbox events route', () => {
  beforeAll(async () => {
    await connectDashboardTestDb();
  });

  afterAll(async () => {
    await disconnectDashboardTestDb();
  });

  beforeEach(async () => {
    await resetDashboardTestDb();
  });

  afterEach(() => {
    mockGetCurrentSession.mockReset();
    mockSubscribeToInboxEvents.mockReset();
    mockUnsubscribe.mockClear();
  });

  it('unsubscribes the backplane listener when the SSE stream is cancelled', async () => {
    mockGetCurrentSession.mockResolvedValue({
      actor: {
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        tenantIds: []
      }
    });
    mockSubscribeToInboxEvents.mockResolvedValue(mockUnsubscribe);

    const response = await getInboxEvents();
    const reader = response.body?.getReader();

    expect(reader).toBeTruthy();
    if (!reader) {
      throw new Error('Expected SSE response body reader');
    }

    await reader.read();
    await reader.cancel();

    expect(mockSubscribeToInboxEvents).toHaveBeenCalledWith('tenant-1', expect.any(Function));
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('emits same-timestamp message updates when message identity changes', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const conversationId = new mongoose.Types.ObjectId();
    const sharedTimestamp = new Date('2026-04-18T09:43:00.000Z');

    await ConversationModel.create({
      _id: conversationId,
      agencyId,
      tenantId,
      contactId: '15550009999@c.us',
      contactName: 'Realtime Contact',
      contactPhone: '+1 555 000 9999',
      status: 'open',
      unreadCount: 1,
      lastMessageContent: 'First inbound',
      lastMessageAt: sharedTimestamp
    });

    await MessageModel.create({
      conversationId,
      role: 'user',
      content: 'First inbound',
      providerMessageId: 'wamid-first',
      timestamp: sharedTimestamp
    });

    mockGetCurrentSession.mockResolvedValue({
      actor: {
        agencyId: agencyId.toString(),
        tenantId: tenantId.toString(),
        tenantIds: []
      }
    });

    let subscriberCallback: ((event: { type: 'message.created'; conversationId: string }) => void) | null = null;
    mockSubscribeToInboxEvents.mockImplementation(async (_tenantId, subscriber) => {
      subscriberCallback = subscriber as (event: { type: 'message.created'; conversationId: string }) => void;
      return mockUnsubscribe;
    });

    const response = await getInboxEvents();
    const reader = response.body?.getReader();

    expect(reader).toBeTruthy();
    if (!reader || !subscriberCallback) {
      throw new Error('Expected SSE stream reader and subscriber callback');
    }

    const connectedPayload = await readNextSsePayload(reader) as { type: string };
    expect(connectedPayload.type).toBe('connected');

    (subscriberCallback as any)({
      type: 'message.created',
      conversationId: conversationId.toString()
    });

    const firstEvent = await readNextSsePayload(reader) as {
      type: string;
      conversationId: string;
      message?: { providerMessageId?: string | null; content?: string };
    };
    expect(firstEvent.type).toBe('message.received');
    expect(firstEvent.conversationId).toBe(conversationId.toString());
    expect(firstEvent.message?.providerMessageId).toBe('wamid-first');

    await MessageModel.create({
      conversationId,
      role: 'user',
      content: 'Second inbound',
      providerMessageId: 'wamid-second',
      timestamp: sharedTimestamp
    });

    await ConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          lastMessageContent: 'Second inbound',
          lastMessageAt: sharedTimestamp,
          unreadCount: 2
        }
      }
    ).exec();

    (subscriberCallback as any)({
      type: 'message.created',
      conversationId: conversationId.toString()
    });

    const secondEvent = await readNextSsePayload(reader) as {
      type: string;
      conversationId: string;
      message?: { providerMessageId?: string | null; content?: string };
    };
    expect(secondEvent.type).toBe('message.received');
    expect(secondEvent.conversationId).toBe(conversationId.toString());
    expect(secondEvent.message?.providerMessageId).toBe('wamid-second');
    expect(secondEvent.message?.content).toBe('Second inbound');

    await reader.cancel();
  });
});
