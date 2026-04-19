/** @vitest-environment jsdom */

import * as React from 'react';
import { act } from 'react';
const { createElement } = React;
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InboxPage from '../app/dashboard/inbox/page.js';
import { ChatList } from '../components/team-inbox/chat-list.js';
import { ChatWindow } from '../components/team-inbox/chat-window.js';

vi.mock('../components/team-inbox/chat-input-action-bar', () => ({
  ChatInputActionBar: () => null
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => 'toast-id')
  }
}));

type EventSourceInstance = {
  onopen: (() => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: (() => void) | null;
  close: () => void;
};

function createMessages(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const messageNumber = start + index;
    return {
      _id: `msg-${messageNumber}`,
      role: messageNumber % 2 === 0 ? 'assistant' : 'user',
      content: `Message ${messageNumber}`,
      createdAt: new Date(Date.UTC(2026, 3, 12, 10, messageNumber, 0)).toISOString(),
      deliveryStatus: 'delivered',
      providerMessageId: `provider-${messageNumber}`
    };
  });
}

describe('inbox source-aware UI rendering', () => {
  it('renders source filter controls and source badges in the chat list', () => {
    vi.stubGlobal('React', React);

    const markup = renderToStaticMarkup(createElement(ChatList, {
      chats: [
        {
          _id: 'webhook-conv',
          contactId: 'webhook-contact-123',
          contactName: 'Website Visitor',
          contactPhone: null,
          avatarUrl: null,
          leadSaved: false,
          unreadCount: 2,
          status: 'open',
          assignedTo: null,
          channel: 'webhook',
          sourceName: 'Website Chat',
          sourceLabel: 'Webhook',
          isArchived: false,
          lastMessage: {
            content: 'Need help from the website',
            createdAt: '2026-04-19T12:00:00.000Z'
          }
        },
        {
          _id: 'whatsapp-conv',
          contactId: '15550001111@c.us',
          contactName: 'Alice Smith',
          contactPhone: '+1 555-000-1111',
          avatarUrl: null,
          leadSaved: false,
          unreadCount: 0,
          status: 'open',
          assignedTo: null,
          channel: 'whatsapp',
          sourceName: 'WhatsApp',
          sourceLabel: 'WhatsApp',
          isArchived: false,
          lastMessage: {
            content: 'Hi there',
            createdAt: '2026-04-19T11:00:00.000Z'
          }
        }
      ],
      selectedConversationId: 'webhook-conv',
      liveConversationIds: ['webhook-conv'],
      searchQuery: '',
      sourceFilter: 'all',
      statusFilter: 'active',
      isLoading: false,
      onSearchQueryChange: () => undefined,
      onSourceFilterChange: () => undefined,
      onStatusFilterChange: () => undefined,
      onSelectConversation: () => undefined,
      onRefresh: () => undefined
    }));

    expect(markup).toContain('WhatsApp');
    expect(markup).toContain('Webhook');
    expect(markup).toContain('Archived');
    expect(markup).toContain('Website Chat');
    expect(markup).toContain('Alice Smith');
  });

  it('renders webhook source name and contact context in the chat window header', () => {
    vi.stubGlobal('React', React);

    const markup = renderToStaticMarkup(createElement(ChatWindow, {
      conversation: {
        _id: 'webhook-conv',
        contactId: 'webhook-contact-123',
        contactName: 'Website Visitor',
        contactPhone: null,
        avatarUrl: null,
        leadSaved: false,
        unreadCount: 1,
        status: 'open',
        assignedTo: null,
        channel: 'webhook',
        sourceName: 'Website Chat',
        sourceLabel: 'Webhook',
        isArchived: false,
        lastMessage: {
          content: 'Need help from the website',
          createdAt: '2026-04-19T12:00:00.000Z'
        }
      },
      messages: [
        {
          _id: 'msg-1',
          role: 'user',
          content: 'Need help from the website',
          createdAt: '2026-04-19T12:00:00.000Z'
        }
      ],
      isLoading: false,
      isLoadingConversations: false,
      hasMoreMessages: false,
      isLoadingOlderMessages: false,
      isRunningMessageAction: false,
      isRunningConversationAction: false,
      draft: ''
    }));

    expect(markup).toContain('Webhook');
    expect(markup).toContain('Website Chat');
    expect(markup).toContain('Contact ID: webhook-contact-123');
  });
});

