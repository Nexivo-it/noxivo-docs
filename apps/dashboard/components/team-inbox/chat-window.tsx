'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  CheckCheck,
  Keyboard,
  Link2,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Phone,
  User,
  X
} from 'lucide-react';
import type { ChatMessage, ChatSummary, ConversationActionType, MessageActionType } from './types';

interface ChatWindowProps {
  conversation: ChatSummary | null;
  messages: ChatMessage[];
  isLoading: boolean;
  isLoadingConversations?: boolean;
  hasMoreMessages?: boolean;
  isLoadingOlderMessages?: boolean;
  onLoadOlderMessages?: () => void;
  onMessageAction?: (
    message: ChatMessage,
    action: MessageActionType,
    payload?: Record<string, unknown>
  ) => void;
  isRunningMessageAction?: boolean;
  onConversationAction?: (action: ConversationActionType, payload?: Record<string, unknown>) => void;
  isRunningConversationAction?: boolean;
  draft?: string;
}

function MessageThreadSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 7 }).map((_, index) => {
        const inbound = index % 2 === 0;
        return (
          <div
            key={`message-skeleton-${index}`}
            className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${
                inbound ? 'bg-surface-card' : 'bg-primary/20'
              }`}
            >
              <div className="h-3.5 w-48 rounded bg-surface-base animate-pulse" />
              <div className="mt-2 h-3 w-24 rounded bg-surface-base animate-pulse" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function dedupeMessagesForRender(messages: ChatMessage[]): ChatMessage[] {
  const deduped: ChatMessage[] = [];
  const messageIndexById = new Map<string, number>();

  for (const message of messages) {
    const existingIndex = messageIndexById.get(message._id);
    if (existingIndex === undefined) {
      messageIndexById.set(message._id, deduped.length);
      deduped.push(message);
      continue;
    }

    const current = deduped[existingIndex];
    if (!current) {
      deduped[existingIndex] = message;
      continue;
    }

    const incomingTimestamp = new Date(message.createdAt).getTime();
    const currentTimestamp = new Date(current.createdAt).getTime();
    if (!Number.isFinite(incomingTimestamp) || incomingTimestamp >= currentTimestamp) {
      deduped[existingIndex] = message;
    }
  }

  return deduped;
}

export function ChatWindow({
  conversation,
  messages,
  isLoading,
  isLoadingConversations = false,
  hasMoreMessages = false,
  isLoadingOlderMessages = false,
  onLoadOlderMessages,
  onMessageAction,
  isRunningMessageAction = false,
  onConversationAction,
  isRunningConversationAction = false,
  draft = ''
}: ChatWindowProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastKnownLastMessageId = useRef<string | null>(null);
  const initialScrollConversationIdRef = useRef<string | null>(null);
  const shouldRestoreScrollPosition = useRef(false);
  const previousScrollHeight = useRef(0);
  const previousScrollTop = useRef(0);
  const [openActionMenuMessageId, setOpenActionMenuMessageId] = useState<string | null>(null);
  const [isConvActionMenuOpen, setIsConvActionMenuOpen] = useState(false);
  const [isProfileCardOpen, setIsProfileCardOpen] = useState(false);

  const convMenuRef = useRef<HTMLDivElement | null>(null);
  const profileCardRef = useRef<HTMLDivElement | null>(null);
  const messageMenuRef = useRef<HTMLDivElement | null>(null);
  const renderMessages = useMemo(() => dedupeMessagesForRender(messages), [messages]);
  const hasDraftLink = draft.includes('http://') || draft.includes('https://');

  // Handle click outside for all menus
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // Close conversation menu if click is outside
      if (isConvActionMenuOpen && convMenuRef.current && !convMenuRef.current.contains(event.target as Node)) {
        setIsConvActionMenuOpen(false);
      }
      // Close profile card if click is outside
      if (isProfileCardOpen && profileCardRef.current && !profileCardRef.current.contains(event.target as Node)) {
        setIsProfileCardOpen(false);
      }
      // Close message action menu if click is outside
      if (openActionMenuMessageId && messageMenuRef.current && !messageMenuRef.current.contains(event.target as Node)) {
        setOpenActionMenuMessageId(null);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isConvActionMenuOpen, isProfileCardOpen, openActionMenuMessageId]);

  useEffect(() => {
    lastKnownLastMessageId.current = null;
    initialScrollConversationIdRef.current = null;
    shouldRestoreScrollPosition.current = false;
    previousScrollHeight.current = 0;
    previousScrollTop.current = 0;
    setOpenActionMenuMessageId(null);
  }, [conversation?._id]);

  useEffect(() => {
    if (!conversation || isLoading || renderMessages.length === 0) {
      return;
    }

    if (initialScrollConversationIdRef.current === conversation._id) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
    initialScrollConversationIdRef.current = conversation._id;
  }, [conversation, isLoading, renderMessages.length]);

  useEffect(() => {
    if (renderMessages.length === 0) {
      lastKnownLastMessageId.current = null;
      return;
    }

    const latestMessageId = renderMessages[renderMessages.length - 1]?._id ?? null;

    if (!latestMessageId) {
      return;
    }

    const isInitialThreadLoad = lastKnownLastMessageId.current === null;
    const hasNewLatestMessage = lastKnownLastMessageId.current !== latestMessageId;

    if (isInitialThreadLoad || hasNewLatestMessage) {
      bottomRef.current?.scrollIntoView({ behavior: isInitialThreadLoad ? 'auto' : 'smooth', block: 'end' });
    }

    lastKnownLastMessageId.current = latestMessageId;
  }, [renderMessages]);

  useEffect(() => {
    if (isLoadingOlderMessages) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container || !shouldRestoreScrollPosition.current) {
      return;
    }

    const heightDelta = container.scrollHeight - previousScrollHeight.current;
    container.scrollTop = previousScrollTop.current + heightDelta;
    shouldRestoreScrollPosition.current = false;
  }, [isLoadingOlderMessages, renderMessages.length]);

  if (!conversation) {
    return (
      <section className="flex flex-1 items-center justify-center bg-surface-base">
        {isLoadingConversations ? (
          <div className="w-full max-w-md rounded-2xl border border-border-ghost bg-surface-card p-8 shadow-card">
            <div className="mx-auto mb-4 h-8 w-8 rounded-lg bg-surface-base animate-pulse" />
            <div className="mx-auto h-4 w-44 rounded bg-surface-base animate-pulse" />
            <div className="mx-auto mt-2 h-3 w-56 rounded bg-surface-base animate-pulse" />
          </div>
        ) : (
          <div className="rounded-2xl border border-border-ghost bg-surface-card p-8 text-center shadow-card">
            <MessageSquare className="mx-auto mb-3 h-8 w-8 text-on-surface-subtle" />
            <p className="text-[14px] font-semibold text-on-surface">Select a conversation</p>
            <p className="mt-1 text-[12px] text-on-surface-muted">Choose a contact to start chatting.</p>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-surface-base">
      <header className="border-b border-border-ghost px-4 py-3 md:px-6">
        <div ref={profileCardRef} className="flex flex-col">
          <div className="flex items-center gap-3">
            {/* Avatar — click to open profile card */}
            <button
              type="button"
              onClick={() => setIsProfileCardOpen((current) => !current)}
              className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-ghost bg-surface-card transition-all hover:border-primary/40"
              aria-label="View contact profile"
            >
              {conversation.avatarUrl ? (
                <img
                  src={conversation.avatarUrl}
                  alt={conversation.contactName ?? conversation.contactPhone ?? conversation.contactId}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <MessageSquare className="h-4 w-4 text-on-surface-subtle" />
              )}
            </button>

            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[15px] font-semibold text-on-surface">
                {conversation.contactName ?? conversation.contactPhone ?? conversation.contactId}
              </h2>
              <p className="text-[11px] text-on-surface-subtle">
                {conversation.assignedTo ? 'Human assigned' : 'AI automation active'}
              </p>
            </div>

            {/* Conversation actions button — moved here from ChatInputActionBar */}
            {onConversationAction ? (
              <div className="relative shrink-0" ref={convMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsConvActionMenuOpen((current) => !current)}
                  className="inline-flex h-11 min-w-11 items-center justify-center rounded-xl border border-border-ghost bg-surface-card text-on-surface-muted hover:border-primary/30 hover:text-primary transition-all active:scale-[0.98]"
                  aria-label="Conversation actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>

                {isConvActionMenuOpen ? (
                  <div className="absolute right-0 top-12 z-30 w-[280px] rounded-2xl border border-border-ghost bg-surface-card p-2 shadow-ambient">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={isRunningConversationAction}
                        onClick={() => {
                          onConversationAction('seen');
                          setIsConvActionMenuOpen(false);
                        }}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border-ghost bg-surface-base px-2 text-[11px] font-semibold text-on-surface hover:border-primary/30 hover:text-primary transition-all disabled:opacity-60"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Mark Seen
                      </button>

                      <button
                        type="button"
                        disabled={isRunningConversationAction}
                        onClick={() => {
                          onConversationAction('unread');
                          setIsConvActionMenuOpen(false);
                        }}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border-ghost bg-surface-base px-2 text-[11px] font-semibold text-on-surface hover:border-primary/30 hover:text-primary transition-all disabled:opacity-60"
                      >
                        <Archive className="h-3.5 w-3.5" />
                        Mark Unread
                      </button>

                      <button
                        type="button"
                        disabled={isRunningConversationAction}
                        onClick={() => {
                          onConversationAction('archive');
                          setIsConvActionMenuOpen(false);
                        }}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border-ghost bg-surface-base px-2 text-[11px] font-semibold text-on-surface hover:border-primary/30 hover:text-primary transition-all disabled:opacity-60"
                      >
                        <Archive className="h-3.5 w-3.5" />
                        Archive
                      </button>

                      <button
                        type="button"
                        disabled={isRunningConversationAction}
                        onClick={() => {
                          onConversationAction('unarchive');
                          setIsConvActionMenuOpen(false);
                        }}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border-ghost bg-surface-base px-2 text-[11px] font-semibold text-on-surface hover:border-primary/30 hover:text-primary transition-all disabled:opacity-60"
                      >
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        Unarchive
                      </button>

                      <button
                        type="button"
                        disabled={isRunningConversationAction}
                        onClick={() => {
                          onConversationAction('typing_start');
                          setIsConvActionMenuOpen(false);
                        }}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border-ghost bg-surface-base px-2 text-[11px] font-semibold text-on-surface hover:border-primary/30 hover:text-primary transition-all disabled:opacity-60"
                      >
                        <Keyboard className="h-3.5 w-3.5" />
                        Typing On
                      </button>

                      <button
                        type="button"
                        disabled={isRunningConversationAction}
                        onClick={() => {
                          onConversationAction('typing_stop');
                          setIsConvActionMenuOpen(false);
                        }}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border-ghost bg-surface-base px-2 text-[11px] font-semibold text-on-surface hover:border-primary/30 hover:text-primary transition-all disabled:opacity-60"
                      >
                        <Keyboard className="h-3.5 w-3.5" />
                        Typing Off
                      </button>

                      <button
                        type="button"
                        disabled={isRunningConversationAction || !hasDraftLink}
                        onClick={() => {
                          onConversationAction('send_link_preview', { text: draft.trim() });
                          setIsConvActionMenuOpen(false);
                        }}
                        className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border-ghost bg-surface-base px-2 text-[11px] font-semibold text-on-surface hover:border-primary/30 hover:text-primary transition-all disabled:opacity-60"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Send Link Preview (from composer text)
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Profile detail card */}
          {isProfileCardOpen ? (
            <div className="mt-3 rounded-2xl border border-border-ghost bg-surface-card p-4 shadow-ambient">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border-ghost bg-surface-base">
                  {conversation.avatarUrl ? (
                    <img
                      src={conversation.avatarUrl}
                      alt={conversation.contactName ?? conversation.contactPhone ?? conversation.contactId}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <User className="h-6 w-6 text-on-surface-subtle" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-on-surface">
                    {conversation.contactName ?? '—'}
                  </p>
                  {conversation.contactPhone ? (
                    <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-on-surface-muted">
                      <Phone className="h-3.5 w-3.5" />
                      {conversation.contactPhone}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-[11px] text-on-surface-subtle">
                    ID: {conversation.contactId}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        conversation.assignedTo ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {conversation.assignedTo ? 'Human assigned' : 'AI active'}
                    </span>
                    {conversation.leadSaved ? (
                      <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                        Lead saved
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsProfileCardOpen(false)}
                  className="shrink-0 rounded-lg p-1 text-on-surface-subtle hover:text-on-surface transition-colors"
                  aria-label="Close profile card"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <div
        ref={scrollContainerRef}
        onScroll={() => {
          const container = scrollContainerRef.current;
          if (!container || !hasMoreMessages || isLoadingOlderMessages || !onLoadOlderMessages) {
            return;
          }

          if (openActionMenuMessageId) {
            setOpenActionMenuMessageId(null);
          }

          if (container.scrollTop <= 120) {
            shouldRestoreScrollPosition.current = true;
            previousScrollHeight.current = container.scrollHeight;
            previousScrollTop.current = container.scrollTop;
            onLoadOlderMessages();
          }
        }}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 md:px-6"
      >
        {isLoading ? (
          <MessageThreadSkeleton />
        ) : renderMessages.length === 0 ? (
          <div className="rounded-2xl border border-border-ghost bg-surface-card px-4 py-5 text-[13px] text-on-surface-muted">
            No message history yet for this contact.
          </div>
        ) : (
          <div className="space-y-3">
            {isLoadingOlderMessages ? (
              <div className="flex items-center justify-center py-1 text-[11px] text-on-surface-subtle">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Loading older messages…
              </div>
            ) : hasMoreMessages ? (
              <div className="py-1 text-center text-[11px] text-on-surface-subtle">
                Scroll up to load older messages
              </div>
            ) : (
              <div className="py-1 text-center text-[11px] text-on-surface-subtle">
                Start of conversation history
              </div>
            )}
            {renderMessages.map((message) => {
              const inbound = message.role === 'user';
              const isOptimistic = message._id.startsWith('optimistic-');
              const deliveryLabel = inbound
                ? null
                : (message.deliveryStatus ?? '').toLowerCase();
              const actionTrigger = onMessageAction ? (
                <button
                  type="button"
                  disabled={isOptimistic || isRunningMessageAction}
                  onClick={() => setOpenActionMenuMessageId((current) => (current === message._id ? null : message._id))}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-ghost bg-surface-card text-on-surface-muted hover:border-primary/30 hover:text-primary transition-all"
                  aria-label="Message actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              ) : null;

              return (
                <div
                  key={message._id}
                  ref={openActionMenuMessageId === message._id ? messageMenuRef : null}
                  className={`flex items-start gap-2 ${inbound ? 'justify-start' : 'justify-end'}`}
                >
                  {!inbound ? actionTrigger : null}
                  <div className="relative">
                    <article
                      className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13px] shadow-card ${
                        inbound
                          ? 'border border-border-ghost bg-surface-card text-on-surface'
                          : 'bg-primary text-on-surface-inverse'
                      }`}
                    >
                      {message.content ? <p className="whitespace-pre-wrap">{message.content}</p> : null}
                      <p
                        className={`mt-1 text-[10px] ${
                          inbound ? 'text-on-surface-subtle' : 'text-on-surface-inverse/80'
                        }`}
                      >
                        {new Date(message.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                        {!inbound && deliveryLabel
                          ? ` · ${deliveryLabel === 'queued' ? 'sending' : deliveryLabel}`
                          : ''}
                      </p>
                    </article>

                    {onMessageAction && openActionMenuMessageId === message._id ? (
                      <div className={`absolute top-12 z-20 w-44 rounded-xl border border-border-ghost bg-surface-card p-2 shadow-ambient ${inbound ? 'left-0' : 'right-0'}`}>
                        <div className="space-y-1">
                          <button
                            type="button"
                            disabled={isRunningMessageAction}
                            onClick={() => {
                              onMessageAction(message, 'reaction', { reaction: '👍' });
                              setOpenActionMenuMessageId(null);
                            }}
                            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-border-ghost bg-surface-base text-[11px] font-semibold text-on-surface hover:border-primary/30 hover:text-primary transition-all disabled:opacity-60"
                          >
                            React 👍
                          </button>
                          <button
                            type="button"
                            disabled={isRunningMessageAction}
                            onClick={() => {
                              onMessageAction(message, 'star');
                              setOpenActionMenuMessageId(null);
                            }}
                            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-border-ghost bg-surface-base text-[11px] font-semibold text-on-surface hover:border-primary/30 hover:text-primary transition-all disabled:opacity-60"
                          >
                            Star
                          </button>
                          <button
                            type="button"
                            disabled={isRunningMessageAction}
                            onClick={() => {
                              onMessageAction(message, 'pin');
                              setOpenActionMenuMessageId(null);
                            }}
                            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-border-ghost bg-surface-base text-[11px] font-semibold text-on-surface hover:border-primary/30 hover:text-primary transition-all disabled:opacity-60"
                          >
                            Pin
                          </button>
                          <button
                            type="button"
                            disabled={isRunningMessageAction}
                            onClick={() => {
                              const editedText = window.prompt('Edit message text', message.content);
                              if (editedText === null) {
                                return;
                              }
                              onMessageAction(message, 'edit', { text: editedText });
                              setOpenActionMenuMessageId(null);
                            }}
                            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-border-ghost bg-surface-base text-[11px] font-semibold text-on-surface hover:border-primary/30 hover:text-primary transition-all disabled:opacity-60"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={isRunningMessageAction}
                            onClick={() => {
                              onMessageAction(message, 'delete');
                              setOpenActionMenuMessageId(null);
                            }}
                            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-border-ghost bg-surface-base text-[11px] font-semibold text-on-surface hover:border-primary/30 hover:text-primary transition-all disabled:opacity-60"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {inbound ? actionTrigger : null}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </section>
  );
}
