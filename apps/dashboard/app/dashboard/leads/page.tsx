'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCcw, Search, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';

type LeadSummary = {
  contactId: string;
  contactName: string | null;
  contactPhone: string | null;
  totalMessages: number;
  inboundMessages: number;
  outboundMessages: number;
  firstSeenAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  conversationId: string | null;
  conversationStatus: string | null;
  avatarUrl: string | null;
};

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Not available';
  }

  return new Date(value).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadLeads(options: { silent?: boolean } = {}): Promise<void> {
    if (!options.silent) {
      setIsLoading(true);
    }

    try {
      const searchParams = new URLSearchParams();
      if (query.trim().length > 0) {
        searchParams.set('query', query.trim());
      }

      const response = await fetch(`/api/team-inbox/leads?${searchParams.toString()}`);
      const payload = await parseJsonSafe<LeadSummary[] | { error?: string }>(response);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error((payload as { error?: string } | null)?.error ?? 'Unable to load leads');
      }

      setLeads(payload);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load leads');
    } finally {
      if (!options.silent) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadLeads();
    }, 180);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function handleRemoveLead(lead: LeadSummary): Promise<void> {
    if (!lead.conversationId || isRemoving) {
      return;
    }

    setIsRemoving(lead.contactId);
    try {
      const response = await fetch(`/api/team-inbox/${lead.conversationId}/lead`, {
        method: 'DELETE'
      });
      const payload = await parseJsonSafe<{ success?: boolean; error?: string }>(response);

      if (!response.ok || payload?.success !== true) {
        throw new Error(payload?.error ?? 'Unable to remove lead');
      }

      setLeads((current) => current.filter((item) => item.contactId !== lead.contactId));
      toast.success('Lead removed');
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : 'Unable to remove lead');
    } finally {
      setIsRemoving(null);
    }
  }

  return (
    <div className="mx-auto h-[calc(100vh-5rem)] w-full max-w-[1600px] px-4 pb-8 pt-4 md:px-6">
      <section className="h-full overflow-hidden rounded-2xl border border-border-ghost bg-surface-base shadow-ambient">
        <header className="border-b border-border-ghost px-4 py-4 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-on-surface">Leads</h1>
              <p className="mt-1 text-[12px] text-on-surface-muted">
                Saved contacts from Team Inbox.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadLeads()}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border-ghost bg-surface-card text-on-surface-muted hover:border-primary/30 hover:text-primary transition-all"
              aria-label="Refresh leads"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>
          </div>

          <label className="relative mt-3 block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-subtle" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search leads..."
              className="h-11 w-full rounded-xl border border-border-ghost bg-surface-section pl-10 pr-3 text-[13px] text-on-surface placeholder:text-on-surface-subtle focus:outline-none focus:border-primary/40"
            />
          </label>
        </header>

        <div className="h-[calc(100%-136px)] overflow-y-auto p-4 md:p-6">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={`lead-skeleton-${index}`}
                  className="rounded-2xl border border-border-ghost bg-surface-section p-4"
                >
                  <div className="h-4 w-36 rounded bg-surface-card animate-pulse" />
                  <div className="mt-3 h-3 w-44 rounded bg-surface-card animate-pulse" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-[12px] text-error">
              {error}
            </div>
          ) : leads.length === 0 ? (
            <div className="rounded-2xl border border-border-ghost bg-surface-section px-4 py-6 text-center">
              <p className="text-[13px] font-semibold text-on-surface">No saved leads yet</p>
              <p className="mt-1 text-[12px] text-on-surface-muted">
                Open a conversation and use “Save Lead”.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {leads.map((lead) => (
                <article
                  key={lead.contactId}
                  className="rounded-2xl border border-border-ghost bg-surface-section p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-ghost bg-surface-card">
                        {lead.avatarUrl ? (
                          <img
                            src={lead.avatarUrl}
                            alt={lead.contactName ?? lead.contactPhone ?? lead.contactId}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <UserRound className="h-4 w-4 text-on-surface-subtle" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-on-surface">
                          {lead.contactName ?? lead.contactPhone ?? lead.contactId}
                        </p>
                        <p className="truncate text-[12px] text-on-surface-muted">
                          {lead.contactPhone ?? lead.contactId}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={
                          lead.conversationId
                            ? `/dashboard/conversations?conversation=${encodeURIComponent(lead.conversationId)}`
                            : '/dashboard/conversations'
                        }
                        className="inline-flex h-11 items-center rounded-xl border border-border-ghost bg-surface-card px-3 text-[11px] font-semibold text-on-surface-muted hover:border-primary/30 hover:text-primary"
                      >
                        Open Chat
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleRemoveLead(lead)}
                        disabled={!lead.conversationId || isRemoving === lead.contactId}
                        className="inline-flex h-11 items-center gap-1 rounded-xl border border-border-ghost bg-surface-card px-3 text-[11px] font-semibold text-on-surface-muted hover:border-error/40 hover:text-error disabled:opacity-60"
                      >
                        {isRemoving === lead.contactId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Remove
                      </button>
                    </div>
                  </div>

                  <dl className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-on-surface-muted md:grid-cols-4">
                    <div>
                      <dt className="text-on-surface-subtle">Messages</dt>
                      <dd className="text-on-surface">{lead.totalMessages}</dd>
                    </div>
                    <div>
                      <dt className="text-on-surface-subtle">Inbound</dt>
                      <dd className="text-on-surface">{lead.inboundMessages}</dd>
                    </div>
                    <div>
                      <dt className="text-on-surface-subtle">Outbound</dt>
                      <dd className="text-on-surface">{lead.outboundMessages}</dd>
                    </div>
                    <div>
                      <dt className="text-on-surface-subtle">Last outbound</dt>
                      <dd className="text-on-surface">{formatDateTime(lead.lastOutboundAt)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
