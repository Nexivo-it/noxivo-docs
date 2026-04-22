'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Globe,
  KeyRound,
  PencilLine,
  Plus,
  RefreshCcw,
  Save,
  Shield,
  Webhook,
} from 'lucide-react';
import { Badge, WorkspacePanel } from '../../../../components/dashboard-workspace-ui';
import { dashboardApi } from '@/lib/api/dashboard-api';

type WebhookInboxSourceRecord = {
  id: string;
  name: string;
  status: 'active' | 'disabled';
  inboundPath: string;
  outboundUrl: string;
  outboundHeaders: Record<string, string>;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type WebhookInboxSourceFormState = {
  name: string;
  outboundUrl: string;
  inboundSecret: string;
  outboundHeadersJson: string;
};

const defaultWebhookInboxSourceFormState: WebhookInboxSourceFormState = {
  name: '',
  outboundUrl: '',
  inboundSecret: '',
  outboundHeadersJson: '{}',
};

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function buttonClassName({
  emphasized,
  disabled,
}: {
  emphasized: boolean;
  disabled: boolean;
}): string {
  return [
    'h-11 min-w-[44px] rounded-2xl px-4 text-sm font-bold transition-all active:scale-[0.98]',
    emphasized
      ? 'border border-primary/30 bg-primary text-on-surface-inverse shadow-primary-glow hover:bg-primary/90'
      : 'border border-border-ghost bg-surface-base text-on-surface hover:border-primary/30 hover:text-primary',
    disabled ? 'cursor-not-allowed opacity-50 hover:border-border-ghost hover:text-on-surface' : '',
  ].join(' ');
}

function badgeForWebhookSourceStatus(status: WebhookInboxSourceRecord['status']): {
  label: string;
  tone: 'success' | 'warning';
} {
  return status === 'active'
    ? { label: 'Active', tone: 'success' }
    : { label: 'Disabled', tone: 'warning' };
}

export function WebhookInboxSourcesPanel() {
  const [sources, setSources] = useState<WebhookInboxSourceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [updatingSourceId, setUpdatingSourceId] = useState<string | null>(null);
  const [formState, setFormState] = useState<WebhookInboxSourceFormState>(defaultWebhookInboxSourceFormState);

  const activeSource = useMemo(
    () => sources.find((source) => source.id === activeSourceId) ?? null,
    [activeSourceId, sources],
  );

  async function loadSources(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const payload = await dashboardApi.getWebhookInboxSources() as {
        error?: string;
        sources?: WebhookInboxSourceRecord[];
      } | null;

      setSources(Array.isArray(payload?.sources) ? payload.sources : []);
    } catch {
      setError('Failed to load webhook inbox sources');
      setSources([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSources();
  }, []);

  function openCreateModal(): void {
    setActiveSourceId(null);
    setFormState(defaultWebhookInboxSourceFormState);
    setError(null);
    setIsModalOpen(true);
  }

  function openEditModal(source: WebhookInboxSourceRecord): void {
    setActiveSourceId(source.id);
    setFormState({
      name: source.name,
      outboundUrl: source.outboundUrl,
      inboundSecret: '',
      outboundHeadersJson: JSON.stringify(source.outboundHeaders, null, 2),
    });
    setError(null);
    setIsModalOpen(true);
  }

  function closeModal(): void {
    setIsModalOpen(false);
    setActiveSourceId(null);
    setFormState(defaultWebhookInboxSourceFormState);
  }

  async function handleSubmit(event: { preventDefault(): void }): Promise<void> {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    let outboundHeaders: Record<string, string>;
    try {
      const parsedHeaders = JSON.parse(formState.outboundHeadersJson || '{}') as unknown;
      if (!parsedHeaders || typeof parsedHeaders !== 'object' || Array.isArray(parsedHeaders)) {
        setError('Outbound headers must be a JSON object');
        setIsSaving(false);
        return;
      }

      const normalizedEntries = Object.entries(parsedHeaders).map(([key, value]) => {
        if (typeof value !== 'string') {
          throw new Error('Outbound header values must be strings');
        }
        return [key, value] as const;
      });

      outboundHeaders = Object.fromEntries(normalizedEntries);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Outbound headers must be valid JSON');
      setIsSaving(false);
      return;
    }

    const payload: {
      name: string;
      outboundUrl: string;
      outboundHeaders: Record<string, string>;
      inboundSecret?: string;
    } = {
      name: formState.name,
      outboundUrl: formState.outboundUrl,
      outboundHeaders,
    };

    if (formState.inboundSecret.trim().length > 0) {
      payload.inboundSecret = formState.inboundSecret;
    }

    if (!activeSource && !payload.inboundSecret) {
      setError('Inbound secret is required when creating a source');
      setIsSaving(false);
      return;
    }

    try {
      if (activeSource) {
        await dashboardApi.updateWebhookInboxSource(activeSource.id, payload);
      } else {
        await dashboardApi.createWebhookInboxSource({
          ...payload,
          inboundSecret: payload.inboundSecret ?? '',
        });
      }

      await loadSources();
      closeModal();
    } catch {
      setError('Failed to save webhook inbox source');
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleSourceStatus(source: WebhookInboxSourceRecord, status: 'active' | 'disabled'): Promise<void> {
    setUpdatingSourceId(source.id);
    setError(null);

    try {
      await dashboardApi.updateWebhookInboxSource(source.id, { status });

      await loadSources();
    } catch {
      setError('Failed to update webhook inbox source status');
    } finally {
      setUpdatingSourceId(null);
    }
  }

  return (
    <>
      <WorkspacePanel
        title="Webhook Inbox Sources"
        description="Create named webhook inbox channels for website chatbots and external support systems. Each source gets its own inbound key, outbound destination, and tenant-scoped lifecycle."
        delayIndex={2}
        actions={(
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void loadSources()}
              className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-border-ghost bg-surface-base px-4 text-sm font-bold text-on-surface transition-all hover:border-primary/30 hover:text-primary active:scale-[0.98]"
            >
              <RefreshCcw className="size-4" />
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-11 min-w-[44px] items-center gap-2 rounded-2xl border border-primary/30 bg-primary px-4 text-sm font-bold text-on-surface-inverse shadow-primary-glow transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              <Plus className="size-4" />
              Add Source
            </button>
          </div>
        )}
      >
        {error ? (
          <div className="mb-6 rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm font-medium text-error">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-3xl border border-border-ghost bg-surface-base p-10 text-sm text-on-surface-subtle">
            Loading webhook inbox sources…
          </div>
        ) : sources.length === 0 ? (
          <div className="rounded-[2rem] border border-border-ghost bg-surface-base/60 p-8 text-center shadow-card">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-primary-glow">
              <Webhook className="size-5" />
            </div>
            <h3 className="mt-4 text-lg font-bold tracking-tight text-on-surface">No webhook inbox sources yet</h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-on-surface-muted">
              Add a named source to ingest messages from website chat, custom bots, or external support tools without mixing them into the WhatsApp channel.
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-6 inline-flex h-11 min-w-[44px] items-center gap-2 rounded-2xl border border-primary/30 bg-primary px-4 text-sm font-bold text-on-surface-inverse shadow-primary-glow transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              <Plus className="size-4" />
              Create First Source
            </button>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            {sources.map((source) => {
              const statusBadge = badgeForWebhookSourceStatus(source.status);
              const isUpdating = updatingSourceId === source.id;

              return (
                <article
                  key={source.id}
                  className="space-y-5 rounded-[2rem] border border-border-ghost bg-surface-base/40 p-6 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:bg-surface-base/70"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-primary-glow">
                        <Webhook className="size-5" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-base font-bold tracking-tight text-on-surface">{source.name}</h3>
                        <p className="text-sm leading-6 text-on-surface-muted">
                          Tenant-scoped source bound to an outbound delivery endpoint.
                        </p>
                      </div>
                    </div>
                    <Badge label={statusBadge.label} tone={statusBadge.tone} />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border-ghost bg-surface-base/80 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-subtle">Inbound Key</p>
                      <p className="mt-2 break-all text-sm font-semibold text-on-surface">{source.inboundPath}</p>
                    </div>
                    <div className="rounded-2xl border border-border-ghost bg-surface-base/80 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-subtle">Outbound URL</p>
                      <p className="mt-2 break-all text-sm font-semibold text-on-surface">{source.outboundUrl}</p>
                    </div>
                    <div className="rounded-2xl border border-border-ghost bg-surface-base/80 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-subtle">Headers</p>
                      <p className="mt-2 text-sm font-semibold text-on-surface">
                        {Object.keys(source.outboundHeaders).length === 0
                          ? 'No custom headers'
                          : `${Object.keys(source.outboundHeaders).length} configured`}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border-ghost bg-surface-base px-4 py-3 text-xs text-on-surface-muted">
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="inline-flex items-center gap-2">
                        <Globe className="size-3.5" />
                        Updated {formatTimestamp(source.updatedAt)}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <Shield className="size-3.5" />
                        {source.disabledAt ? `Disabled ${formatTimestamp(source.disabledAt)}` : 'Inbound secret stored hashed'}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <button
                      type="button"
                      onClick={() => openEditModal(source)}
                      className="inline-flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-2xl border border-border-ghost bg-surface-base px-4 text-sm font-bold text-on-surface transition-all hover:border-primary/30 hover:text-primary active:scale-[0.98]"
                    >
                      <PencilLine className="size-4" />
                      Edit Source
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleSourceStatus(source, source.status === 'active' ? 'disabled' : 'active')}
                      disabled={isUpdating}
                      className={buttonClassName({
                        emphasized: source.status !== 'active',
                        disabled: isUpdating,
                      })}
                    >
                      {isUpdating
                        ? 'Updating…'
                        : source.status === 'active'
                          ? 'Disable Source'
                          : 'Re-Enable Source'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </WorkspacePanel>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-base/80 px-4 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-[2rem] border border-border-ghost bg-surface-card p-6 md:p-8 shadow-float">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-on-surface-subtle">Webhook Inbox Source</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-on-surface">
                  {activeSource ? 'Update Source' : 'Create Source'}
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-on-surface-muted">
                  Configure a dedicated inbound identity plus the outbound callback destination used when operators reply from the team inbox.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="h-11 w-11 min-w-[44px] rounded-xl border border-border-ghost bg-surface-base text-on-surface-subtle transition-all hover:text-on-surface active:scale-[0.98]"
                aria-label="Close webhook source editor"
              >
                <RefreshCcw className="mx-auto size-4" />
              </button>
            </div>

            <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">Display Name</span>
                <input
                  type="text"
                  required
                  value={formState.name}
                  onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                  className="h-11 min-w-[44px] w-full rounded-xl border border-border-ghost bg-surface-base px-4 text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                  placeholder="Website Chatbot"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">Outbound URL</span>
                <input
                  type="url"
                  required
                  value={formState.outboundUrl}
                  onChange={(event) => setFormState((current) => ({ ...current, outboundUrl: event.target.value }))}
                  className="h-11 min-w-[44px] w-full rounded-xl border border-border-ghost bg-surface-base px-4 text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                  placeholder="https://example.com/webhook/replies"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">
                  Inbound Secret {activeSource ? '(optional for rotation)' : ''}
                </span>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-on-surface-subtle" />
                  <input
                    type="password"
                    required={!activeSource}
                    value={formState.inboundSecret}
                    onChange={(event) => setFormState((current) => ({ ...current, inboundSecret: event.target.value }))}
                    className="h-11 min-w-[44px] w-full rounded-xl border border-border-ghost bg-surface-base pl-10 pr-4 text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                    placeholder={activeSource ? 'Leave blank to keep the current secret' : 'shared-secret'}
                  />
                </div>
                <p className="text-xs text-on-surface-muted">
                  {activeSource
                    ? 'Provide a new secret only when you want to rotate inbound authentication.'
                    : 'This secret is hashed before storage and is never returned by the API.'}
                </p>
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">Outbound Headers (JSON)</span>
                <textarea
                  rows={6}
                  value={formState.outboundHeadersJson}
                  onChange={(event) => setFormState((current) => ({ ...current, outboundHeadersJson: event.target.value }))}
                  className="w-full rounded-xl border border-border-ghost bg-surface-base px-4 py-3 font-mono text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                  placeholder={'{\n  "Authorization": "Bearer token"\n}'}
                />
              </label>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="h-11 min-w-[44px] rounded-xl border border-border-ghost bg-surface-base px-5 text-sm font-bold text-on-surface-subtle transition-all hover:text-on-surface active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="h-11 min-w-[44px] rounded-xl border border-primary/30 bg-primary px-5 text-sm font-bold text-on-surface-inverse shadow-primary-glow transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60"
                >
                  <span className="inline-flex items-center gap-2">
                    <Save className="size-4" />
                    {isSaving ? 'Saving…' : activeSource ? 'Save Source' : 'Create Source'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
