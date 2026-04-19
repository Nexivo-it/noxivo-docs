'use client';

import { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  KeyRound,
  PlugZap,
  Save,
  ShoppingBag,
  Store,
  Table2,
  X,
} from 'lucide-react';
import {
  Badge,
  WorkspaceHeader,
  WorkspacePanel,
} from '../../../../components/dashboard-workspace-ui';
import { WebhookInboxSourcesPanel } from './webhook-inbox-sources-panel';

type Provider = 'airtable' | 'google_sheets' | 'shopify' | 'woocommerce';
type ShopProvider = 'shopify' | 'woocommerce';
type CredentialStatus = 'active' | 'error' | 'expired';

type CredentialRecord = {
  id: string;
  provider: Provider;
  displayName: string;
  status: CredentialStatus;
  config: Record<string, unknown>;
  updatedAt: string;
};

type ShopStatusRecord = {
  provider: ShopProvider;
  entitled: boolean;
  configured: boolean;
  enabled: boolean;
  credentialStatus: CredentialStatus | 'missing';
  lastSyncedAt: string | null;
};

type FormState = {
  displayName: string;
  airtableApiKey: string;
  airtableBaseId: string;
  airtableTableId: string;
  googleClientEmail: string;
  googlePrivateKey: string;
  googleSpreadsheetId: string;
  googleSheetName: string;
  shopifyAccessToken: string;
  shopifyStoreUrl: string;
  shopifyApiVersion: string;
  wooConsumerKey: string;
  wooConsumerSecret: string;
  wooStoreUrl: string;
  wooApiBasePath: string;
};

type SecretDraft = Partial<Pick<FormState,
  'airtableApiKey'
  | 'googleClientEmail'
  | 'googlePrivateKey'
  | 'shopifyAccessToken'
  | 'wooConsumerKey'
  | 'wooConsumerSecret'
>>;

type SecretDraftMap = Partial<Record<Provider, SecretDraft>>;

const defaultFormState: FormState = {
  displayName: '',
  airtableApiKey: '',
  airtableBaseId: '',
  airtableTableId: '',
  googleClientEmail: '',
  googlePrivateKey: '',
  googleSpreadsheetId: '',
  googleSheetName: '',
  shopifyAccessToken: '',
  shopifyStoreUrl: '',
  shopifyApiVersion: '2025-01',
  wooConsumerKey: '',
  wooConsumerSecret: '',
  wooStoreUrl: '',
  wooApiBasePath: '/wp-json/wc/v3',
};

const providerMeta: Record<Provider, { title: string; description: string; modalDescription: string }> = {
  airtable: {
    title: 'Airtable',
    description: 'Connect operational tables for CRM updates and automation writes.',
    modalDescription: 'Store the API key and default base references used by Airtable workflow actions.',
  },
  google_sheets: {
    title: 'Google Sheets',
    description: 'Provide service account credentials for sheet-based sync workflows.',
    modalDescription: 'Save the service account identity and default worksheet references used during sync jobs.',
  },
  shopify: {
    title: 'Shopify',
    description: 'Connect a Shopify catalog for Shop-powered product answers and live inventory lookups.',
    modalDescription: 'Store the private access token and storefront details required for Shopify sync operations.',
  },
  woocommerce: {
    title: 'WooCommerce',
    description: 'Connect a WooCommerce catalog for Shop-powered product answers and live inventory lookups.',
    modalDescription: 'Save the REST API consumer credentials and store endpoint used for WooCommerce data sync.',
  },
};

const cards: Array<{ provider: Provider; icon: React.ComponentType<{ className?: string }> }> = [
  { provider: 'airtable', icon: Table2 },
  { provider: 'google_sheets', icon: FileSpreadsheet },
  { provider: 'shopify', icon: ShoppingBag },
  { provider: 'woocommerce', icon: Store },
];

function isShopProvider(provider: Provider): provider is ShopProvider {
  return provider === 'shopify' || provider === 'woocommerce';
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function toneForCredentialStatus(status: CredentialStatus | ShopStatusRecord['credentialStatus']): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'active') {
    return 'success';
  }

  if (status === 'expired') {
    return 'warning';
  }

  if (status === 'missing') {
    return 'neutral';
  }

  return 'danger';
}