describe('inbox realtime pagination cursor handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('keeps older-message pagination cursor aligned after silent realtime refresh', async () => {
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    let eventSourceInstance: EventSourceInstance | null = null;
    class MockEventSource {
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(_url: string) {
        eventSourceInstance = this;
      }

      close() {}
    }

    let initialPaginatedLoadServed = false;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.startsWith('/api/team-inbox?')) {
        return new Response(JSON.stringify([
          {
            _id: 'conv-1',
            contactId: '15550001111@c.us',
            contactName: 'Alice Smith',
            contactPhone: '+1 555-000-1111',
            avatarUrl: null,
            leadSaved: false,
            unreadCount: 0,
            status: 'open',
            assignedTo: null,
            lastMessage: {
              content: 'Message 40',
              createdAt: '2026-04-12T10:40:00.000Z'
            }
          }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.startsWith('/api/team-inbox/conv-1/messages?')) {
        const parsed = new URL(url, 'http://localhost');
        const cursor = parsed.searchParams.get('cursor');
        const syncPages = parsed.searchParams.get('syncPages');

        if (cursor === null && syncPages === '4' && !initialPaginatedLoadServed) {
          initialPaginatedLoadServed = true;
          return new Response(JSON.stringify({
            messages: [createMessages(41, 41)[0]],
            hasMore: false,
            nextCursor: null
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (cursor === null && syncPages === '4') {
          return new Response(JSON.stringify({
            messages: createMessages(22, 41),
            hasMore: true,
            nextCursor: 'cursor-after-realtime'
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (cursor === 'cursor-after-realtime') {
          return new Response(JSON.stringify({
            messages: createMessages(1, 20),
            hasMore: false,
            nextCursor: null
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
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

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('EventSource', MockEventSource);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(InboxPage));
    });

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(container.textContent).toContain('Alice Smith');
    expect(container.textContent).toContain('Message 41');
    expect(container.textContent).toContain('Start of conversation history');
    expect(eventSourceInstance).toBeTruthy();

    await act(async () => {
      eventSourceInstance?.onmessage?.({
        data: JSON.stringify({
          type: 'message.received',
          conversationId: 'conv-1',
          conversation: {
            _id: 'conv-1',
            contactId: '15550001111@c.us',
            contactName: 'Alice Smith',
            contactPhone: '+1 555-000-1111',
            avatarUrl: null,
            leadSaved: false,
            unreadCount: 1,
            status: 'open',
            assignedTo: null,
            lastMessage: {
              content: 'Message 41',
              createdAt: '2026-04-12T10:41:00.000Z'
            }
          },
          message: {
            _id: 'msg-41',
            role: 'user',
            content: 'Message 41',
            createdAt: '2026-04-12T10:41:00.000Z',
            deliveryStatus: null,
            providerMessageId: 'provider-41'
          }
        })
      } as MessageEvent);
    });

    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    const scrollContainer = Array.from(container.querySelectorAll('div')).find((element) =>
      typeof element.className === 'string'
      && element.className.includes('overflow-y-auto')
      && (element.textContent?.includes('Scroll up to load older messages')
        || element.textContent?.includes('Start of conversation history'))
      && element.textContent?.includes('Message 41')
    );
    expect(scrollContainer).toBeTruthy();
    if (!scrollContainer) {
      throw new Error('Expected to find inbox scroll container');
    }

    Object.defineProperty(scrollContainer, 'scrollTop', {
      value: 100,
      writable: true,
      configurable: true
    });
    Object.defineProperty(scrollContainer, 'scrollHeight', {
      value: 1200,
      writable: true,
      configurable: true
    });
    Object.defineProperty(scrollContainer, 'clientHeight', {
      value: 600,
      writable: true,
      configurable: true
    });

    await act(async () => {
      scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    const olderHistoryRequest = fetchMock.mock.calls
      .map(([requestUrl]) => String(requestUrl))
      .slice()
      .reverse()
      .find((requestUrl: string) => {
        if (!requestUrl.startsWith('/api/team-inbox/conv-1/messages?')) {
          return false;
        }
        const parsed = new URL(requestUrl, 'http://localhost');
        return parsed.searchParams.has('cursor');
      });

    expect(olderHistoryRequest).toBeDefined();
    expect(new URL(olderHistoryRequest ?? '', 'http://localhost').searchParams.get('cursor')).toBe('cursor-after-realtime');

    await act(async () => {
      root.unmount();
    });
  });
});
