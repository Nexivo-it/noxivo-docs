'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ChevronLeft, X } from 'lucide-react';
import { toast } from 'sonner';
import { ChatList } from '../../../components/team-inbox/chat-list';
import { ChatWindow } from '../../../components/team-inbox/chat-window';
import { ChatInputActionBar } from '../../../components/team-inbox/chat-input-action-bar';
import type {
  ChatMessage,
  ConversationActionType,
  ChatSummary,
  InboxRealtimeEvent,
  MessageActionType,
  PaginatedMessagesResponse,
  TeamInboxActionResponse
} from '../../../components/team-inbox/types';

const MESSAGE_PAGE_LIMIT = 20;
const INBOX_POLL_INTERVAL_MS = 2000;
const SELECTED_MESSAGES_POLL_INTERVAL_MS = 1000;
const LIVE_SIGNAL_WINDOW_MS = 30_000;

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

function withUpdatedConversation(
  chats: ChatSummary[],
  conversationId: string,
  updater: (current: ChatSummary) => ChatSummary
): ChatSummary[] {
  return chats.map((chat) => (chat._id === conversationId ? updater(chat) : chat));
}

function toMillis(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function upsertConversation(chats: ChatSummary[], incoming: ChatSummary): ChatSummary[] {
  const index = chats.findIndex((chat) => chat._id === incoming._id);
  if (index === -1) {
    return [incoming, ...chats];
  }

  return withUpdatedConversation(chats, incoming._id, () => incoming);
}

function moveConversationToTop(chats: ChatSummary[], conversationId: string): ChatSummary[] {
  const index = chats.findIndex((chat) => chat._id === conversationId);
  if (index <= 0) {
    return chats;
  }

  const next = chats.slice();
  const [selected] = next.splice(index, 1);
  if (!selected) {
    return chats;
  }
  next.unshift(selected);
  return next;
}

function sortConversationsByLatest(chats: ChatSummary[]): ChatSummary[] {
  return chats.slice().sort((left, right) => {
    const rightTs = toMillis(right.lastMessage?.createdAt);
    const leftTs = toMillis(left.lastMessage?.createdAt);
    return rightTs - leftTs;
  });
}

function normalizeIdentityToken(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizeIdentityDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

function sameContactIdentity(leftContactId: string | null | undefined, rightContactId: string | null | undefined): boolean {
  const left = normalizeIdentityToken(leftContactId);
  const right = normalizeIdentityToken(rightContactId);

  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  const [leftLocal] = left.split('@');
  const [rightLocal] = right.split('@');

  if (!leftLocal || !rightLocal) {
    return false;
  }

  const leftDigits = normalizeIdentityDigits(leftLocal);
  const rightDigits = normalizeIdentityDigits(rightLocal);
  if (leftDigits.length > 0 && rightDigits.length > 0) {
    return leftDigits === rightDigits;
  }

  return leftLocal === rightLocal;
}

function sameConversationIdentity(left: ChatSummary, right: ChatSummary): boolean {
  if (sameContactIdentity(left.contactId, right.contactId)) {
    return true;
  }

  const leftPhone = normalizeIdentityDigits(left.contactPhone);
  const rightPhone = normalizeIdentityDigits(right.contactPhone);
  if (leftPhone.length > 0 && rightPhone.length > 0 && leftPhone === rightPhone) {
    return true;
  }

  return false;
}

function findConversationByIdentity(chats: ChatSummary[], target: ChatSummary): ChatSummary | null {
  return chats.find((chat) => sameConversationIdentity(chat, target)) ?? null;
}

function pickPrimaryConversation(left: ChatSummary, right: ChatSummary): ChatSummary {
  const leftScore = [
    left.assignedTo ? 1 : 0,
    left.status === 'handoff' ? 1 : 0,
    left.unreadCount,
    toMillis(left.lastMessage?.createdAt)
  ];
  const rightScore = [
    right.assignedTo ? 1 : 0,
    right.status === 'handoff' ? 1 : 0,
    right.unreadCount,
    toMillis(right.lastMessage?.createdAt)
  ];

  for (let index = 0; index < leftScore.length; index += 1) {
    const leftValue = leftScore[index] ?? 0;
    const rightValue = rightScore[index] ?? 0;
    if (leftValue === rightValue) {
      continue;
    }
    return leftValue > rightValue ? left : right;
  }

  return left;
}

function collapseDuplicateChats(chats: ChatSummary[]): ChatSummary[] {
  const collapsed: ChatSummary[] = [];

  for (const chat of chats) {
    const duplicateIndex = collapsed.findIndex((candidate) => sameConversationIdentity(candidate, chat));
    if (duplicateIndex === -1) {
      collapsed.push(chat);
      continue;
    }

    const duplicate = collapsed[duplicateIndex];
    if (!duplicate) {
      collapsed.push(chat);
      continue;
    }

    const primary = pickPrimaryConversation(duplicate, chat);
    const secondary = primary._id === duplicate._id ? chat : duplicate;
    const latestMessage = toMillis(primary.lastMessage?.createdAt) >= toMillis(secondary.lastMessage?.createdAt)
      ? primary.lastMessage
      : secondary.lastMessage;

    collapsed[duplicateIndex] = {
      ...primary,
      avatarUrl: primary.avatarUrl ?? secondary.avatarUrl ?? null,
      leadSaved: Boolean(primary.leadSaved || secondary.leadSaved),
      unreadCount: Math.max(primary.unreadCount, secondary.unreadCount),
      lastMessage: latestMessage
    };
  }

  return sortConversationsByLatest(collapsed);
}

function mergeIncomingConversation(chats: ChatSummary[], incoming: ChatSummary): ChatSummary[] {
  const byId = upsertConversation(chats, incoming);
  return collapseDuplicateChats(byId);
}

function isOptimisticMessage(message: ChatMessage): boolean {
  return message._id.startsWith('optimistic-');
}

function sameMessageIdentity(left: ChatMessage, right: ChatMessage): boolean {
  if (left._id === right._id) {
    return true;
  }

  if (
    typeof left.providerMessageId === 'string'
    && left.providerMessageId.length > 0
    && typeof right.providerMessageId === 'string'
    && right.providerMessageId.length > 0
  ) {
    return left.providerMessageId === right.providerMessageId;
  }

  if (!isOptimisticMessage(left) && !isOptimisticMessage(right)) {
    return false;
  }

  if (left.role !== right.role) {
    return false;
  }

  const normalizedLeftContent = left.content.trim();
  const normalizedRightContent = right.content.trim();
  if (normalizedLeftContent.length === 0 || normalizedLeftContent !== normalizedRightContent) {
    return false;
  }

  const delta = Math.abs(toMillis(left.createdAt) - toMillis(right.createdAt));
  return delta <= 90_000;
}

function mergeMessage(existing: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  return mergeMessagePages(existing, [incoming]);
}

function mergeMessagePages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const merged = existing.slice();

  for (const nextMessage of incoming) {
    const duplicateIndex = merged.findIndex((currentMessage) => sameMessageIdentity(currentMessage, nextMessage));

    if (duplicateIndex === -1) {
      merged.push(nextMessage);
      continue;
    }

    const currentMessage = merged[duplicateIndex];
    if (!currentMessage) {
      merged[duplicateIndex] = nextMessage;
      continue;
    }

    merged[duplicateIndex] = {
      ...currentMessage,
      ...nextMessage,
      attachments: nextMessage.attachments ?? currentMessage.attachments ?? [],
      deliveryStatus: nextMessage.deliveryStatus ?? currentMessage.deliveryStatus ?? null,
      providerMessageId: nextMessage.providerMessageId ?? currentMessage.providerMessageId ?? null,
      messageSource: nextMessage.messageSource ?? currentMessage.messageSource ?? null,
      error: nextMessage.error ?? currentMessage.error ?? null
    };
  }

  return merged.sort(
    (left, right) => toMillis(left.createdAt) - toMillis(right.createdAt)
  );
}

function isPaginatedMessagesResponse(value: unknown): value is PaginatedMessagesResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return Array.isArray(record.messages)
    && typeof record.hasMore === 'boolean'
    && (typeof record.nextCursor === 'string' || record.nextCursor === null);
}