function labelForCredentialStatus(status: CredentialStatus | ShopStatusRecord['credentialStatus']): string {
  if (status === 'active') {
    return 'Active';
  }

  if (status === 'expired') {
    return 'Expired';
  }

  if (status === 'missing') {
    return 'Missing';
  }

  return 'Error';
}

function badgeForShopStatus(status: ShopStatusRecord | undefined): { label: string; tone: 'brand' | 'success' | 'warning' | 'danger' | 'neutral' } {
  if (!status) {
    return { label: 'Checking', tone: 'neutral' };
  }

  if (!status.entitled) {
    return { label: 'Plan Locked', tone: 'warning' };
  }

  if (status.enabled) {
    return { label: 'Active', tone: 'success' };
  }

  if (status.configured) {
    return { label: 'Ready', tone: 'brand' };
  }

  return { label: 'Setup Required', tone: 'neutral' };
}

function extractSecretDraft(provider: Provider, formState: FormState): SecretDraft {
  if (provider === 'airtable') {
    return { airtableApiKey: formState.airtableApiKey };
  }

  if (provider === 'google_sheets') {
    return {
      googleClientEmail: formState.googleClientEmail,
      googlePrivateKey: formState.googlePrivateKey,
    };
  }

  if (provider === 'shopify') {
    return { shopifyAccessToken: formState.shopifyAccessToken };
  }

  return {
    wooConsumerKey: formState.wooConsumerKey,
    wooConsumerSecret: formState.wooConsumerSecret,
  };
}

function hasReusableSecret(provider: Provider, secretDraft: SecretDraft | undefined): boolean {
  if (!secretDraft) {
    return false;
  }

  if (provider === 'airtable') {
    return Boolean(secretDraft.airtableApiKey);
  }

  if (provider === 'google_sheets') {
    return Boolean(secretDraft.googleClientEmail && secretDraft.googlePrivateKey);
  }

  if (provider === 'shopify') {
    return Boolean(secretDraft.shopifyAccessToken);
  }

  return Boolean(secretDraft.wooConsumerKey && secretDraft.wooConsumerSecret);
}

