'use client';

import { Copy, Key, RefreshCcw, ToggleLeft, ToggleRight, Webhook } from 'lucide-react';
import { useEffect, useState } from 'react';
import { WorkspacePanel } from '../../../../components/dashboard-workspace-ui';

type WebhookInboxActivationStatus = {
  isActive: boolean;
  webhookUrl: string | null;
  apiKey: string | null;
  activatedAt: string | null;
};

const defaultActivationStatus: WebhookInboxActivationStatus = {
  isActive: false,
  webhookUrl: null,
  apiKey: null,
  activatedAt: null,
};

function formatTimestamp(value: string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function copyToClipboard(text: string): void {
  void navigator.clipboard.writeText(text);
}

export function WebhookInboxActivationPanel() {
  const [status, setStatus] = useState<WebhookInboxActivationStatus>(defaultActivationStatus);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  async function loadStatus(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/settings/webhook-inbox-activation', { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as {
        error?: string;
        isActive?: boolean;
        webhookUrl?: string | null;
        apiKey?: string | null;
        activatedAt?: string | null;
      } | null;

      if (!response.ok) {
        setError(payload?.error ?? 'Failed to load webhook inbox status');
        setStatus(defaultActivationStatus);
        return;
      }

      setStatus({
        isActive: payload?.isActive ?? false,
        webhookUrl: payload?.webhookUrl ?? null,
        apiKey: payload?.apiKey ?? null,
        activatedAt: payload?.activatedAt ?? null,
      });
    } catch {
      setError('Failed to load webhook inbox status');
      setStatus(defaultActivationStatus);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function handleToggleActivation(): Promise<void> {
    if (isSaving) return;

    setIsSaving(true);
    setError(null);

    try {
      const method = status.isActive ? 'DELETE' : 'POST';
      const response = await fetch('/api/settings/webhook-inbox-activation', {
        method,
        headers: { 'Content-Type': 'application/json' },
      });

      const payload = await response.json().catch(() => null) as {
        error?: string;
        isActive?: boolean;
        webhookUrl?: string | null;
        apiKey?: string | null;
        activatedAt?: string | null;
      } | null;

      if (!response.ok) {
        setError(payload?.error ?? 'Failed to update webhook inbox');
        return;
      }

      setStatus({
        isActive: payload?.isActive ?? !status.isActive,
        webhookUrl: payload?.webhookUrl ?? status.webhookUrl,
        apiKey: payload?.apiKey ?? (payload?.isActive ? status.apiKey : null),
        activatedAt: payload?.activatedAt ?? status.activatedAt,
      });
    } catch {
      setError('Failed to update webhook inbox');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRegenerate(): Promise<void> {
    if (isSaving || !status.isActive) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/settings/webhook-inbox-activation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const payload = await response.json().catch(() => null) as {
        error?: string;
        webhookUrl?: string | null;
        apiKey?: string | null;
      } | null;

      if (!response.ok) {
        setError(payload?.error ?? 'Failed to regenerate credentials');
        return;
      }

      setStatus((prev) => ({
        ...prev,
        webhookUrl: payload?.webhookUrl ?? prev.webhookUrl,
        apiKey: payload?.apiKey ?? prev.apiKey,
      }));
    } catch {
      setError('Failed to regenerate credentials');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCopy(field: 'url' | 'key', value: string): void {
    copyToClipboard(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  if (isLoading) {
    return (
      <WorkspacePanel title="Webhook Inbox" description="Receive messages from external chatbots and automations">
        <div className="rounded-3xl border border-border-ghost bg-surface-base p-10 text-sm text-on-surface-subtle">
          Loading…
        </div>
      </WorkspacePanel>
    );
  }

  return (
    <WorkspacePanel
      title="Webhook Inbox"
      description="Receive messages from external chatbots and automations"
      actions={
        <button
          onClick={handleToggleActivation}
          disabled={isSaving}
          className={[
            'flex items-center gap-2 h-11 min-w-[44px] rounded-2xl px-4 text-sm font-bold transition-all active:scale-[0.98]',
            status.isActive
              ? 'border border-success/30 bg-success text-on-surface-inverse shadow-success-glow'
              : 'border border-border-ghost bg-surface-base text-on-surface hover:border-warning/30 hover:text-warning',
            isSaving ? 'cursor-not-allowed opacity-50' : '',
          ].join(' ')}
        >
          {status.isActive ? (
            <>
              <ToggleRight className="w-5 h-5" />
              <span>Active</span>
            </>
          ) : (
            <>
              <ToggleLeft className="w-5 h-5" />
              <span>Enable</span>
            </>
          )}
        </button>
      }
    >
      {error ? (
        <div className="mb-6 rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm font-medium text-error">
          {error}
        </div>
      ) : null}

      {!status.isActive && (
        <div className="flex flex-col items-center justify-center py-12 text-on-surface-secondary">
          <Webhook className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-sm text-center max-w-[280px]">
            Enable webhook inbox to receive messages from external chatbots and automations directly into your team inbox.
          </p>
        </div>
      )}

      {status.isActive && (
        <div className="space-y-6">
          <div className="flex items-center justify-between py-3 border-b border-border-subtle">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                <Webhook className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-sm font-medium text-on-surface">Webhook Inbox</p>
                <p className="text-xs text-on-surface-secondary">
                  Activated {formatTimestamp(status.activatedAt)}
                </p>
              </div>
            </div>
            <button
              onClick={handleRegenerate}
              disabled={isSaving}
              className="flex items-center gap-2 h-9 px-3 rounded-xl text-xs font-medium border border-border-ghost bg-surface-base text-on-surface hover:border-warning/30 hover:text-warning transition-all disabled:opacity-50"
            >
              <RefreshCcw className="w-4 h-4" />
              <span>Regenerate</span>
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-on-surface-secondary uppercase tracking-wider">
                Webhook URL
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 h-12 px-4 rounded-xl border border-border-subtle bg-surface-elevated">
                  <Key className="w-4 h-4 text-on-surface-secondary flex-shrink-0" />
                  <code className="flex-1 font-mono text-sm text-on-surface truncate">
                    {status.webhookUrl}
                  </code>
                </div>
                <button
                  onClick={() => handleCopy('url', status.webhookUrl ?? '')}
                  className="h-12 w-12 rounded-xl border border-border-ghost bg-surface-base text-on-surface hover:text-primary transition-all flex items-center justify-center"
                >
                  {copiedField === 'url' ? (
                    <span className="text-xs text-success">✓</span>
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-on-surface-secondary uppercase tracking-wider">
                API Key
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 h-12 px-4 rounded-xl border border-border-subtle bg-surface-elevated">
                  <Key className="w-4 h-4 text-on-surface-secondary flex-shrink-0" />
                  <code className="flex-1 font-mono text-sm text-on-surface truncate">
                    {status.apiKey}
                  </code>
                </div>
                <button
                  onClick={() => handleCopy('key', status.apiKey ?? '')}
                  className="h-12 w-12 rounded-xl border border-border-ghost bg-surface-base text-on-surface hover:text-primary transition-all flex items-center justify-center"
                >
                  {copiedField === 'key' ? (
                    <span className="text-xs text-success">✓</span>
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-surface-subtle border border-border-subtle">
            <p className="text-xs font-medium text-on-surface mb-2">How to use</p>
            <pre className="text-xs text-on-surface-secondary font-mono whitespace-pre-wrap">
{`curl -X POST "https://your-domain${status.webhookUrl}" \\
  -H "Authorization: Bearer ${status.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hi, I want to book", "contactPhone": "+1234567890"}'`}
            </pre>
          </div>
        </div>
      )}
    </WorkspacePanel>
  );
}