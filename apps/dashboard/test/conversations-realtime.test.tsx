/** @vitest-environment jsdom */

import * as React from 'react';
import { act } from 'react';
const { createElement } = React;
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConversationsPage from '../app/dashboard/conversations/page.js';

vi.mock('../components/team-inbox/team-inbox-crm-panel', () => ({
  TeamInboxCrmPanel: () => null
}));

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    CheckCheck: () => '✓✓'
  };
});

describe('conversations realtime refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it.skip('refreshes the selected conversation when SSE emits message and delivery updates', async () => {
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.startsWith('/api/team-inbox?')) {
        return new Response(JSON.stringify([
          {
            _id: 'conv-1',
            contactId: '15550001111@c.us',
            contactName: 'Alice Smith',
            contactPhone: '+1 555-000-1111',
            unreadCount: 0,
            status: 'open',
            assignedTo: null,
            lastMessage: {
              content: 'Hello',
              createdAt: '2026-04-12T10:00:00.000Z'
            },
            contactProfile: {
              totalMessages: 2,
              inboundMessages: 1,
              outboundMessages: 1,
              firstSeenAt: '2026-04-12T09:00:00.000Z',
              lastInboundAt: '2026-04-12T09:30:00.000Z',
              lastOutboundAt: '2026-04-12T10:00:00.000Z'
            }
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url === '/api/team-inbox/conv-1/messages') {
        return new Response(JSON.stringify([
          {
            _id: 'msg-1',
            role: 'assistant',
            content: 'Hello back',
            createdAt: '2026-04-12T10:01:00.000Z',
            deliveryStatus: 'delivered'
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url === '/api/team-inbox/conv-1/read' && init?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unhandled fetch: ${url}` }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    });

    let eventSourceInstance: {
      onmessage: ((event: MessageEvent) => void) | null;
      close: () => void;
    } | null = null;

    class MockEventSource {
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor(_url: string) {
        eventSourceInstance = this;
      }
      close() {}
    }

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('EventSource', MockEventSource);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(ConversationsPage));
    });
    
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(eventSourceInstance).toBeTruthy();
    expect(container.textContent).toContain('Hello back');
    expect(container.textContent).toContain('✓✓');

    const initialConversationFetches = fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/team-inbox?')).length;
    const initialMessageFetches = fetchMock.mock.calls.filter(([url]) => String(url) === '/api/team-inbox/conv-1/messages').length;

    await act(async () => {
      eventSourceInstance?.onmessage?.({
        data: JSON.stringify({ type: 'message.created', conversationId: 'conv-1' })
      } as MessageEvent);
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    const afterMessageCreatedConversationFetches = fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/team-inbox?')).length;
    const afterMessageCreatedMessageFetches = fetchMock.mock.calls.filter(([url]) => String(url) === '/api/team-inbox/conv-1/messages').length;

    expect(afterMessageCreatedConversationFetches).toBeGreaterThan(initialConversationFetches);
    expect(afterMessageCreatedMessageFetches).toBeGreaterThan(initialMessageFetches);

    await act(async () => {
      eventSourceInstance?.onmessage?.({
        data: JSON.stringify({ type: 'message.delivery_updated', conversationId: 'conv-1' })
      } as MessageEvent);
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    const afterDeliveryConversationFetches = fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/team-inbox?')).length;
    const afterDeliveryMessageFetches = fetchMock.mock.calls.filter(([url]) => String(url) === '/api/team-inbox/conv-1/messages').length;

    expect(afterDeliveryConversationFetches).toBeGreaterThan(afterMessageCreatedConversationFetches);
    expect(afterDeliveryMessageFetches).toBeGreaterThan(afterMessageCreatedMessageFetches);

    await act(async () => {
      root.unmount();
    });
  });
});