function resolveSecretPayload(
  provider: Provider,
  formState: FormState,
  secretDraft: SecretDraft | undefined,
): Record<string, string> | null {
  if (provider === 'airtable') {
    const apiKey = formState.airtableApiKey || secretDraft?.airtableApiKey || '';
    return apiKey ? { apiKey } : null;
  }

  if (provider === 'google_sheets') {
    const clientEmail = formState.googleClientEmail || secretDraft?.googleClientEmail || '';
    const privateKey = formState.googlePrivateKey || secretDraft?.googlePrivateKey || '';
    return clientEmail && privateKey ? { clientEmail, privateKey } : null;
  }

  if (provider === 'shopify') {
    const accessToken = formState.shopifyAccessToken || secretDraft?.shopifyAccessToken || '';
    return accessToken ? { accessToken } : null;
  }

  const consumerKey = formState.wooConsumerKey || secretDraft?.wooConsumerKey || '';
  const consumerSecret = formState.wooConsumerSecret || secretDraft?.wooConsumerSecret || '';
  return consumerKey && consumerSecret ? { consumerKey, consumerSecret } : null;
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

export function IntegrationsClient() {
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [shopStatuses, setShopStatuses] = useState<ShopStatusRecord[]>([]);
  const [secretDrafts, setSecretDrafts] = useState<SecretDraftMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [pageLoadError, setPageLoadError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [modalSaveError, setModalSaveError] = useState<string | null>(null);
  const [isShopStatusStale, setIsShopStatusStale] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<Provider>('airtable');
  const [formState, setFormState] = useState<FormState>(defaultFormState);
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingProvider, setIsTogglingProvider] = useState<Record<ShopProvider, boolean>>({
    shopify: false,
    woocommerce: false,
  });

  function setLoadError(scope: 'page' | 'toggle' | 'modal', message: string): void {
    if (scope === 'page') {
      setPageLoadError(message);
      return;
    }

    if (scope === 'toggle') {
      setToggleError(message);
      return;
    }

    setModalSaveError(message);
  }

  async function loadData(scope: 'page' | 'toggle' | 'modal' = 'page'): Promise<boolean> {
    setIsLoading(true);
    if (scope === 'page') {
      setPageLoadError(null);
    } else if (scope === 'toggle') {
      setToggleError(null);
    } else {
      setModalSaveError(null);
    }

    try {
      const [credentialsResult, shopResult] = await Promise.allSettled([
        fetch('/api/settings/credentials', { cache: 'no-store' }),
        fetch('/api/settings/shop', { cache: 'no-store' }),
      ]);

      if (credentialsResult.status !== 'fulfilled') {
        setLoadError(scope, 'Failed to load integration credentials');
        setCredentials([]);
        setShopStatuses([]);
        setIsShopStatusStale(true);
        return false;
      }

      const credentialsResponse = credentialsResult.value;
      const credentialsPayload = await credentialsResponse.json().catch(() => null) as {
        error?: string;
        credentials?: CredentialRecord[];
      } | null;

      if (!credentialsResponse.ok) {
        setLoadError(scope, credentialsPayload?.error ?? 'Failed to load integration credentials');
        setCredentials([]);
        setShopStatuses([]);
        setIsShopStatusStale(true);
        return false;
      }

      setCredentials(Array.isArray(credentialsPayload?.credentials) ? credentialsPayload.credentials : []);

      if (shopResult.status !== 'fulfilled') {
        setShopStatuses([]);
        setIsShopStatusStale(true);
        setLoadError(scope, 'Failed to load shop provider status');
        return false;
      }

      const shopResponse = shopResult.value;
      const shopPayload = await shopResponse.json().catch(() => null) as {
        error?: string;
        providers?: ShopStatusRecord[];
      } | null;

      if (!shopResponse.ok) {
        setShopStatuses([]);
        setIsShopStatusStale(true);
        setLoadError(scope, shopPayload?.error ?? 'Failed to load shop provider status');
        return false;
      }

      setShopStatuses(Array.isArray(shopPayload?.providers) ? shopPayload.providers : []);
      setIsShopStatusStale(false);
      return true;
    } catch {
      setLoadError(scope, 'Failed to load integration settings');
      setCredentials([]);
      setShopStatuses([]);
      setIsShopStatusStale(true);
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function openModal(provider: Provider) {
    const existing = credentials.find((credential) => credential.provider === provider);
    const secretDraft = secretDrafts[provider];

    setActiveProvider(provider);

    if (provider === 'airtable') {
      setFormState({
        ...defaultFormState,
        displayName: existing?.displayName ?? 'Airtable',
        airtableApiKey: secretDraft?.airtableApiKey ?? '',
        airtableBaseId: typeof existing?.config?.baseId === 'string' ? existing.config.baseId : '',
        airtableTableId: typeof existing?.config?.tableId === 'string' ? existing.config.tableId : '',
      });
    } else if (provider === 'google_sheets') {
      setFormState({
        ...defaultFormState,
        displayName: existing?.displayName ?? 'Google Sheets',
        googleClientEmail: secretDraft?.googleClientEmail ?? '',
        googlePrivateKey: secretDraft?.googlePrivateKey ?? '',
        googleSpreadsheetId: typeof existing?.config?.spreadsheetId === 'string' ? existing.config.spreadsheetId : '',
        googleSheetName: typeof existing?.config?.sheetName === 'string' ? existing.config.sheetName : '',
      });
    } else if (provider === 'shopify') {
      setFormState({
        ...defaultFormState,
        displayName: existing?.displayName ?? 'Shopify',
        shopifyAccessToken: secretDraft?.shopifyAccessToken ?? '',
        shopifyStoreUrl: typeof existing?.config?.storeUrl === 'string' ? existing.config.storeUrl : '',
        shopifyApiVersion: typeof existing?.config?.apiVersion === 'string' ? existing.config.apiVersion : '2025-01',
      });
    } else {
      setFormState({
        ...defaultFormState,
        displayName: existing?.displayName ?? 'WooCommerce',
        wooConsumerKey: secretDraft?.wooConsumerKey ?? '',
        wooConsumerSecret: secretDraft?.wooConsumerSecret ?? '',
        wooStoreUrl: typeof existing?.config?.storeUrl === 'string' ? existing.config.storeUrl : '',
        wooApiBasePath: typeof existing?.config?.apiBasePath === 'string' ? existing.config.apiBasePath : '/wp-json/wc/v3',
      });
    }

    setIsModalOpen(true);
    setModalSaveError(null);
  }

  function closeModal(): void {
    setIsModalOpen(false);
    setModalSaveError(null);
    setFormState(defaultFormState);
  }

  async function handleSubmit(event: { preventDefault(): void }) {
    event.preventDefault();
    setIsSaving(true);
    setModalSaveError(null);

    const resolvedSecret = resolveSecretPayload(activeProvider, formState, secretDrafts[activeProvider]);
    if (!resolvedSecret) {
      setModalSaveError('Re-enter the existing secret to save changes for this provider.');
      setIsSaving(false);
      return;
    }

    const payload = activeProvider === 'airtable'
      ? {
          provider: 'airtable' as const,
          displayName: formState.displayName,
          secret: resolvedSecret,
          config: {
            baseId: formState.airtableBaseId,
            tableId: formState.airtableTableId,
          },
        }
      : activeProvider === 'google_sheets'
        ? {
            provider: 'google_sheets' as const,
            displayName: formState.displayName,
            secret: resolvedSecret,
            config: {
              spreadsheetId: formState.googleSpreadsheetId,
              sheetName: formState.googleSheetName,
            },
          }
        : activeProvider === 'shopify'
          ? {
              provider: 'shopify' as const,
              displayName: formState.displayName,
              secret: resolvedSecret,
              config: {
                storeUrl: formState.shopifyStoreUrl,
                apiVersion: formState.shopifyApiVersion,
              },
            }
          : {
              provider: 'woocommerce' as const,
              displayName: formState.displayName,
              secret: resolvedSecret,
              config: {
                storeUrl: formState.wooStoreUrl,
                apiBasePath: formState.wooApiBasePath,
              },
            };

    try {
      const response = await fetch('/api/settings/credentials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => null) as { error?: string } | null;

      if (!response.ok) {
        setModalSaveError(result?.error ?? 'Failed to save integration credential');
        return;
      }

      setSecretDrafts((current) => ({
        ...current,
        [activeProvider]: extractSecretDraft(activeProvider, {
          ...formState,
          ...(activeProvider === 'airtable' ? { airtableApiKey: resolvedSecret.apiKey } : {}),
          ...(activeProvider === 'google_sheets'
            ? {
                googleClientEmail: resolvedSecret.clientEmail ?? formState.googleClientEmail,
                googlePrivateKey: resolvedSecret.privateKey ?? formState.googlePrivateKey,
              }
            : {}),
          ...(activeProvider === 'shopify' ? { shopifyAccessToken: resolvedSecret.accessToken } : {}),
          ...(activeProvider === 'woocommerce'
            ? {
                wooConsumerKey: resolvedSecret.consumerKey ?? formState.wooConsumerKey,
                wooConsumerSecret: resolvedSecret.consumerSecret ?? formState.wooConsumerSecret,
              }
            : {}),
        }),
      }));

      const didRefresh = await loadData('modal');
      if (!didRefresh) {
        return;
      }

      closeModal();
    } catch {
      setModalSaveError('Failed to save integration credential');
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleShopProvider(provider: ShopProvider, enabled: boolean) {
    setIsTogglingProvider((current) => ({ ...current, [provider]: true }));
    setToggleError(null);

    try {
      const response = await fetch('/api/settings/shop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, enabled }),
      });

      const result = await response.json().catch(() => null) as { error?: string } | null;

      if (!response.ok) {
        setToggleError(result?.error ?? 'Failed to update shop provider status');
        return;
      }

      await loadData('toggle');
    } catch {
      setToggleError('Failed to update shop provider status');
    } finally {
      setIsTogglingProvider((current) => ({ ...current, [provider]: false }));
    }
  }

  const activeExistingCredential = credentials.find((credential) => credential.provider === activeProvider);
  const activeReusableSecret = hasReusableSecret(activeProvider, secretDrafts[activeProvider]);

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-10">
      <div className="space-y-12 pb-20">
        <WorkspaceHeader
          eyebrow="Integrations Vault"
          title="Provider Credentials"
          description="Manage plugin credentials per active workspace context. Credentials are scoped to the selected client and used by workflow actions at runtime."
        />

        <WorkspacePanel
          title="Active Workspace Integrations"
          description="Only agency-admin and client-admin roles can manage these credentials. Values are stored per tenant scope."
          delayIndex={1}
        >
          {pageLoadError ? (
            <div className="mb-6 rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm font-medium text-error">
              {pageLoadError}
            </div>
          ) : null}

          {toggleError ? (
            <div className="mb-6 rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm font-medium text-error">
              {toggleError}
            </div>
          ) : null}

          {isLoading ? (
            <div className="rounded-3xl border border-border-ghost bg-surface-base p-10 text-sm text-on-surface-subtle">
              Loading integrations…
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-2">
              {cards.map(({ provider, icon: Icon }) => {
                const existing = credentials.find((credential) => credential.provider === provider);
                const title = providerMeta[provider].title;
                const description = providerMeta[provider].description;
                const shopStatus = isShopProvider(provider)
                  ? shopStatuses.find((status) => status.provider === provider)
                  : undefined;
                const primaryBadge = isShopProvider(provider)
                  ? isShopStatusStale
                    ? { label: 'Status Unavailable', tone: 'neutral' as const }
                    : badgeForShopStatus(shopStatus)
                  : existing
                    ? {
                        label: labelForCredentialStatus(existing.status),
                        tone: toneForCredentialStatus(existing.status),
                      }
                    : null;
                const activationLocked = isShopProvider(provider)
                  ? !shopStatus?.entitled || !shopStatus.configured
                  : false;
                const isProviderToggling = isShopProvider(provider) ? isTogglingProvider[provider] : false;
                const canActivate = isShopProvider(provider)
                  ? !isShopStatusStale && !activationLocked && !shopStatus?.enabled && !isProviderToggling
                  : false;
                const canDeactivate = isShopProvider(provider)
                  ? !isShopStatusStale && !activationLocked && Boolean(shopStatus?.enabled) && !isProviderToggling
                  : false;

                return (
                  <article
                    key={provider}
                    className="space-y-5 rounded-[2rem] border border-border-ghost bg-surface-base/40 p-6 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:bg-surface-base/70"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-primary-glow">
                          <Icon className="size-5" />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-base font-bold tracking-tight text-on-surface">{title}</h3>
                          <p className="text-sm leading-6 text-on-surface-muted">{description}</p>
                        </div>
                      </div>
                      {primaryBadge ? <Badge label={primaryBadge.label} tone={primaryBadge.tone} /> : null}
                    </div>

                    {isShopProvider(provider) ? (
                      <>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl border border-border-ghost bg-surface-base/80 px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-subtle">Plan Access</p>
                            <p className="mt-2 text-sm font-semibold text-on-surface">
                              {isShopStatusStale ? 'Unavailable' : shopStatus?.entitled ? 'Enabled' : 'Locked'}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border-ghost bg-surface-base/80 px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-subtle">Credential</p>
                            <p className="mt-2 text-sm font-semibold text-on-surface">
                              {isShopStatusStale ? 'Unavailable' : shopStatus?.configured ? 'Configured' : 'Missing'}
                            </p>
                            <p className="mt-1 text-xs text-on-surface-muted">
                              {isShopStatusStale ? 'Current shop status could not be loaded' : labelForCredentialStatus(shopStatus?.credentialStatus ?? 'missing')}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border-ghost bg-surface-base/80 px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-subtle">Sync Status</p>
                            <p className="mt-2 text-sm font-semibold text-on-surface">
                              {isShopStatusStale ? 'Unavailable' : shopStatus?.enabled ? 'Active' : 'Inactive'}
                            </p>
                            <p className="mt-1 text-xs text-on-surface-muted">
                              {isShopStatusStale ? 'Refresh to retrieve the latest provider state' : shopStatus?.lastSyncedAt ? `Last sync ${formatTimestamp(shopStatus.lastSyncedAt)}` : 'Awaiting first sync'}
                            </p>
                          </div>
                        </div>

                      </>
                    ) : (
                      <div className="rounded-2xl border border-border-ghost bg-surface-base px-4 py-3 text-xs text-on-surface-muted">
                        {existing ? (
                          <div className="space-y-1.5">
                            <p className="font-semibold text-on-surface">{existing.displayName}</p>
                            <p>Last updated: {formatTimestamp(existing.updatedAt)}</p>
                          </div>
                        ) : (
                          <p>No credential saved yet for this workspace.</p>
                        )}
                      </div>
                    )}

                    {isShopProvider(provider) ? (
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <button
                          type="button"
                          onClick={() => openModal(provider)}
                          className="h-11 min-w-[44px] rounded-2xl border border-border-ghost bg-surface-base px-4 text-sm font-bold text-on-surface transition-all hover:border-primary/30 hover:text-primary active:scale-[0.98]"
                        >
                          {existing ? 'Update Credential' : 'Configure Credential'}
                        </button>

                        {isShopStatusStale ? (
                          <div className="rounded-2xl border border-border-ghost bg-surface-base px-4 py-3 text-xs font-semibold text-on-surface-muted">
                            Shop provider status is currently unavailable. Refresh to load the latest activation state.
                          </div>
                        ) : !shopStatus?.entitled ? (
                          <div className="rounded-2xl border border-warning/20 bg-warning/5 px-4 py-3 text-xs font-semibold text-warning">
                            Not enabled on the current subscription. Upgrade the workspace plan to activate this provider.
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              type="button"
                              onClick={() => void toggleShopProvider(provider, true)}
                              disabled={!canActivate}
                              className={buttonClassName({
                                emphasized: canActivate,
                                disabled: !canActivate,
                              })}
                            >
                              {isProviderToggling && !shopStatus?.enabled ? 'Activating…' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleShopProvider(provider, false)}
                              disabled={!canDeactivate}
                              className={buttonClassName({
                                emphasized: canDeactivate,
                                disabled: !canDeactivate,
                              })}
                            >
                              {isProviderToggling && shopStatus?.enabled ? 'Deactivating…' : 'Deactivate'}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openModal(provider)}
                        className="h-11 min-w-[44px] w-full rounded-2xl border border-border-ghost bg-surface-base text-sm font-bold text-on-surface transition-all hover:border-primary/30 hover:text-primary active:scale-[0.98]"
                      >
                        {existing ? 'Update Credential' : 'Configure Credential'}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </WorkspacePanel>

        <WebhookInboxSourcesPanel />
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-base/80 px-4 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-[2rem] border border-border-ghost bg-surface-card p-6 md:p-8 shadow-float">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-on-surface-subtle">Credential Editor</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-on-surface">
                  {providerMeta[activeProvider].title}
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-on-surface-muted">
                  {providerMeta[activeProvider].modalDescription}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="h-11 w-11 min-w-[44px] rounded-xl border border-border-ghost bg-surface-base text-on-surface-subtle transition-all hover:text-on-surface active:scale-[0.98]"
                aria-label="Close credential editor"
              >
                <X className="mx-auto size-4" />
              </button>
            </div>

            <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
              {modalSaveError ? (
                <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm font-medium text-error">
                  {modalSaveError}
                </div>
              ) : null}

              {isShopProvider(activeProvider) && !isShopStatusStale && !shopStatuses.find((status) => status.provider === activeProvider)?.entitled ? (
                <div className="rounded-2xl border border-warning/20 bg-warning/5 px-4 py-3 text-xs font-semibold text-warning">
                  Not enabled on the current subscription. Upgrade the workspace plan to activate this provider.
                </div>
              ) : null}

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">Display Name</span>
                <input
                  type="text"
                  required
                  value={formState.displayName}
                  onChange={(event) => setFormState((current) => ({ ...current, displayName: event.target.value }))}
                  className="h-11 min-w-[44px] w-full rounded-xl border border-border-ghost bg-surface-base px-4 text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                  placeholder={providerMeta[activeProvider].title}
                />
              </label>

              {activeProvider === 'airtable' ? (
                <>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">API Key</span>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-on-surface-subtle" />
                      <input
                        type="password"
                        required={!activeExistingCredential}
                        value={formState.airtableApiKey}
                        onChange={(event) => setFormState((current) => ({ ...current, airtableApiKey: event.target.value }))}
                        className="h-11 min-w-[44px] w-full rounded-xl border border-border-ghost bg-surface-base pl-10 pr-4 text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                        placeholder={activeExistingCredential ? 'Leave blank to keep current secret' : 'pat...'}
                      />
                    </div>
                    {activeExistingCredential ? (
                      <p className="text-xs text-on-surface-muted">
                        {activeReusableSecret
                          ? 'Leave blank to keep the current secret in this session.'
                          : 'Re-enter the current secret once to save updates in this session.'}
                      </p>
                    ) : null}
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">Base ID (optional)</span>
                      <input
                        type="text"
                        value={formState.airtableBaseId}
                        onChange={(event) => setFormState((current) => ({ ...current, airtableBaseId: event.target.value }))}
                        className="h-11 min-w-[44px] w-full rounded-xl border border-border-ghost bg-surface-base px-4 text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                        placeholder="app..."
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">Table ID (optional)</span>
                      <input
                        type="text"
                        value={formState.airtableTableId}
                        onChange={(event) => setFormState((current) => ({ ...current, airtableTableId: event.target.value }))}
                        className="h-11 min-w-[44px] w-full rounded-xl border border-border-ghost bg-surface-base px-4 text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                        placeholder="tbl..."
                      />
                    </label>
                  </div>
                </>
              ) : null}

              {activeProvider === 'google_sheets' ? (
                <>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">Service Account Email</span>
                    <input
                      type="email"
                      required={!activeExistingCredential}
                      value={formState.googleClientEmail}
                      onChange={(event) => setFormState((current) => ({ ...current, googleClientEmail: event.target.value }))}
                      className="h-11 min-w-[44px] w-full rounded-xl border border-border-ghost bg-surface-base px-4 text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                      placeholder={activeExistingCredential ? 'Leave blank to keep current email' : 'service-account@project.iam.gserviceaccount.com'}
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">Private Key</span>
                    <textarea
                      required={!activeExistingCredential}
                      rows={5}
                      value={formState.googlePrivateKey}
                      onChange={(event) => setFormState((current) => ({ ...current, googlePrivateKey: event.target.value }))}
                      className="w-full rounded-xl border border-border-ghost bg-surface-base px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                      placeholder={activeExistingCredential ? 'Leave blank to keep current private key' : '-----BEGIN PRIVATE KEY-----'}
                    />
                  </label>
                  {activeExistingCredential ? (
                    <p className="-mt-2 text-xs text-on-surface-muted">
                      {activeReusableSecret
                        ? 'Leave blank to keep the current Google credentials in this session.'
                        : 'Re-enter the current Google credentials once to save updates in this session.'}
                    </p>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">Spreadsheet ID (optional)</span>
                      <input
                        type="text"
                        value={formState.googleSpreadsheetId}
                        onChange={(event) => setFormState((current) => ({ ...current, googleSpreadsheetId: event.target.value }))}
                        className="h-11 min-w-[44px] w-full rounded-xl border border-border-ghost bg-surface-base px-4 text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                        placeholder="1A2B..."
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">Sheet Name (optional)</span>
                      <input
                        type="text"
                        value={formState.googleSheetName}
                        onChange={(event) => setFormState((current) => ({ ...current, googleSheetName: event.target.value }))}
                        className="h-11 min-w-[44px] w-full rounded-xl border border-border-ghost bg-surface-base px-4 text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                        placeholder="Sheet1"
                      />
                    </label>
                  </div>
                </>
              ) : null}

              {activeProvider === 'shopify' ? (
                <>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">Access Token</span>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-on-surface-subtle" />
                      <input
                        type="password"
                        required={!activeExistingCredential}
                        value={formState.shopifyAccessToken}
                        onChange={(event) => setFormState((current) => ({ ...current, shopifyAccessToken: event.target.value }))}
                        className="h-11 min-w-[44px] w-full rounded-xl border border-border-ghost bg-surface-base pl-10 pr-4 text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                        placeholder={activeExistingCredential ? 'Leave blank to keep current token' : 'shpat_...'}
                      />
                    </div>
                    {activeExistingCredential ? (
                      <p className="text-xs text-on-surface-muted">
                        {activeReusableSecret
                          ? 'Leave blank to keep the current Shopify token in this session.'
                          : 'Re-enter the current Shopify token once to save updates in this session.'}
                      </p>
                    ) : null}
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">Store URL</span>
                      <input
                        type="url"
                        required
                        value={formState.shopifyStoreUrl}
                        onChange={(event) => setFormState((current) => ({ ...current, shopifyStoreUrl: event.target.value }))}
                        className="h-11 min-w-[44px] w-full rounded-xl border border-border-ghost bg-surface-base px-4 text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                        placeholder="https://brand.myshopify.com"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">API Version</span>
                      <input
                        type="text"
                        required
                        value={formState.shopifyApiVersion}
                        onChange={(event) => setFormState((current) => ({ ...current, shopifyApiVersion: event.target.value }))}
                        className="h-11 min-w-[44px] w-full rounded-xl border border-border-ghost bg-surface-base px-4 text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                        placeholder="2025-01"
                      />
                    </label>
                  </div>
                </>
              ) : null}

              {activeProvider === 'woocommerce' ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">Consumer Key</span>
                      <div className="relative">
                        <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-on-surface-subtle" />
                        <input
                          type="password"
                          required={!activeExistingCredential}
                          value={formState.wooConsumerKey}
                          onChange={(event) => setFormState((current) => ({ ...current, wooConsumerKey: event.target.value }))}
                          className="h-11 min-w-[44px] w-full rounded-xl border border-border-ghost bg-surface-base pl-10 pr-4 text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                          placeholder={activeExistingCredential ? 'Leave blank to keep current key' : 'ck_...'}
                        />
                      </div>
                    </label>
                    <label className="block space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">Consumer Secret</span>
                      <div className="relative">
                        <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-on-surface-subtle" />
                        <input
                          type="password"
                          required={!activeExistingCredential}
                          value={formState.wooConsumerSecret}
                          onChange={(event) => setFormState((current) => ({ ...current, wooConsumerSecret: event.target.value }))}
                          className="h-11 min-w-[44px] w-full rounded-xl border border-border-ghost bg-surface-base pl-10 pr-4 text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                          placeholder={activeExistingCredential ? 'Leave blank to keep current secret' : 'cs_...'}
                        />
                      </div>
                    </label>
                  </div>
                  {activeExistingCredential ? (
                    <p className="-mt-2 text-xs text-on-surface-muted">
                      {activeReusableSecret
                        ? 'Leave blank to keep the current WooCommerce credentials in this session.'
                        : 'Re-enter the current WooCommerce credentials once to save updates in this session.'}
                    </p>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">Store URL</span>
                      <input
                        type="url"
                        required
                        value={formState.wooStoreUrl}
                        onChange={(event) => setFormState((current) => ({ ...current, wooStoreUrl: event.target.value }))}
                        className="h-11 min-w-[44px] w-full rounded-xl border border-border-ghost bg-surface-base px-4 text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                        placeholder="https://shop.example.com"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-subtle">REST API Base Path</span>
                      <input
                        type="text"
                        required
                        value={formState.wooApiBasePath}
                        onChange={(event) => setFormState((current) => ({ ...current, wooApiBasePath: event.target.value }))}
                        className="h-11 min-w-[44px] w-full rounded-xl border border-border-ghost bg-surface-base px-4 text-sm text-on-surface outline-none transition-all focus:border-primary/40"
                        placeholder="/wp-json/wc/v3"
                      />
                    </label>
                  </div>
                </>
              ) : null}

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
                    {isSaving ? 'Saving…' : 'Save Credential'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <a
        href="/dashboard/settings"
        className="fixed bottom-6 right-6 inline-flex h-11 min-w-[44px] items-center gap-2 rounded-xl border border-border-ghost bg-surface-card/90 px-4 text-xs font-bold text-on-surface-subtle backdrop-blur-md transition-all hover:text-on-surface active:scale-[0.98]"
      >
        <PlugZap className="size-4" />
        Settings
      </a>
    </div>
  );
}