export default function InboxPage() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [liveConversationActivity, setLiveConversationActivity] = useState<Record<string, number>>({});
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [messagesCursor, setMessagesCursor] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isMutatingHandoff, setIsMutatingHandoff] = useState(false);
  const [isRunningConversationAction, setIsRunningConversationAction] = useState(false);
  const [isRunningMessageAction, setIsRunningMessageAction] = useState(false);
  const [isMutatingLead, setIsMutatingLead] = useState(false);
  const [dismissedLeadPromptByConversation, setDismissedLeadPromptByConversation] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const activeConversationRef = useRef<string | null>(null);
  const selectedConversationIdRef = useRef<string | null>(null);
  const chatsRef = useRef<ChatSummary[]>([]);
  const requestedConversationIdRef = useRef<string | null>(null);
  const pollInFlightRef = useRef(false);
  const selectedMessagesRefreshInFlightRef = useRef(false);
  const lastSelectedMessagesRefreshAtRef = useRef(0);
  const isLoadingMessagesRef = useRef(false);
  const isLoadingOlderMessagesRef = useRef(false);
  const messagesCountRef = useRef(0);
  const selectedConversationSnapshotRef = useRef<ChatSummary | null>(null);
  const sseReconnectTimerRef = useRef<number | null>(null);
  const sseReconnectAttemptRef = useRef(0);
  const processedSseEventRef = useRef<Map<string, number>>(new Map());

  const selectedConversation = useMemo(() => {
    if (!selectedConversationId) {
      return null;
    }

    const exactMatch = chats.find((chat) => chat._id === selectedConversationId) ?? null;
    if (exactMatch) {
      return exactMatch;
    }

    const snapshot = selectedConversationSnapshotRef.current;
    if (!snapshot) {
      return null;
    }

    return findConversationByIdentity(chats, snapshot);
  }, [chats, selectedConversationId]);

  const liveConversationIds = useMemo(() => {
    const now = Date.now();
    return Object.entries(liveConversationActivity)
      .filter(([, updatedAt]) => now - updatedAt <= LIVE_SIGNAL_WINDOW_MS)
      .map(([conversationId]) => conversationId);
  }, [liveConversationActivity]);
  const shouldShowLeadPrompt = Boolean(
    selectedConversation
    && !selectedConversation.leadSaved
    && !dismissedLeadPromptByConversation[selectedConversation._id]
  );

  useEffect(() => {
    if (!selectedConversationId || selectedConversation) {
      return;
    }

    const snapshot = selectedConversationSnapshotRef.current;
    if (!snapshot) {
      return;
    }

    const identityMatch = findConversationByIdentity(chats, snapshot);
    if (identityMatch && identityMatch._id !== selectedConversationId) {
      setSelectedConversationId(identityMatch._id);
    }
  }, [chats, selectedConversation, selectedConversationId]);

  useEffect(() => {
    isLoadingMessagesRef.current = isLoadingMessages;
  }, [isLoadingMessages]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const requestedConversationId = params.get('conversation');
    if (requestedConversationId && requestedConversationId.trim().length > 0) {
      requestedConversationIdRef.current = requestedConversationId.trim();
    }
  }, []);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    if (selectedConversation) {
      selectedConversationSnapshotRef.current = selectedConversation;
    }
  }, [selectedConversation]);

  useEffect(() => {
    isLoadingOlderMessagesRef.current = isLoadingOlderMessages;
  }, [isLoadingOlderMessages]);

  useEffect(() => {
    messagesCountRef.current = messages.length;
  }, [messages.length]);

  const updateChats = (updater: (current: ChatSummary[]) => ChatSummary[]): void => {
    setChats((current) => collapseDuplicateChats(updater(current)));
  };

  async function loadChats(
    preserveSelection: boolean,
    options: { silent?: boolean } = {}
  ): Promise<void> {
    if (!options.silent) {
      setIsLoadingChats(true);
    }

    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) {
        params.set('query', searchQuery.trim());
      }

      const response = await fetch(`/api/team-inbox?${params.toString()}`);
      const payload = await parseJsonSafe<ChatSummary[] | { error?: string }>(response);
      const selectedConversationIdValue = selectedConversationIdRef.current;
      const currentChats = chatsRef.current;
      const requestedConversationId = requestedConversationIdRef.current;

      if (!response.ok || !Array.isArray(payload)) {
        throw new Error((payload as { error?: string } | null)?.error ?? 'Unable to load conversations');
      }

      const sortedPayload = collapseDuplicateChats(payload);
      setChats(sortedPayload);
      setError(null);

      if (requestedConversationId) {
        const requestedConversation = sortedPayload.find((chat) => chat._id === requestedConversationId);
        if (requestedConversation) {
          setSelectedConversationId(requestedConversation._id);
          requestedConversationIdRef.current = null;
          return;
        }
      }

      if (preserveSelection) {
        if (selectedConversationIdValue) {
          const exactMatch = sortedPayload.find((chat) => chat._id === selectedConversationIdValue);
          if (exactMatch) {
            return;
          }

          const selectedConversationByIdentity = currentChats.find((chat) => chat._id === selectedConversationIdValue)
            ?? selectedConversationSnapshotRef.current;
          if (selectedConversationByIdentity) {
            const identityMatch = findConversationByIdentity(sortedPayload, selectedConversationByIdentity);
            if (identityMatch) {
              setSelectedConversationId(identityMatch._id);
              return;
            }
          }
        } else {
          return;
        }
      }

      setSelectedConversationId(sortedPayload[0]?._id ?? null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load conversations');
    } finally {
      if (!options.silent) {
        setIsLoadingChats(false);
      }
    }
  }

  async function loadMessages(
    conversationId: string,
    options: { loadOlder?: boolean; silent?: boolean; skipMarkRead?: boolean; syncPages?: number } = {}
  ): Promise<void> {
    activeConversationRef.current = conversationId;

    if (options.loadOlder) {
      if (isLoadingMessages || isLoadingOlderMessages || !messagesCursor) {
        return;
      }
      setIsLoadingOlderMessages(true);
      isLoadingOlderMessagesRef.current = true;
    } else {
      if (!options.silent) {
        setIsLoadingMessages(true);
        isLoadingMessagesRef.current = true;
        setMessages([]);
        messagesCountRef.current = 0;
        setHasMoreMessages(false);
        setMessagesCursor(null);
      }
    }

    try {
      const params = new URLSearchParams({
        paginated: '1',
        limit: String(MESSAGE_PAGE_LIMIT)
      });

      if (options.loadOlder && messagesCursor) {
        params.set('cursor', messagesCursor);
      } else {
        params.set('syncPages', String(options.syncPages ?? 4));
      }

      const response = await fetch(`/api/team-inbox/${conversationId}/messages?${params.toString()}`);
      const payload = await parseJsonSafe<PaginatedMessagesResponse | { error?: string }>(response);

      if (!response.ok || !isPaginatedMessagesResponse(payload)) {
        throw new Error((payload as { error?: string } | null)?.error ?? 'Unable to load messages');
      }

      if (activeConversationRef.current !== conversationId) {
        return;
      }

      if (options.loadOlder) {
        setMessages((current) => mergeMessagePages(current, payload.messages));
      } else if (options.silent) {
        setMessages((current) => mergeMessagePages(current, payload.messages));
      } else {
        setMessages(payload.messages);
      }
      if (options.loadOlder || !options.silent) {
        setHasMoreMessages(payload.hasMore);
        setMessagesCursor(payload.nextCursor);
      } else {
        setHasMoreMessages((current) => current || payload.hasMore);
        setMessagesCursor((current) => current ?? payload.nextCursor);
      }
      setError(null);
      if (!options.loadOlder && !options.skipMarkRead) {
        await fetch(`/api/team-inbox/${conversationId}/read`, { method: 'POST' });
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load messages');
    } finally {
      if (options.loadOlder) {
        setIsLoadingOlderMessages(false);
        isLoadingOlderMessagesRef.current = false;
      } else {
        if (!options.silent) {
          setIsLoadingMessages(false);
          isLoadingMessagesRef.current = false;
        }
      }
    }
  }

  function refreshSelectedMessagesSilently(): void {
    const selectedConversationIdValue = selectedConversationIdRef.current;
    if (!selectedConversationIdValue || isLoadingMessagesRef.current || isLoadingOlderMessagesRef.current) {
      return;
    }

    const now = Date.now();
    if (selectedMessagesRefreshInFlightRef.current || now - lastSelectedMessagesRefreshAtRef.current < 900) {
      return;
    }

    selectedMessagesRefreshInFlightRef.current = true;
    lastSelectedMessagesRefreshAtRef.current = now;
    const recoveryDepth = messagesCountRef.current <= 1 ? 4 : 1;
    void loadMessages(selectedConversationIdValue, {
      silent: true,
      skipMarkRead: true,
      syncPages: recoveryDepth
    }).finally(() => {
      selectedMessagesRefreshInFlightRef.current = false;
    });
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadChats(true);
    }, 180);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    void loadChats(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedConversationId) {
      activeConversationRef.current = null;
      setMessages([]);
      setHasMoreMessages(false);
      setMessagesCursor(null);
      setIsLoadingOlderMessages(false);
      isLoadingMessagesRef.current = false;
      isLoadingOlderMessagesRef.current = false;
      messagesCountRef.current = 0;
      return;
    }

    void loadMessages(selectedConversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId]);

  async function handleLoadOlderMessages(): Promise<void> {
    if (!selectedConversationId || !hasMoreMessages || isLoadingOlderMessages || isLoadingMessages) {
      return;
    }

    await loadMessages(selectedConversationId, { loadOlder: true });
  }

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let closed = false;

    const clearReconnectTimer = () => {
      if (sseReconnectTimerRef.current !== null) {
        window.clearTimeout(sseReconnectTimerRef.current);
        sseReconnectTimerRef.current = null;
      }
    };

    const shouldProcessSseEvent = (payload: InboxRealtimeEvent): boolean => {
      const conversationId = payload.conversationId ?? 'none';
      const messageKey = payload.message?.providerMessageId
        ?? payload.message?._id
        ?? payload.message?.createdAt
        ?? 'none';
      const conversationKey = payload.conversation?.lastMessage?.createdAt ?? 'none';
      const dedupeKey = `${payload.type}:${conversationId}:${messageKey}:${conversationKey}`;
      const now = Date.now();
      const previous = processedSseEventRef.current.get(dedupeKey);

      if (previous && now - previous < 4000) {
        return false;
      }

      processedSseEventRef.current.set(dedupeKey, now);
      for (const [key, value] of processedSseEventRef.current.entries()) {
        if (now - value > 20_000) {
          processedSseEventRef.current.delete(key);
        }
      }
      return true;
    };

    const connect = () => {
      if (closed) {
        return;
      }

      eventSource = new EventSource('/api/team-inbox/events');

      eventSource.onopen = () => {
        sseReconnectAttemptRef.current = 0;
        clearReconnectTimer();
      };

      eventSource.onmessage = (event) => {
        if (!event.data) {
          return;
        }

        let payload: InboxRealtimeEvent | null = null;
        try {
          payload = JSON.parse(event.data) as InboxRealtimeEvent;
        } catch {
          return;
        }

        if (!payload || payload.type === 'connected' || !payload.conversationId || !shouldProcessSseEvent(payload)) {
          return;
        }

        const conversationId = payload.conversationId;
        const incomingConversation = payload.conversation
          ? {
              _id: payload.conversation._id,
              contactId: payload.conversation.contactId,
              contactName: payload.conversation.contactName,
              contactPhone: payload.conversation.contactPhone,
              avatarUrl: payload.conversation.avatarUrl ?? null,
              leadSaved: payload.conversation.leadSaved ?? false,
              unreadCount: payload.conversation.unreadCount,
              status: payload.conversation.status,
              assignedTo: payload.conversation.assignedTo,
              lastMessage: payload.conversation.lastMessage
            } satisfies ChatSummary
          : null;

        updateChats((current) => {
          let next = current.slice();
          let anchorConversation = incomingConversation;

          if (incomingConversation) {
            next = mergeIncomingConversation(next, incomingConversation);
          }

          if (payload.message) {
            next = collapseDuplicateChats(
              next.map((chat) => {
                if (
                  chat._id !== conversationId
                  && (!incomingConversation || !sameConversationIdentity(chat, incomingConversation))
                ) {
                  return chat;
                }

                return {
                  ...chat,
                  lastMessage: {
                    content: (payload.message?.content ?? chat.lastMessage?.content ?? '') as string,
                    createdAt: (payload.message?.createdAt ?? chat.lastMessage?.createdAt ?? new Date().toISOString()) as string
                  },
                  unreadCount:
                    payload.message?.role === 'user'
                      ? Math.max(chat.unreadCount, incomingConversation?.unreadCount ?? chat.unreadCount)
                      : chat.unreadCount
                };
              })
            );

            if (!anchorConversation) {
              anchorConversation = (next.find((chat) => chat._id === conversationId) as ChatSummary | undefined)
                ?? null;
            }
          }

          const selectedConversationIdValue = selectedConversationIdRef.current;
          if (selectedConversationIdValue) {
            const selectedChat = next.find((chat) => chat._id === selectedConversationIdValue) ?? null;
            if (
              selectedChat
              && anchorConversation
              && sameConversationIdentity(selectedChat, anchorConversation)
            ) {
              next = withUpdatedConversation(next, selectedChat._id, (chat) => ({
                ...chat,
                unreadCount: 0
              }));
            }
          }

          const targetConversation = anchorConversation
            ? findConversationByIdentity(next, anchorConversation)
            : next.find((chat) => chat._id === conversationId) ?? null;

          if (!targetConversation) {
            return collapseDuplicateChats(next);
          }

          return moveConversationToTop(collapseDuplicateChats(next), targetConversation._id);
        });

        if (
          payload.type === 'message.received'
          || (payload.type === 'message.created' && payload.message?.role === 'user')
        ) {
          setLiveConversationActivity((current) => ({
            ...current,
            [conversationId]: Date.now()
          }));
        }

        const selectedConversationIdValue = selectedConversationIdRef.current;
        const selectedConversationSnapshot = selectedConversationSnapshotRef.current;
        const incomingMatchesSelection = Boolean(
          selectedConversationIdValue
          && (
            selectedConversationIdValue === conversationId
            || (
              incomingConversation
              && selectedConversationSnapshot
              && sameConversationIdentity(incomingConversation, selectedConversationSnapshot)
            )
          )
        );

        if (payload.message && incomingMatchesSelection) {
          setMessages((current) => mergeMessage(current, payload.message!));
        }

        if (
          payload.type === 'message.received'
          || payload.type === 'message.sent'
          || payload.type === 'message.delivery_updated'
          || payload.type === 'message.created'
          || payload.type === 'conversation.updated'
          || payload.type === 'assignment.updated'
        ) {
          refreshSelectedMessagesSilently();
        }
      };

      eventSource.onerror = () => {
        refreshSelectedMessagesSilently();
        if (closed) {
          return;
        }

        eventSource?.close();
        clearReconnectTimer();
        const attempt = sseReconnectAttemptRef.current;
        const delayMs = Math.min(10_000, 1000 * 2 ** Math.min(attempt, 4));
        sseReconnectAttemptRef.current = attempt + 1;

        sseReconnectTimerRef.current = window.setTimeout(() => {
          sseReconnectTimerRef.current = null;
          connect();
        }, delayMs);
      };
    };

    connect();

    return () => {
      closed = true;
      clearReconnectTimer();
      eventSource?.close();
    };
  }, [selectedConversationId]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setLiveConversationActivity((current) => {
        const nextEntries = Object.entries(current).filter(([, updatedAt]) => now - updatedAt <= LIVE_SIGNAL_WINDOW_MS);
        if (nextEntries.length === Object.keys(current).length) {
          return current;
        }
        return Object.fromEntries(nextEntries);
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }

      if (pollInFlightRef.current) {
        return;
      }

      pollInFlightRef.current = true;
      void loadChats(true, { silent: true }).finally(() => {
        pollInFlightRef.current = false;
      });
    }, INBOX_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    if (!selectedConversationId) {
      return;
    }

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      refreshSelectedMessagesSilently();
    }, SELECTED_MESSAGES_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId || !selectedConversation?.lastMessage?.createdAt) {
      return;
    }

    const latestLocalMessage = messages[messages.length - 1];
    const selectedConversationTs = new Date(selectedConversation.lastMessage.createdAt).getTime();
    const latestLocalTs = latestLocalMessage ? new Date(latestLocalMessage.createdAt).getTime() : 0;

    if (selectedConversationTs <= latestLocalTs) {
      return;
    }

    refreshSelectedMessagesSilently();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId, selectedConversation?.lastMessage?.createdAt]);

  async function handleSendMessage(): Promise<void> {
    if (!selectedConversation || draft.trim().length === 0 || isSending) {
      return;
    }

    setIsSending(true);
    setError(null);

    const optimisticMessageId = `optimistic-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      _id: optimisticMessageId,
      role: 'assistant',
      content: draft.trim(),
      createdAt: new Date().toISOString(),
      deliveryStatus: 'queued'
    };

    setMessages((current) => mergeMessage(current, optimisticMessage));
    updateChats((current) =>
      moveConversationToTop(
        withUpdatedConversation(current, selectedConversation._id, (chat) => ({
          ...chat,
          lastMessage: {
            content: optimisticMessage.content,
            createdAt: optimisticMessage.createdAt
          }
        })),
        selectedConversation._id
      )
    );
    setDraft('');

    try {
      const response = await fetch(`/api/team-inbox/${selectedConversation._id}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: optimisticMessage.content,
          to: selectedConversation.contactId
        })
      });
      const payload = await parseJsonSafe<ChatMessage | { error?: string }>(response);

      if (!response.ok || !payload || !('_id' in payload)) {
        throw new Error((payload as { error?: string } | null)?.error ?? 'Unable to send message');
      }

      setMessages((current) => {
        const withoutOptimistic = current.filter((message) => message._id !== optimisticMessageId);
        return mergeMessagePages(withoutOptimistic, [payload]);
      });
      updateChats((current) =>
        moveConversationToTop(
          withUpdatedConversation(current, selectedConversation._id, (chat) => ({
            ...chat,
            lastMessage: {
              content: payload.content ?? optimisticMessage.content,
              createdAt: payload.createdAt ?? optimisticMessage.createdAt
            }
          })),
          selectedConversation._id
        )
      );
    } catch (sendError) {
      setMessages((current) => current.filter((message) => message._id !== optimisticMessageId));
      const errorMessage = sendError instanceof Error ? sendError.message : 'Unable to send message';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSending(false);
    }
  }

  async function handlePauseAiAndJoin(): Promise<void> {
    if (!selectedConversation) {
      return;
    }

    setIsMutatingHandoff(true);
    setError(null);
    const toastId = toast.loading('Pausing AI and joining chat...');
    try {
      const response = await fetch(`/api/team-inbox/${selectedConversation._id}/assign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      });
      const payload = await parseJsonSafe<{ status: string; assignedTo: string | null; error?: string }>(response);

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to pause AI');
      }

      if (!payload) {
        throw new Error('Unable to pause AI');
      }

      updateChats((current) =>
        withUpdatedConversation(current, selectedConversation._id, (chat) => ({
          ...chat,
          status: payload.status,
          assignedTo: payload.assignedTo
        }))
      );
      toast.success('AI paused. You are now assigned to this chat.', { id: toastId });
    } catch (handoffError) {
      const errorMessage = handoffError instanceof Error ? handoffError.message : 'Unable to pause AI';
      setError(errorMessage);
      toast.error(errorMessage, { id: toastId });
    } finally {
      setIsMutatingHandoff(false);
    }
  }

  async function handleReturnToAi(): Promise<void> {
    if (!selectedConversation) {
      return;
    }

    setIsMutatingHandoff(true);
    setError(null);
    const toastId = toast.loading('Returning conversation to AI...');
    try {
      const response = await fetch(`/api/team-inbox/${selectedConversation._id}/unhandoff`, {
        method: 'POST'
      });
      const payload = await parseJsonSafe<{ status: string; error?: string }>(response);

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to return to AI');
      }

      if (!payload) {
        throw new Error('Unable to return to AI');
      }

      updateChats((current) =>
        withUpdatedConversation(current, selectedConversation._id, (chat) => ({
          ...chat,
          status: payload.status,
          assignedTo: null
        }))
      );
      toast.success('Conversation returned to AI automation.', { id: toastId });
    } catch (unhandoffError) {
      const errorMessage = unhandoffError instanceof Error ? unhandoffError.message : 'Unable to return to AI';
      setError(errorMessage);
      toast.error(errorMessage, { id: toastId });
    } finally {
      setIsMutatingHandoff(false);
    }
  }

  async function handleConversationAction(
    action: ConversationActionType,
    payload?: Record<string, unknown>
  ): Promise<void> {
    if (!selectedConversation || isRunningConversationAction) {
      return;
    }

    setIsRunningConversationAction(true);
    setError(null);

    try {
      const response = await fetch(`/api/team-inbox/${selectedConversation._id}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(payload ? { payload } : {})
        })
      });
      const result = await parseJsonSafe<TeamInboxActionResponse>(response);

      if (!response.ok || !result?.success) {
        throw new Error(result?.error?.message ?? 'Conversation action failed');
      }

      toast.success('Conversation action completed');
      refreshSelectedMessagesSilently();
      await loadChats(true, { silent: true });
    } catch (actionError) {
      const errorMessage = actionError instanceof Error ? actionError.message : 'Conversation action failed';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsRunningConversationAction(false);
    }
  }

  async function handleMessageAction(
    message: ChatMessage,
    action: MessageActionType,
    payload?: Record<string, unknown>
  ): Promise<void> {
    if (!selectedConversation || isRunningMessageAction) {
      return;
    }

    setIsRunningMessageAction(true);
    setError(null);

    const originalMessages = messages;
    if (action === 'delete') {
      setMessages((current) => current.filter((item) => item._id !== message._id));
    } else if (action === 'edit' && typeof payload?.text === 'string') {
      const updatedText = payload.text;
      setMessages((current) =>
        current.map((item) => (item._id === message._id ? { ...item, content: updatedText } : item))
      );
    }

    try {
      const response = await fetch(
        `/api/team-inbox/${selectedConversation._id}/messages/${encodeURIComponent(message._id)}/actions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action,
            ...(payload ? { payload } : {})
          })
        }
      );

      const result = await parseJsonSafe<TeamInboxActionResponse>(response);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error?.message ?? 'Message action failed');
      }

      toast.success('Message action completed');
      refreshSelectedMessagesSilently();
      await loadChats(true, { silent: true });
    } catch (actionError) {
      setMessages(originalMessages);
      const errorMessage = actionError instanceof Error ? actionError.message : 'Message action failed';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsRunningMessageAction(false);
    }
  }

  async function handleSaveLead(): Promise<void> {
    if (!selectedConversation || isMutatingLead) {
      return;
    }

    setIsMutatingLead(true);
    setError(null);

    try {
      const response = await fetch(`/api/team-inbox/${selectedConversation._id}/lead`, {
        method: 'POST'
      });
      const payload = await parseJsonSafe<{ success?: boolean; error?: string }>(response);

      if (!response.ok || payload?.success !== true) {
        throw new Error(payload?.error ?? 'Unable to save contact to leads');
      }

      updateChats((current) =>
        withUpdatedConversation(current, selectedConversation._id, (chat) => ({
          ...chat,
          leadSaved: true
        }))
      );
      setDismissedLeadPromptByConversation((current) => ({
        ...current,
        [selectedConversation._id]: false
      }));
      toast.success('Contact saved to leads');
    } catch (saveError) {
      const errorMessage = saveError instanceof Error ? saveError.message : 'Unable to save contact to leads';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsMutatingLead(false);
    }
  }

  async function handleDeleteLead(): Promise<void> {
    if (!selectedConversation || isMutatingLead) {
      return;
    }

    setIsMutatingLead(true);
    setError(null);

    try {
      const response = await fetch(`/api/team-inbox/${selectedConversation._id}/lead`, {
        method: 'DELETE'
      });
      const payload = await parseJsonSafe<{ success?: boolean; error?: string }>(response);

      if (!response.ok || payload?.success !== true) {
        throw new Error(payload?.error ?? 'Unable to remove contact from leads');
      }

      updateChats((current) =>
        withUpdatedConversation(current, selectedConversation._id, (chat) => ({
          ...chat,
          leadSaved: false
        }))
      );
      toast.success('Contact removed from leads');
    } catch (deleteError) {
      const errorMessage = deleteError instanceof Error ? deleteError.message : 'Unable to remove contact from leads';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsMutatingLead(false);
    }
  }

  function handleSelectConversation(conversationId: string): void {
    const requestedConversation = chatsRef.current.find((chat) => chat._id === conversationId) ?? null;
    if (!requestedConversation) {
      setSelectedConversationId(conversationId);
      return;
    }

    const canonicalConversation = findConversationByIdentity(chatsRef.current, requestedConversation);
    setSelectedConversationId(canonicalConversation?._id ?? conversationId);
  }

  return (
    <div className="mx-auto h-[calc(100vh-5rem)] w-full max-w-[1600px] px-4 pb-8 pt-4 md:px-6">
      <div className="h-full overflow-hidden rounded-2xl border border-border-ghost bg-surface-base shadow-ambient">
        <div className="flex h-full min-h-0 flex-col md:flex-row">
          <div className={`${selectedConversation ? 'hidden md:block' : 'block'}`}>
            <ChatList
              chats={chats}
              selectedConversationId={selectedConversationId}
              liveConversationIds={liveConversationIds}
              searchQuery={searchQuery}
              isLoading={isLoadingChats}
              onSearchQueryChange={setSearchQuery}
              onSelectConversation={handleSelectConversation}
              onRefresh={() => void loadChats(true)}
            />
          </div>

          <div className={`min-h-0 min-w-0 flex-1 flex-col ${selectedConversation ? 'flex' : 'hidden md:flex'}`}>
            {selectedConversation ? (
              <div className="border-b border-border-ghost px-4 py-2 md:hidden">
                <button
                  type="button"
                  onClick={() => setSelectedConversationId(null)}
                  className="inline-flex h-11 items-center gap-1 rounded-xl border border-border-ghost bg-surface-card px-3 text-[12px] font-semibold text-on-surface-muted"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
              </div>
            ) : null}

            {error ? (
              <div className="mx-4 mt-4 rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-[12px] text-error md:mx-6">
                <span className="inline-flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </span>
              </div>
            ) : null}

            {selectedConversation ? (
              shouldShowLeadPrompt ? (
                <div className="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border-ghost bg-surface-card px-3 py-2 text-[12px] text-on-surface md:mx-6">
                  <span className="flex-1 font-medium">Save this contact to Leads?</span>
                  <button
                    type="button"
                    onClick={() => void handleSaveLead()}
                    disabled={isMutatingLead}
                    className="inline-flex h-11 items-center rounded-xl border border-primary/30 bg-primary/10 px-3 text-[11px] font-semibold text-primary hover:bg-primary/15 disabled:opacity-60"
                  >
                    {isMutatingLead ? 'Saving…' : 'Save Lead'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDismissedLeadPromptByConversation((current) => ({
                        ...current,
                        [selectedConversation._id]: true
                      }));
                    }}
                    className="inline-flex h-11 items-center rounded-xl border border-border-ghost bg-surface-base px-3 text-[11px] font-semibold text-on-surface-muted hover:border-primary/30 hover:text-primary"
                  >
                    Not now
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDismissedLeadPromptByConversation((current) => ({
                        ...current,
                        [selectedConversation._id]: true
                      }));
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-subtle hover:text-on-surface transition-colors"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : null
            ) : null}

            <ChatWindow
              conversation={selectedConversation}
              messages={messages}
              isLoading={isLoadingMessages}
              isLoadingConversations={isLoadingChats}
              hasMoreMessages={hasMoreMessages}
              isLoadingOlderMessages={isLoadingOlderMessages}
              onLoadOlderMessages={() => void handleLoadOlderMessages()}
              onMessageAction={(message, action, payload) => void handleMessageAction(message, action, payload)}
              isRunningMessageAction={isRunningMessageAction}
              onConversationAction={(action, payload) => void handleConversationAction(action, payload)}
              isRunningConversationAction={isRunningConversationAction}
              draft={draft}
            />
            <ChatInputActionBar
              conversation={selectedConversation}
              draft={draft}
              isSending={isSending}
              isMutatingHandoff={isMutatingHandoff}
              onDraftChange={setDraft}
              onSend={() => void handleSendMessage()}
              onPauseAiAndJoin={() => void handlePauseAiAndJoin()}
              onReturnToAi={() => void handleReturnToAi()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
