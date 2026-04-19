'use client';

import { MessageSquareDashed, RefreshCcw, Search, UserRound } from 'lucide-react';
import type { ChatSummary, InboxConversationChannel } from './types';

type SourceFilterValue = 'all' | InboxConversationChannel;
type StatusFilterValue = 'active' | 'archived' | 'all' | 'open' | 'assigned' | 'handoff' | 'resolved' | 'closed' | 'deleted';

type VisibleInboxFilter = 'all' | 'whatsapp' | 'webhook' | 'archived';

interface ChatListProps {
  chats: ChatSummary[];
  selectedConversationId: string | null;
  liveConversationIds?: string[];
  searchQuery: string;
  sourceFilter: SourceFilterValue;
  statusFilter: StatusFilterValue;
  isLoading: boolean;
  onSearchQueryChange: (value: string) => void;
  onSourceFilterChange: (value: SourceFilterValue) => void;
  onStatusFilterChange: (value: StatusFilterValue) => void;
  onSelectConversation: (conversationId: string) => void;
  onRefresh: () => void;
}

function formatChannelLabel(channel: InboxConversationChannel | undefined): string {
  if (channel === 'webhook') {
    return 'Webhook';
  }
  if (channel === 'whatsapp') {
    return 'WhatsApp';
  }
  return 'Unknown';
}

function channelBadgeClass(channel: InboxConversationChannel | undefined): string {
  if (channel === 'webhook') {
    return 'bg-secondary/10 text-secondary';
  }
  if (channel === 'whatsapp') {
    return 'bg-primary/10 text-primary';
  }
  return 'bg-surface-card text-on-surface-subtle';
}

function visibleFilterFromState(sourceFilter: SourceFilterValue, statusFilter: StatusFilterValue): VisibleInboxFilter {
  if (statusFilter === 'archived') {
    return 'archived';
  }
  if (sourceFilter === 'whatsapp' || sourceFilter === 'webhook') {
    return sourceFilter;
  }
  return 'all';
}

function applyVisibleFilter(
  filter: VisibleInboxFilter,
  onSourceFilterChange: (value: SourceFilterValue) => void,
  onStatusFilterChange: (value: StatusFilterValue) => void
): void {
  if (filter === 'archived') {
    onSourceFilterChange('all');
    onStatusFilterChange('archived');
    return;
  }

  onStatusFilterChange('active');
  onSourceFilterChange(filter === 'all' ? 'all' : filter);
}

function filterButtonClassName(active: boolean): string {
  return [
    'inline-flex h-11 min-w-[44px] items-center justify-center rounded-xl border px-3 text-[11px] font-semibold transition-all active:scale-[0.98]',
    active
      ? 'border-primary/30 bg-primary/10 text-primary shadow-primary-glow'
      : 'border-border-ghost bg-surface-base text-on-surface-muted hover:border-primary/30 hover:text-primary'
  ].join(' ');
}

function formatSourceSecondaryLabel(chat: ChatSummary): string | null {
  if (chat.channel === 'webhook') {
    return chat.sourceName?.trim() ? chat.sourceName.trim() : 'Webhook source';
  }
  if (chat.channel === 'whatsapp') {
    return chat.contactPhone?.trim() ? chat.contactPhone.trim() : 'WhatsApp thread';
  }
  return null;
}

