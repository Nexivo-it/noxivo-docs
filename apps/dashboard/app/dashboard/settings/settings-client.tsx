'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Eye,
  EyeOff,
  Globe,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Webhook,
  Zap,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Badge,
  WorkspaceHeader,
  WorkspacePanel,
} from '../../../components/dashboard-workspace-ui';
import { toast } from 'sonner';
import { dashboardApi } from '@/lib/api/dashboard-api';
import {
  getQrPollIntervalMs,
  mapPairingSnapshotToUi,
  type QrPairingState,
} from './qr-state';

type QRStatus = 'loading' | QrPairingState;

type ConnectedProfile = Record<string, unknown>;
type ConnectedDiagnostics = Record<string, unknown>;
type SessionPostAction = 'login' | 'regenerate';

interface QRState {
  status: QRStatus;
  reason: string | null;
  poll: boolean;
  qrValue: string | null;
  error: string | null;
  sessionName: string | null;
  profile: ConnectedProfile | null;
  diagnostics: ConnectedDiagnostics | null;
  syncedAt: string | null;
}

interface FetchQrResult {
  ok: boolean;
  status: QRStatus | null;
  error: string | null;
}

interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  lastTriggeredAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readIdentifier(value: unknown): string | null {
  const asString = readString(value);

  if (asString) {
    return asString;
  }

  if (!isRecord(value)) {
    return null;
  }

  const user = readString(value.user);
  const server = readString(value.server);

  if (user && server) {
    return `${user}@${server}`;
  }

  return user ?? server;
}

