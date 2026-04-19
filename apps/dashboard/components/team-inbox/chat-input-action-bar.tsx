'use client';

import { Loader2, PauseCircle, PlayCircle, SendHorizonal } from 'lucide-react';
import type { ChatSummary } from './types';

interface ChatInputActionBarProps {
  conversation: ChatSummary | null;
  draft: string;
  isSending: boolean;
  isMutatingHandoff: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onPauseAiAndJoin: () => void;
  onReturnToAi: () => void;
}

export function ChatInputActionBar({
  conversation,
  draft,
  isSending,
  isMutatingHandoff,
  onDraftChange,
  onSend,
  onPauseAiAndJoin,
  onReturnToAi
}: ChatInputActionBarProps) {
  const isReturnToAi = conversation?.status === 'handoff' || Boolean(conversation?.assignedTo);
  const isArchivedConversation = conversation?.status === 'closed' || conversation?.status === 'deleted';
  const isMessagingConversation = conversation?.channel === 'whatsapp' || conversation?.channel === undefined;
  const sendDisabled = !conversation
    || isSending
    || draft.trim().length === 0
    || isArchivedConversation
    || !isMessagingConversation;

  return (
    <footer className="border-t border-border-ghost bg-surface-section/70 px-4 py-3 md:px-6">
      <div className="mb-3 flex items-center gap-2">
        {conversation && isMessagingConversation && !isArchivedConversation ? (
          isReturnToAi ? (
            <button
              type="button"
              onClick={onReturnToAi}
              disabled={isMutatingHandoff}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-border-ghost bg-surface-card px-4 text-[12px] font-semibold text-on-surface hover:border-primary/30 hover:text-primary transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {isMutatingHandoff ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              Return to AI
            </button>
          ) : (
            <button
              type="button"
              onClick={onPauseAiAndJoin}
              disabled={isMutatingHandoff}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 text-[12px] font-semibold text-primary hover:bg-primary/15 transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {isMutatingHandoff ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
              Pause AI &amp; Join Chat
            </button>
          )
        ) : null}
      </div>

      <div className="flex items-end gap-3">
        <textarea
          rows={2}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (!sendDisabled) {
                onSend();
              }
            }
          }}
          placeholder={!conversation
            ? 'Select a conversation to send a message'
            : isArchivedConversation
              ? 'Archived conversation is read-only'
              : !isMessagingConversation
                ? 'Direct reply is only available for WhatsApp conversations'
                : 'Type a message...'}
          disabled={!conversation || isArchivedConversation || !isMessagingConversation}
          className="min-h-[44px] w-full resize-none rounded-2xl border border-border-ghost bg-surface-base px-3 py-2.5 text-[13px] text-on-surface placeholder:text-on-surface-subtle focus:outline-none focus:border-primary/40 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={sendDisabled}
          className="h-11 min-w-11 rounded-xl bg-primary px-3 text-on-surface-inverse transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          aria-label="Send message"
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
        </button>
      </div>
    </footer>
  );
}