function formatPreviewTime(value: string | null): string {
  if (!value) {
    return 'New';
  }

  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function ChatListSkeleton() {
  return (
    <div className="space-y-1 p-2">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={`chat-skeleton-${index}`}
          className="flex items-start gap-3 rounded-xl border border-border-ghost bg-surface-base px-3 py-3"
        >
          <div className="h-11 w-11 shrink-0 rounded-xl bg-surface-card animate-pulse" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="h-3.5 w-32 rounded bg-surface-card animate-pulse" />
              <div className="h-3 w-10 rounded bg-surface-card animate-pulse" />
            </div>
            <div className="h-3 w-11/12 rounded bg-surface-card animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function getAvatarInitials(chat: ChatSummary): string {
  const label = (chat.contactName ?? chat.contactPhone ?? chat.contactId).trim();
  if (!label) {
    return '?';
  }

  const words = label.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return label.slice(0, 2).toUpperCase();
  }

  if (words.length === 1) {
    return words[0]?.slice(0, 2).toUpperCase() ?? '?';
  }

  return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
}

export function ChatList({
  chats,
  selectedConversationId,
  liveConversationIds = [],
  searchQuery,
  sourceFilter,
  statusFilter,
  isLoading,
  onSearchQueryChange,
  onSourceFilterChange,
  onStatusFilterChange,
  onSelectConversation,
  onRefresh
}: ChatListProps) {
  const liveConversationIdSet = new Set(liveConversationIds);
  const activeFilter = visibleFilterFromState(sourceFilter, statusFilter);

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-r border-border-ghost bg-surface-section glass-panel rounded-none md:w-[360px] md:rounded-l-2xl md:border-r">
      <div className="p-4 border-b border-border-ghost space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-on-surface">Team Inbox</h1>
          <button
            type="button"
            onClick={onRefresh}
            className="h-11 w-11 rounded-xl border border-border-ghost bg-surface-card text-on-surface-muted hover:text-primary hover:border-primary/30 transition-all active:scale-[0.98] flex items-center justify-center"
            aria-label="Refresh conversations"
          >
            <RefreshCcw className="h-4 w-4" />
          </button>
        </div>

        <label className="relative block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-subtle" />
          <input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search contacts..."
            className="h-11 w-full rounded-xl border border-border-ghost bg-surface-base pl-10 pr-3 text-[13px] text-on-surface placeholder:text-on-surface-subtle focus:outline-none focus:border-primary/40"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          {(['all', 'whatsapp', 'webhook', 'archived'] as VisibleInboxFilter[]).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => applyVisibleFilter(filter, onSourceFilterChange, onStatusFilterChange)}
              className={filterButtonClassName(activeFilter === filter)}
            >
              {filter === 'all'
                ? 'All'
                : filter === 'whatsapp'
                  ? 'WhatsApp'
                  : filter === 'webhook'
                    ? 'Webhook'
                    : 'Archived'}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <ChatListSkeleton />
        ) : chats.length === 0 ? (
          <div className="p-5">
            <div className="rounded-2xl border border-border-ghost bg-surface-base px-4 py-5 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-border-ghost bg-surface-card text-on-surface-subtle">
                <MessageSquareDashed className="h-4 w-4" />
              </div>
              <p className="text-[13px] font-semibold text-on-surface">No conversations found</p>
              <p className="mt-1 text-[12px] leading-5 text-on-surface-muted">
                No conversations match your filters. Try changing source or status.
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={onRefresh}
                  className="inline-flex h-11 items-center rounded-xl border border-border-ghost bg-surface-card px-3 text-[12px] font-semibold text-on-surface hover:border-primary/30 hover:text-primary transition-all active:scale-[0.98]"
                >
                  Refresh
                </button>
                <a
                  href="/dashboard/settings"
                  className="inline-flex h-11 items-center rounded-xl border border-border-ghost bg-surface-base px-3 text-[12px] font-semibold text-on-surface-muted hover:border-primary/30 hover:text-primary transition-all"
                >
                  WhatsApp Linkage
                </a>
              </div>
            </div>
          </div>
        ) : (
          chats.map((chat) => {
            const isActive = chat._id === selectedConversationId;
            const isLive = liveConversationIdSet.has(chat._id) || chat.unreadCount > 0;
            return (
              <button
                key={chat._id}
                type="button"
                onClick={() => onSelectConversation(chat._id)}
                className={`w-full border-b border-border-ghost px-4 py-3 text-left transition-all ${
                  isActive
                    ? 'bg-surface-card'
                    : 'bg-transparent hover:bg-surface-base'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border ${isActive ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border-ghost bg-surface-card text-on-surface-muted'}`}>
                    {chat.avatarUrl ? (
                      <img
                        src={chat.avatarUrl}
                        alt={chat.contactName ?? chat.contactPhone ?? chat.contactId}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : chat.contactName || chat.contactPhone ? (
                      <span className="text-[11px] font-semibold tracking-wide">
                        {getAvatarInitials(chat)}
                      </span>
                    ) : (
                      <UserRound className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-on-surface">
                          {chat.contactName ?? chat.contactPhone ?? chat.contactId}
                        </p>
                        {isLive ? (
                          <span className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400">
                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                            Live
                          </span>
                        ) : null}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${channelBadgeClass(chat.channel)}`}>
                            {chat.sourceLabel ?? formatChannelLabel(chat.channel)}
                          </span>
                          {chat.isArchived ? (
                            <span className="inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-warning">
                              Archived
                            </span>
                          ) : null}
                          {formatSourceSecondaryLabel(chat) ? (
                            <span className="truncate text-[10px] text-on-surface-subtle">
                              {formatSourceSecondaryLabel(chat)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <p className="shrink-0 text-[11px] text-on-surface-subtle">
                        {formatPreviewTime(chat.lastMessage?.createdAt ?? null)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="line-clamp-1 text-[12px] text-on-surface-muted">
                        {chat.lastMessage?.content ?? 'No messages yet'}
                      </p>
                      {chat.unreadCount > 0 ? (
                        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-on-surface-inverse">
                          {chat.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