function readDateCandidate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const asString = readString(value);
  if (!asString) {
    return null;
  }

  const numericValue = Number(asString);
  if (Number.isFinite(numericValue) && asString.trim() !== '') {
    return readDateCandidate(numericValue);
  }

  const date = new Date(asString);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function firstDateCandidate(...values: unknown[]): string | null {
  for (const value of values) {
    const parsed = readDateCandidate(value);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function resolveConnectedProfile(data: Record<string, unknown>): ConnectedProfile | null {
  if (isRecord(data.profile)) {
    return data.profile;
  }

  if (isRecord(data.diagnostics) && isRecord(data.diagnostics.me)) {
    return data.diagnostics.me;
  }

  const hasInlineProfileData = [
    'displayName',
    'name',
    'pushName',
    'profileName',
    'phone',
    'phoneNumber',
    'wid',
  ].some((key) => key in data);

  return hasInlineProfileData ? data : null;
}

function getConnectedProfileDisplayName(profile: ConnectedProfile | null): string | null {
  if (!profile) {
    return null;
  }

  return readString(profile.displayName)
    ?? readString(profile.name)
    ?? readString(profile.pushName)
    ?? readString(profile.profileName)
    ?? readString(profile.shortName)
    ?? readString(profile.notifyName);
}

function getConnectedProfileIdentifier(profile: ConnectedProfile | null): string | null {
  if (!profile) {
    return null;
  }

  const rawIdentifier = readString(profile.phoneNumber)
    ?? readString(profile.phone)
    ?? readString(profile.number)
    ?? readString(profile.user)
    ?? readIdentifier(profile.wid)
    ?? readString(profile.id);

  if (!rawIdentifier) {
    return null;
  }

  const [userPart] = rawIdentifier.split('@');
  return userPart && /^\+?[0-9]+$/.test(userPart) ? userPart : rawIdentifier;
}

function getConnectedProfilePicture(profile: ConnectedProfile | null): string | null {
  if (!profile) {
    return null;
  }

  return readString(profile.picture)
    ?? readString(profile.profilePicture)
    ?? readString(profile.profilePicUrl)
    ?? readString(profile.avatarUrl)
    ?? readString(profile.imageUrl)
    ?? readString(profile.imgUrl);
}

function getConnectionStatusLabel(status: QRStatus, diagnostics: ConnectedDiagnostics | null): string {
  const rawStatus = diagnostics ? readString(diagnostics.status) : null;

  if (rawStatus) {
    return rawStatus;
  }

  const fallbackLabels: Record<QRStatus, string> = {
    connected: 'WORKING',
    qr_ready: 'SCAN_QR_CODE',
    preparing: 'CONNECTING',
    loading: 'LOADING',
    unlinked: 'UNLINKED',
    failed: 'ERROR',
  };

  return fallbackLabels[status];
}

function getConnectedProfileTimestamp(
  profile: ConnectedProfile | null,
  diagnostics: ConnectedDiagnostics | null,
  syncedAt: string | null
): string | null {
  const diagnosticsMe = diagnostics && isRecord(diagnostics.me) ? diagnostics.me : null;

  const profileTimestamp = profile
    ? firstDateCandidate(
      profile.lastSeenAt,
      profile.lastActiveAt,
      profile.connectedAt,
      profile.updatedAt,
      profile.createdAt,
      profile.timestamp,
      profile.lastSeen,
      profile.lastActivity
    )
    : null;

  if (profileTimestamp) {
    return profileTimestamp;
  }

  const diagnosticsTimestamp = diagnostics
    ? firstDateCandidate(
      diagnostics.lastSeenAt,
      diagnostics.lastActiveAt,
      diagnostics.updatedAt,
      diagnostics.timestamp,
      diagnostics.checkedAt,
      diagnosticsMe?.lastSeenAt,
      diagnosticsMe?.lastActiveAt,
      diagnosticsMe?.updatedAt,
      diagnosticsMe?.createdAt,
      diagnosticsMe?.timestamp
    )
    : null;

  return diagnosticsTimestamp ?? syncedAt;
}

function formatConnectedTimestamp(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getInitials(value: string | null): string {
  if (!value) {
    return 'WA';
  }

  const initials = value
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return initials || 'WA';
}

export function SettingsClient() {
  const [showApiKey, setShowApiKey] = useState(false);
  const [isRefreshingQr, setIsRefreshingQr] = useState(false);
  const [isRevokingSession, setIsRevokingSession] = useState(false);
  const [profileImageFailed, setProfileImageFailed] = useState(false);

  // Developer API State
  const [apiKeyState, setApiApiKey] = useState<string | null>(null);
  const [isApiEnabled, setIsApiEnabled] = useState(false);
  const [isTogglingApi, setIsTogglingApi] = useState(false);

  // Webhook State
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookConfig | null>(null);
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [qrState, setQrState] = useState<QRState>({
    status: 'loading',
    reason: null,
    poll: false,
    qrValue: null,
    error: null,
    sessionName: null,
    profile: null,
    diagnostics: null,
    syncedAt: null,
  });

  const fetchQR = async (
    mode: 'initial' | 'manual' | 'background' = 'manual'
  ): Promise<FetchQrResult> => {
    const isManualRefresh = mode === 'manual';
    const shouldShowLoading = mode === 'initial';

    if (shouldShowLoading) {
      setQrState({
        status: 'loading',
        reason: null,
        poll: false,
        qrValue: null,
        error: null,
        sessionName: null,
        profile: null,
        diagnostics: null,
        syncedAt: null,
      });
    } else {
      if (isManualRefresh) {
        setIsRefreshingQr(true);
      }

      setQrState((prev) => ({ ...prev, error: null }));
    }

    try {
      const payload = await dashboardApi.getSettingsQr();
      const data = isRecord(payload) ? payload : {};
      const snapshot = mapPairingSnapshotToUi(data);
      const sessionName = readString(data.sessionName);
      const error = readString(data.error);
      const profile = resolveConnectedProfile(data);
      const diagnostics = isRecord(data.diagnostics) ? data.diagnostics : null;
      const syncedAt = readDateCandidate(data.syncedAt ?? data.snapshotAt ?? data.fetchedAt);

      const stateError = snapshot.state === 'failed'
        ? (error ?? 'Unable to recover WhatsApp pairing state')
        : null;

      setQrState({
        status: snapshot.state,
        reason: snapshot.reason,
        poll: snapshot.poll,
        qrValue: snapshot.qrValue,
        error: snapshot.state === 'unlinked' ? null : stateError,
        sessionName,
        profile,
        diagnostics,
        syncedAt,
      });

      return { ok: true, status: snapshot.state, error: stateError };
    } catch (error) {
      const requestError = error instanceof Error ? error.message : 'Network error';
      setQrState((prev) => ({
        status: prev.status === 'connected' ? 'connected' : 'failed',
        reason: prev.status === 'connected' ? prev.reason : 'network_error',
        poll: false,
        qrValue: prev.qrValue,
        error: prev.status === 'connected' ? prev.error ?? requestError : requestError,
        sessionName: prev.sessionName,
        profile: prev.profile,
        diagnostics: prev.diagnostics,
        syncedAt: prev.syncedAt,
      }));
      return {
        ok: false,
        status: null,
        error: requestError
      };
    } finally {
      if (isManualRefresh) {
        setIsRefreshingQr(false);
      }
    }
  };

  const handleRefreshSessionStatus = async () => {
    const toastId = toast.loading('Refreshing WhatsApp status...');
    const refreshResult = await fetchQR('manual');

    if (!refreshResult.ok) {
      toast.error(refreshResult.error ?? 'Failed to refresh WhatsApp status', { id: toastId });
      return;
    }

    if (refreshResult.status === 'connected') {
      toast.success('WhatsApp is connected and synced.', { id: toastId });
      return;
    }

    if (refreshResult.status === 'qr_ready') {
      toast.success('QR code is ready to scan.', { id: toastId });
      return;
    }

    if (refreshResult.status === 'preparing') {
      toast.message('Session is provisioning. QR will appear shortly.', { id: toastId });
      return;
    }

    toast.success('Status refreshed.', { id: toastId });
  };

  const handleSessionPostAction = async (action: SessionPostAction) => {
    const isLoginAction = action === 'login';
    const previousState = qrState;
    const toastId = toast.loading(isLoginAction ? 'Starting WhatsApp login...' : 'Regenerating QR code...');
    setIsRefreshingQr(true);
    setQrState((prev) => ({
      ...prev,
      status: 'preparing',
      reason: 'startup_in_progress',
      poll: true,
      qrValue: null,
      error: null,
    }));

    try {
      await dashboardApi.updateSettingsQr({ action });

      const refreshed = await fetchQR('background');
      if (!refreshed.ok) {
        setQrState({
          ...previousState,
          error: refreshed.error ?? previousState.error,
        });
        toast.error(refreshed.error ?? 'Action completed, but status refresh failed', { id: toastId });
        return;
      }

      if (refreshed.status === 'qr_ready') {
        toast.success(
          isLoginAction
            ? 'Login QR is ready. Scan it in WhatsApp to connect.'
            : 'Fresh QR code generated. Scan it in WhatsApp to continue.',
          { id: toastId }
        );
        return;
      }

      if (refreshed.status === 'connected') {
        toast.success(isLoginAction ? 'WhatsApp is already connected.' : 'WhatsApp stayed connected.', { id: toastId });
        return;
      }

      if (refreshed.status === 'preparing') {
        toast.message(
          isLoginAction
            ? 'Secure login is starting. QR will appear shortly.'
            : 'A fresh QR token is being prepared.',
          { id: toastId }
        );
        return;
      }

      toast.success(isLoginAction ? 'WhatsApp login started.' : 'QR code regenerated.', { id: toastId });
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : isLoginAction
          ? 'Failed to start WhatsApp login'
          : 'Failed to regenerate QR code';
      setQrState({
        ...previousState,
        error: errorMessage
      });
      toast.error(errorMessage, { id: toastId });
    } finally {
      setIsRefreshingQr(false);
    }
  };

  const handleLogoutSession = async () => {
    const toastId = toast.loading('Logging out from WhatsApp...');
    setIsRevokingSession(true);
    setQrState((prev) => ({ ...prev, error: null }));

    try {
      await dashboardApi.deleteSettingsQr();

      const refreshed = await fetchQR('background');
      if (!refreshed.ok) {
        toast.error(refreshed.error ?? 'Logged out, but status refresh failed', { id: toastId });
        return;
      }

      toast.success('WhatsApp session logged out.', { id: toastId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to log out of WhatsApp';
      setQrState((prev) => ({
        ...prev,
        error: errorMessage
      }));
      toast.error(errorMessage, { id: toastId });
    } finally {
      setIsRevokingSession(false);
    }
  };

  useEffect(() => {
    void fetchQR('initial');
    void fetchApiKey();
  }, []);

  const fetchApiKey = async () => {
    try {
      const payload = await dashboardApi.getSettingsDeveloperApi();
      const data = isRecord(payload) ? payload : {};
      if (typeof data.key === 'string' && data.key.length > 0) {
        setApiApiKey(data.key);
        setIsApiEnabled(true);
      } else {
        setApiApiKey(null);
        setIsApiEnabled(false);
      }
    } catch (err) {
      console.error('Failed to fetch API key:', err);
    }
  };

  const handleToggleApi = async () => {
    const action = isApiEnabled ? 'DELETE' : 'POST';
    const toastId = toast.loading(isApiEnabled ? 'Revoking API access...' : 'Enabling Developer API...');
    setIsTogglingApi(true);

    try {
      const payload = await dashboardApi.updateSettingsDeveloperApi(action);
      const data = isRecord(payload) ? payload : {};

      if (action === 'POST') {
        setApiApiKey(typeof data.key === 'string' ? data.key : null);
        setIsApiEnabled(true);
        toast.success('Developer API enabled! You can now use your secret key.', { id: toastId });
      } else {
        setApiApiKey(null);
        setIsApiEnabled(false);
        toast.success('Developer API access revoked.', { id: toastId });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update API status', { id: toastId });
    } finally {
      setIsTogglingApi(false);
    }
  };

  const fetchWebhooks = async () => {
    setIsLoadingWebhooks(true);
    try {
      const data = await dashboardApi.listAgencyWebhooks<WebhookConfig>();
      setWebhooks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch webhooks:', err);
    } finally {
      setIsLoadingWebhooks(false);
    }
  };

  const saveWebhook = async (webhook: Partial<WebhookConfig> & { name: string; url: string; events: string[] }) => {
    setIsSavingWebhook(true);
    try {
      const method = webhook.id && !webhook.id.includes('new') ? 'PUT' : 'POST';
      const payload = {
        ...webhook,
        isActive: webhook.isActive ?? true,
        secret: '',
      };

      if (method === 'PUT' && webhook.id) {
        await dashboardApi.updateAgencyWebhook(webhook.id, payload);
      } else {
        await dashboardApi.createAgencyWebhook(payload);
      }
      
      toast.success(webhook.id && !webhook.id.includes('new') ? 'Webhook updated!' : 'Webhook created!');
      setShowWebhookModal(false);
      setEditingWebhook(null);
      fetchWebhooks();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save webhook';
      toast.error(message);
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const deleteWebhook = async (webhookId: string) => {
    if (!confirm('Delete this webhook?')) return;
    
    try {
      await dashboardApi.deleteAgencyWebhook(webhookId);
      toast.success('Webhook deleted');
      fetchWebhooks();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete';
      toast.error(message);
    }
  };

  useEffect(() => {
    if (qrState.status === 'loading') {
      return;
    }

    const intervalMs = getQrPollIntervalMs({
      state: qrState.status,
      reason: qrState.reason,
      poll: qrState.poll,
      qrValue: qrState.qrValue,
    });

    if (!intervalMs) {
      return;
    }

    const interval = window.setInterval(() => {
      void fetchQR('background');
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [qrState.status, qrState.reason, qrState.poll, qrState.qrValue]);

  useEffect(() => {
    setProfileImageFailed(false);
  }, [qrState.profile]);

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const isMessagingProviderConnected = qrState.status === 'connected';
  const connectedDisplayName = getConnectedProfileDisplayName(qrState.profile);
  const connectedIdentifier = getConnectedProfileIdentifier(qrState.profile);
  const connectedPicture = getConnectedProfilePicture(qrState.profile);
  const connectedTimestamp = getConnectedProfileTimestamp(qrState.profile, qrState.diagnostics, qrState.syncedAt);
  const connectedTimeLabel = formatConnectedTimestamp(connectedTimestamp);
  const showConnectedPicture = Boolean(connectedPicture) && !profileImageFailed;
  const connectedTitle = connectedDisplayName ?? connectedIdentifier ?? 'WhatsApp account';
  const connectedStatusLabel = getConnectionStatusLabel(qrState.status, qrState.diagnostics);
  const hasLinkedProfile = isMessagingProviderConnected || Boolean(qrState.profile);
  const isQrReady = qrState.status === 'qr_ready' && Boolean(qrState.qrValue);
  const isSessionBusy = qrState.status === 'loading' || qrState.status === 'preparing';

  const primaryActionLabel = hasLinkedProfile
    ? (isRevokingSession ? 'Logging out…' : 'Log out of WhatsApp')
    : isSessionBusy
      ? 'Preparing secure channel…'
      : isQrReady
        ? (isRefreshingQr ? 'Regenerating QR code…' : 'Regenerate QR code')
        : (isRefreshingQr ? 'Starting WhatsApp login…' : 'Log in to WhatsApp');

  const secondaryActionLabel = hasLinkedProfile
    ? 'Refresh linked profile'
    : isQrReady
      ? 'Check connection status'
      : isSessionBusy
        ? 'Waiting for secure channel…'
        : 'Refresh status';

  const sessionPanelCopy = hasLinkedProfile
    ? 'This workspace is linked to the live WhatsApp profile shown above. Log out below whenever you want to require a fresh login.'
    : isQrReady
      ? 'Scan the secure QR code above in WhatsApp to finish login, or regenerate it below if you need a fresh token.'
      : isSessionBusy
        ? 'We are preparing a secure WhatsApp login channel. The QR code will appear here as soon as the session is ready.'
        : 'Start WhatsApp login below to generate a secure QR code for this workspace.';

  const handlePrimarySessionAction = async () => {
    if (hasLinkedProfile) {
      await handleLogoutSession();
      return;
    }

    if (isSessionBusy) {
      return;
    }

    await handleSessionPostAction(isQrReady ? 'regenerate' : 'login');
  };

  const PrimaryActionIcon = hasLinkedProfile && !isRevokingSession ? Lock : RefreshCw;

  const connectedDetails = [
    { label: 'Profile', value: connectedDisplayName },
    { label: 'WhatsApp', value: connectedIdentifier },
    { label: 'Status', value: connectedStatusLabel },
    { label: 'Session', value: qrState.sessionName },
    { label: 'Time', value: connectedTimeLabel },
  ].filter((detail): detail is { label: string; value: string } => Boolean(detail.value));

  const badgeConfig = hasLinkedProfile
    ? { label: 'Connected', tone: 'success' as const }
    : isQrReady
      ? { label: 'QR Ready', tone: 'brand' as const }
      : qrState.status === 'loading' || qrState.status === 'preparing'
        ? { label: 'Provisioning', tone: 'brand' as const }
        : qrState.status === 'failed'
          ? { label: 'Error', tone: 'danger' as const }
            : { label: 'Link Required', tone: 'warning' as const };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-10">
      <div className="space-y-12 pb-20">
        <WorkspaceHeader
          eyebrow="Core Configurations"
          title="Agency Systems"
          description="Master control for integrations, WhatsApp device linkage, and high-level workspace governance protocols."
        />

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="space-y-10 lg:col-span-7">
            <WorkspacePanel
              title="Developer Access"
              description="Manage session-aware API keys for external automation and secure pipeline integrations."
              delayIndex={1}
            >
              <div className="space-y-8">
                <div className="group rounded-[2.5rem] border border-border-ghost bg-surface-base/40 p-8 transition-all hover:bg-surface-base/60">
                  <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3">
                        <Lock className="size-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-subtle/70">Access Protocol</h3>
                        <p className="text-lg font-bold tracking-tight text-on-surface">Scoped API Key</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleToggleApi}
                        disabled={isTogglingApi || qrState.status !== 'connected'}
                        className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border-2 transition-all duration-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                          isApiEnabled
                            ? 'border-primary bg-primary shadow-primary-glow'
                            : 'border-border-ghost bg-surface-base'
                        }`}
                        aria-label={isApiEnabled ? 'Disable API' : 'Enable API'}
                      >
                        <span
                          className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                            isApiEnabled ? 'translate-x-8' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${isApiEnabled ? 'text-primary' : 'text-on-surface-subtle'}`}>
                        {isTogglingApi ? 'Updating…' : isApiEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  {isApiEnabled ? (
                    <div className="space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="flex h-14 flex-1 items-center rounded-2xl border border-border-ghost bg-surface-base px-5 transition-all focus-within:border-primary/50">
                          <input
                            className="flex-1 border-0 bg-transparent font-mono text-sm tracking-wider text-on-surface outline-none"
                            type={showApiKey ? 'text' : 'password'}
                            value={apiKeyState || ''}
                            readOnly
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey((current) => !current)}
                            className="ml-3 p-2 text-on-surface-subtle transition-colors hover:text-primary"
                          >
                            {showApiKey ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                          </button>
                        </div>
                        <button 
                          onClick={() => {
                            if (apiKeyState) {
                              navigator.clipboard.writeText(apiKeyState);
                              toast.success('API Key copied to clipboard');
                            }
                          }}
                          className="h-14 rounded-2xl border border-border-ghost bg-surface-base px-6 text-sm font-bold text-on-surface-subtle transition-all hover:border-primary/30 hover:text-primary"
                        >
                          Copy Key
                        </button>
                      </div>

                      <div className="rounded-2xl border border-border-ghost bg-surface-card p-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 rounded-lg bg-primary/10 p-1.5">
                            <Zap className="size-3.5 text-primary" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-on-surface">Zero-Config Routing Active</p>
                            <p className="text-[11px] leading-relaxed text-on-surface-muted">
                              Requests using this key are automatically routed to your connected WhatsApp session: <span className="font-mono font-bold text-primary">{qrState.sessionName}</span>. 
                              You do not need to provide <code>agencyId</code> or <code>tenantId</code> in your API payloads.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border-ghost p-10 text-center">
                      <p className="text-sm font-medium text-on-surface-subtle">
                        {qrState.status === 'connected' 
                          ? 'Enable the API to generate a scoped secret key for external automation.'
                          : 'Connect your WhatsApp account to enable developer API access.'}
                      </p>
                    </div>
                  )}

                  <div className="mt-8 flex items-center justify-between border-t border-border-ghost pt-6">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="size-4 text-on-surface-subtle" />
                      <span className="text-[11px] font-medium text-on-surface-subtle">Never share your secret key in client-side code.</span>
                    </div>
                    <a
                      href="https://noxivo-docs.netlify.app/docs/api-reference/api-master-guide"
                      target="_blank"
                      className="flex items-center gap-2 text-xs font-bold text-primary transition-all hover:translate-x-1"
                    >
                      View API Documentation
                      <RefreshCw className="size-3 -rotate-45" />
                    </a>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-3">
                  <a
                    href="/dashboard/settings/integrations"
                    className="group relative overflow-hidden rounded-[1.5rem] border border-border-ghost bg-surface-base px-10 py-4 text-sm font-bold text-on-surface transition-all hover:border-primary/30 hover:text-primary"
                  >
                    <span className="flex items-center gap-3">
                      <ShieldCheck className="size-4" />
                      Open integrations vault
                    </span>
                  </a>
                  <button className="group relative overflow-hidden rounded-[1.5rem] bg-primary px-10 py-4 text-sm font-bold text-white shadow-primary-glow transition-all hover:scale-[1.02] active:scale-[0.98]">
                    <span className="flex items-center gap-3">
                      <Save className="size-4" />
                      Commit configurations
                    </span>
                  </button>
                </div>
              </div>
            </WorkspacePanel>

            <WorkspacePanel
              title="Webhooks"
              description="Configure webhooks to receive real-time events for bookings, orders, and inventory updates."
              delayIndex={2}
            >
              <div className="space-y-6">
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setEditingWebhook({ id: 'new', name: '', url: '', events: [], isActive: true, lastTriggeredAt: null, lastStatus: null, lastError: null });
                      setShowWebhookModal(true);
                    }}
                    className="flex items-center gap-2 rounded-[1.5rem] bg-primary px-6 py-3 text-sm font-bold text-white shadow-primary-glow transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Plus className="size-4" />
                    Add Webhook
                  </button>
                </div>

                {isLoadingWebhooks ? (
                  <div className="p-8 text-center text-on-surface-subtle">Loading...</div>
                ) : webhooks.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border-ghost p-10 text-center">
                    <Webhook className="mx-auto mb-4 size-8 text-on-surface-subtle" />
                    <p className="text-sm font-medium text-on-surface-subtle">No webhooks configured</p>
                    <p className="mt-2 text-xs text-on-surface-muted">Add a webhook to receive events from your business</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {webhooks.map((webhook) => (
                      <div key={webhook.id} className="group rounded-2xl border border-border-ghost bg-surface-base/40 p-5 transition-all hover:bg-surface-base">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <Webhook className="size-4 text-primary" />
                              <span className="font-bold text-on-surface">{webhook.name}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${webhook.isActive ? 'bg-green-500/20 text-green-500' : 'bg-surface-card text-on-surface-subtle'}`}>
                                {webhook.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                            <p className="text-xs text-on-surface-muted">{webhook.url}</p>
                            <div className="flex flex-wrap gap-2">
                              {webhook.events.map((event) => (
                                <span key={event} className="rounded-full bg-surface-card px-2 py-1 text-[10px] font-medium text-on-surface-subtle">
                                  {event}
                                </span>
                              ))}
                            </div>
                            {webhook.lastStatus && (
                              <p className={`text-[11px] ${webhook.lastStatus === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                                {webhook.lastStatus === 'success' ? 'Last delivery: OK' : `Last error: ${webhook.lastError}`}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingWebhook(webhook);
                                setShowWebhookModal(true);
                              }}
                              className="rounded-lg border border-border-ghost bg-surface-base px-3 py-2 text-xs font-bold text-on-surface-subtle transition-all hover:border-primary/30 hover:text-primary"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteWebhook(webhook.id)}
                              className="rounded-lg border border-border-ghost bg-surface-base p-2 text-red-500 transition-all hover:bg-red-500/10"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </WorkspacePanel>

            <WorkspacePanel              title="Workspace Administration"
              description="Agency-level controls stay here, while personal profile and password settings live under the account menu."
              delayIndex={3}
            >
              <div className="grid gap-6 md:grid-cols-2">
                <div className="group rounded-[2rem] border border-border-ghost bg-surface-base/40 p-6 transition-all hover:bg-surface-base">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/10 bg-primary/5">
                    <ShieldCheck className="size-6 text-primary" />
                  </div>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-on-surface-subtle">Governance</h3>
                  <p className="text-sm font-light leading-7 text-on-surface-muted">
                    Define which internal operators are authorized to manage integrations and billing context.
                  </p>
                </div>

                <div className="group rounded-[2rem] border border-border-ghost bg-surface-base/40 p-6 transition-all hover:bg-surface-base">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/10 bg-cyan-500/5">
                    <Globe className="size-6 text-cyan-500" />
                  </div>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-on-surface-subtle">Global Routing</h3>
                  <p className="text-sm font-light leading-7 text-on-surface-muted">
                    Manage default workspace behavior for incoming session handoffs and message traffic.
                  </p>
                </div>
              </div>
            </WorkspacePanel>
          </div>

          <div className="space-y-10 lg:col-span-5">
            <WorkspacePanel
              title="WhatsApp Linkage"
              description="Coordinate authentication for your primary WhatsApp operational device."
              delayIndex={2}
            >
              <form
                className="flex flex-col items-center"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handlePrimarySessionAction();
                }}
              >
                <div className="mb-8 flex w-full items-center justify-between px-2">
                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-widest text-on-surface-subtle">Core Device</p>
                    <p className="text-base font-bold tracking-tight text-on-surface">
                      {qrState.sessionName ?? 'No linked session'}
                    </p>
                  </div>
                  <Badge label={badgeConfig.label} tone={badgeConfig.tone} />
                </div>

                <div className="group relative">
                  <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-brand opacity-0 blur-2xl transition-opacity duration-700 group-hover:opacity-20" />
                  <div className="relative flex min-h-[24rem] w-full max-w-[22rem] flex-col items-center justify-center overflow-hidden rounded-[2.5rem] border border-border-ghost bg-surface-base p-8 shadow-card">
                    {qrState.status === 'loading' || qrState.status === 'preparing' ? (
                      <div className="relative flex flex-col items-center gap-4 px-4 text-center">
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.03] mix-blend-overlay [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)] [&>svg]:blur-[1px] scale-150 transform-gpu grayscale">
                          <QRCodeSVG value={qrState.sessionName ?? 'noxivo-secure-pairing'} size={280} />
                        </div>
                        <div className="absolute inset-x-10 top-10 h-32 rounded-full bg-primary/20 blur-3xl animate-pulse" />
                        <div className="relative size-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
                        <p className="relative text-xs font-medium tracking-wide text-on-surface-subtle">Establishing secure handshake…</p>
                      </div>
                    ) : qrState.status === 'connected' ? (
                      <div className="relative flex h-full w-full flex-col justify-between text-center">
                        {/* Background Stylized QR Artifact */}
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.035] mix-blend-overlay [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)] [&>svg]:blur-[1px] scale-[1.35] transform-gpu grayscale">
                          <QRCodeSVG value={qrState.sessionName ?? 'noxivo-secure-authenticated-artifact'} size={280} />
                        </div>
                        
                        <div className="relative flex flex-1 items-center justify-center">
                          <div className="absolute inset-x-10 top-10 h-32 rounded-full bg-primary/10 blur-3xl" />
                          <div className="absolute inset-x-16 bottom-12 h-24 rounded-full bg-secondary/10 blur-3xl" />
                          <div className="relative flex flex-col items-center gap-5">
                            <div className="relative flex size-32 items-center justify-center rounded-full border border-success/15 bg-surface-card shadow-primary-glow">
                              <div className="absolute inset-[10px] rounded-full border border-border-ghost bg-surface-base/80" />
                              {showConnectedPicture ? (
                                <img
                                  src={connectedPicture ?? undefined}
                                  alt={connectedTitle}
                                  className="relative size-[104px] rounded-full object-cover"
                                  onError={() => setProfileImageFailed(true)}
                                />
                              ) : (
                                <div className="relative flex size-[104px] items-center justify-center rounded-full bg-gradient-brand text-2xl font-bold tracking-[0.08em] text-white shadow-primary-glow">
                                  {getInitials(connectedTitle)}
                                </div>
                              )}
                            </div>

                            <div className="space-y-2">
                              <div className="inline-flex items-center gap-2 rounded-full border border-success/15 bg-success/5 px-3 py-1.5 text-[10px] font-semibold tracking-wide text-success backdrop-blur-md">
                                <span className="size-2 rounded-full bg-success ring-4 ring-success/10 animate-pulse" />
                                Live profile connected
                              </div>
                              <div className="space-y-1">
                                <p className="text-xl font-bold tracking-tight text-on-surface">{connectedTitle}</p>
                                <p className="text-sm font-medium text-on-surface-muted">
                                  {connectedIdentifier ?? 'Id unavailable'}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="relative mt-8 space-y-2 text-left">
                          {connectedDetails.map((detail) => (
                            <div
                              key={detail.label}
                              className="flex items-center justify-between gap-3 rounded-2xl border border-border-ghost bg-surface-card/80 px-4 py-3 shadow-sm backdrop-blur-md"
                            >
                              <span className="text-[10px] font-semibold text-on-surface-subtle">{detail.label}</span>
                              <span className="truncate text-right text-xs font-semibold text-on-surface">{detail.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : qrState.status === 'failed' ? (
                      <div className="relative flex flex-col items-center gap-4 p-4 text-center">
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.03] mix-blend-overlay [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)] [&>svg]:blur-[1px] scale-150 transform-gpu grayscale">
                          <QRCodeSVG value="noxivo-error-state" size={280} />
                        </div>
                        <div className="relative flex size-12 items-center justify-center rounded-2xl border border-error/20 bg-error/10 text-error">
                          <AlertCircle className="size-6" />
                        </div>
                        <p className="relative text-xs font-semibold tracking-tight text-error">{qrState.error}</p>
                      </div>
                    ) : qrState.status === 'qr_ready' && qrState.qrValue ? (
                      <div className="relative flex h-full w-full flex-col items-center justify-center">
                        {/* Richer Ambient Background for QR */}
                        <div className="absolute inset-x-0 -top-8 h-40 rounded-full bg-primary/20 blur-3xl opacity-60" />
                        <div className="absolute inset-x-8 -bottom-8 h-32 rounded-full bg-secondary/20 blur-3xl opacity-60" />
                        
                        <div className="relative scale-110 rounded-[1.75rem] border border-border-ghost bg-white p-[18px] shadow-primary-glow transition-transform duration-500 hover:scale-[1.12]">
                          <QRCodeSVG value={qrState.qrValue} size={180} />
                        </div>
                      </div>
                    ) : (
                      <div className="relative flex h-full w-full flex-col items-center justify-center">
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.02] mix-blend-overlay [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)] [&>svg]:blur-[1px] scale-150 transform-gpu grayscale">
                          <QRCodeSVG value="noxivo-terminal-standby" size={280} />
                        </div>
                        <div className="relative flex flex-col items-center gap-4 px-4 text-center">
                          <div className="absolute inset-x-8 top-4 h-24 rounded-full bg-primary/10 blur-3xl" />
                          <QrCode className="relative size-12 text-on-surface-subtle/50" />
                          <p className="relative text-xs font-medium tracking-wide text-on-surface-subtle">{qrState.error ?? 'Terminal standby'}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-8 space-y-2 text-center">
                  <p className="text-sm font-medium tracking-tight text-on-surface">Authentication Terminal</p>
                  <p className="mx-auto max-w-[280px] text-xs font-light leading-6 text-on-surface-muted">
                    {sessionPanelCopy}
                  </p>
                  {qrState.sessionName ? <p className="text-[11px] font-medium text-on-surface-subtle">Session: {qrState.sessionName}</p> : null}
                  {qrState.error && qrState.status !== 'failed' && qrState.status !== 'unlinked' ? (
                    <p className="text-[11px] font-medium text-error">{qrState.error}</p>
                  ) : null}
                </div>

                <div className="mt-10 grid w-full gap-4">
                  <button
                    type="submit"
                    disabled={isSessionBusy || isRefreshingQr || isRevokingSession}
                    className="group flex w-full items-center justify-center gap-3 rounded-2xl border border-border-ghost bg-surface-base/50 py-5 text-sm font-bold text-on-surface transition-all hover:bg-surface-base disabled:opacity-40"
                  >
                    <PrimaryActionIcon
                      className={`size-4 text-on-surface-subtle transition-colors group-hover:text-primary ${!hasLinkedProfile && isRefreshingQr ? 'animate-spin text-primary' : ''}`}
                    />
                    {primaryActionLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRefreshSessionStatus()}
                    disabled={isRevokingSession || isRefreshingQr || isSessionBusy}
                    className="flex w-full items-center justify-center gap-3 py-2 text-xs font-bold text-on-surface-subtle transition-all hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {secondaryActionLabel}
                  </button>
                </div>
              </form>
            </WorkspacePanel>
          </div>
        </div>
      </div>
    </div>
  );
}
