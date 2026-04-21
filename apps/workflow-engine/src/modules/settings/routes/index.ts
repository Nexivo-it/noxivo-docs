import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import {
  AirtableCredentialSchema,
  GoogleSheetsCredentialSchema,
  MediaStorageConfigSchema,
  ShopifyCredentialSchema,
  WooCommerceCredentialSchema,
} from '@noxivo/contracts';
import {
  AgencyModel,
  ApiKeyModel,
  DataSourceModel,
  MediaStorageConfigModel,
  PluginInstallationModel,
  TenantCredentialModel,
  WebhookInboxActivationModel,
  WebhookInboxSourceModel,
} from '@noxivo/database';
import { getSessionFromRequest, type SessionRecord } from '../../agency/session-auth.js';
import { canManageAgencySettings, canManageCredentials } from '../../agency/authorization.js';

type SupportedCredentialProvider = 'airtable' | 'google_sheets' | 'shopify' | 'woocommerce';
type SupportedShopProvider = 'shopify' | 'woocommerce';
type WebhookInboxSourceStatus = 'active' | 'disabled';

type SettingsContext = {
  session: SessionRecord;
  agencyId: string;
  tenantId: string;
};

type UpsertCredentialPayload = {
  provider: SupportedCredentialProvider;
  displayName?: string;
  secret: Record<string, unknown>;
  config?: Record<string, unknown>;
};

type ToggleProviderPayload = {
  provider: SupportedShopProvider;
  enabled: boolean;
};

type WebhookInboxSourceDto = {
  id: string;
  name: string;
  status: WebhookInboxSourceStatus;
  inboundPath: string;
  outboundUrl: string;
  outboundHeaders: Record<string, string>;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CreateWebhookInboxSourcePayload = {
  name: string;
  outboundUrl: string;
  inboundSecret: string;
  outboundHeaders: Record<string, string>;
};

type UpdateWebhookInboxSourcePayload = {
  name?: string;
  outboundUrl?: string;
  inboundSecret?: string;
  outboundHeaders?: Record<string, string>;
  status?: WebhookInboxSourceStatus;
};

type SessionBindingPayload = {
  id: string;
  name: string;
};

type SessionStatusPayload = {
  status?: string;
  me?: Record<string, unknown> | null;
};

type DashboardMessagingSessionSnapshot = {
  sessionName: string;
  state: 'unlinked' | 'preparing' | 'qr_ready' | 'connected' | 'failed';
  reason: string | null;
  poll: boolean;
  qrValue: string | null;
  status: 'available' | 'connected' | 'provisioning' | 'unavailable';
  qr: string | null;
  profile: Record<string, unknown> | null;
  diagnostics: Record<string, unknown> | null;
  provisioning: boolean;
  syncedAt: string;
};

const SHOP_PROVIDERS: SupportedShopProvider[] = ['shopify', 'woocommerce'];

const SHOP_PLAN_PERMISSIONS = {
  reseller_basic: { shopify: false, woocommerce: false },
  reseller_pro: { shopify: true, woocommerce: true },
  enterprise: { shopify: true, woocommerce: true },
} as const satisfies Record<string, Record<SupportedShopProvider, boolean>>;

const WEBHOOK_INBOX_SOURCE_VALIDATION_MESSAGES = new Set([
  'Invalid payload object',
  'Webhook source name must be between 2 and 120 characters',
  'outboundUrl must be a valid URL',
  'inboundSecret is required',
  'inboundSecret must be a non-empty string',
  'outboundHeaders must be an object of string values',
  'status must be active or disabled',
  'At least one field is required',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toRequiredString(value: unknown): string {
  const normalized = toOptionalString(value);
  if (!normalized) {
    throw new Error('Invalid payload object');
  }
  return normalized;
}

function normalizeOutboundHeaders(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  const normalizedEntries = Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, headerValue]) => [key, headerValue]);

  return Object.fromEntries(normalizedEntries);
}

function mapWebhookInboxSourceDto(source: {
  _id: { toString(): string };
  name: string;
  status: WebhookInboxSourceStatus;
  inboundPath: string;
  outboundUrl: string;
  outboundHeaders?: unknown;
  disabledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): WebhookInboxSourceDto {
  return {
    id: source._id.toString(),
    name: source.name,
    status: source.status,
    inboundPath: source.inboundPath,
    outboundUrl: source.outboundUrl,
    outboundHeaders: normalizeOutboundHeaders(source.outboundHeaders),
    disabledAt: source.disabledAt ? source.disabledAt.toISOString() : null,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

function hashWebhookInboundSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function parseWebhookSourceName(value: unknown): string {
  const normalized = toOptionalString(value);
  if (!normalized || normalized.length < 2 || normalized.length > 120) {
    throw new Error('Webhook source name must be between 2 and 120 characters');
  }

  return normalized;
}

function parseWebhookSourceUrl(value: unknown): string {
  const normalized = toOptionalString(value);
  if (!normalized) {
    throw new Error('outboundUrl must be a valid URL');
  }

  try {
    return new URL(normalized).toString();
  } catch {
    throw new Error('outboundUrl must be a valid URL');
  }
}

function parseWebhookSourceHeaders(value: unknown): Record<string, string> {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error('outboundHeaders must be an object of string values');
  }

  const normalizedEntries = Object.entries(value).map(([key, headerValue]) => {
    const normalizedKey = key.trim();
    const normalizedValue = toOptionalString(headerValue);
    if (normalizedKey.length === 0 || normalizedValue === undefined) {
      throw new Error('outboundHeaders must be an object of string values');
    }

    return [normalizedKey, normalizedValue] as const;
  });

  return Object.fromEntries(normalizedEntries);
}

function parseWebhookSourceInboundSecret(value: unknown): string {
  if (value === undefined) {
    throw new Error('inboundSecret is required');
  }

  const normalized = toOptionalString(value);
  if (!normalized) {
    throw new Error('inboundSecret must be a non-empty string');
  }

  return normalized;
}

function parseCreateWebhookInboxSourcePayload(input: unknown): CreateWebhookInboxSourcePayload {
  if (!isRecord(input)) {
    throw new Error('Invalid payload object');
  }

  return {
    name: parseWebhookSourceName(input.name),
    outboundUrl: parseWebhookSourceUrl(input.outboundUrl),
    inboundSecret: parseWebhookSourceInboundSecret(input.inboundSecret),
    outboundHeaders: parseWebhookSourceHeaders(input.outboundHeaders),
  };
}

function parseUpdateWebhookInboxSourcePayload(input: unknown): UpdateWebhookInboxSourcePayload {
  if (!isRecord(input)) {
    throw new Error('Invalid payload object');
  }

  const payload: UpdateWebhookInboxSourcePayload = {};

  if ('name' in input) {
    payload.name = parseWebhookSourceName(input.name);
  }

  if ('outboundUrl' in input) {
    payload.outboundUrl = parseWebhookSourceUrl(input.outboundUrl);
  }

  if ('inboundSecret' in input) {
    payload.inboundSecret = parseWebhookSourceInboundSecret(input.inboundSecret);
  }

  if ('outboundHeaders' in input) {
    payload.outboundHeaders = parseWebhookSourceHeaders(input.outboundHeaders);
  }

  if ('status' in input) {
    if (input.status !== 'active' && input.status !== 'disabled') {
      throw new Error('status must be active or disabled');
    }
    payload.status = input.status;
  }

  if (Object.keys(payload).length === 0) {
    throw new Error('At least one field is required');
  }

  return payload;
}

function isWebhookInboxSourceValidationError(error: unknown): error is Error {
  return error instanceof Error && WEBHOOK_INBOX_SOURCE_VALIDATION_MESSAGES.has(error.message);
}

function parseAirtableConfig(value: Record<string, unknown> | undefined): Record<string, string> {
  if (!value) {
    return {};
  }

  const baseId = toOptionalString(value.baseId);
  const tableId = toOptionalString(value.tableId);

  return {
    ...(baseId ? { baseId } : {}),
    ...(tableId ? { tableId } : {}),
  };
}

function parseGoogleSheetsConfig(value: Record<string, unknown> | undefined): Record<string, string> {
  if (!value) {
    return {};
  }

  const spreadsheetId = toOptionalString(value.spreadsheetId);
  const sheetName = toOptionalString(value.sheetName);

  return {
    ...(spreadsheetId ? { spreadsheetId } : {}),
    ...(sheetName ? { sheetName } : {}),
  };
}

function parseShopifyConfig(value: Record<string, unknown> | undefined): Record<string, string | number> {
  const storeUrl = toOptionalString(value?.storeUrl);
  const apiVersion = toOptionalString(value?.apiVersion) ?? '2025-01';

  if (!storeUrl) {
    throw new Error('Shopify storeUrl is required');
  }

  return {
    storeUrl,
    apiVersion,
    syncMode: 'hybrid',
    cacheTtlSeconds: 300,
  };
}

function parseWooCommerceConfig(value: Record<string, unknown> | undefined): Record<string, string | number> {
  const storeUrl = toOptionalString(value?.storeUrl);
  const apiBasePath = toOptionalString(value?.apiBasePath) ?? '/wp-json/wc/v3';

  if (!storeUrl) {
    throw new Error('WooCommerce storeUrl is required');
  }

  return {
    storeUrl,
    apiBasePath,
    syncMode: 'hybrid',
    cacheTtlSeconds: 300,
  };
}

function defaultDisplayName(provider: SupportedCredentialProvider): string {
  if (provider === 'airtable') {
    return 'Airtable';
  }

  if (provider === 'google_sheets') {
    return 'Google Sheets';
  }

  if (provider === 'shopify') {
    return 'Shopify';
  }

  return 'WooCommerce';
}

function parseUpsertCredentialPayload(input: unknown): UpsertCredentialPayload {
  if (!isRecord(input)) {
    throw new Error('Invalid payload object');
  }

  const provider = input.provider;
  if (provider !== 'airtable' && provider !== 'google_sheets' && provider !== 'shopify' && provider !== 'woocommerce') {
    throw new Error('Unsupported provider');
  }

  if (!isRecord(input.secret)) {
    throw new Error('Credential secret is required');
  }

  const displayName = toOptionalString(input.displayName);
  if (displayName && (displayName.length < 2 || displayName.length > 80)) {
    throw new Error('displayName must be between 2 and 80 characters');
  }

  if (input.config !== undefined && !isRecord(input.config)) {
    throw new Error('config must be an object');
  }

  return {
    provider,
    secret: input.secret,
    ...(displayName ? { displayName } : {}),
    ...(isRecord(input.config) ? { config: input.config } : {}),
  };
}

function isCredentialValidationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === 'ZodError') {
    return true;
  }

  return [
    'Invalid payload object',
    'Unsupported provider',
    'Credential secret is required',
    'displayName must be between 2 and 80 characters',
    'config must be an object',
    'Shopify storeUrl is required',
    'WooCommerce storeUrl is required',
  ].includes(error.message);
}

function isToggleProviderPayload(value: unknown): value is ToggleProviderPayload {
  if (!isRecord(value)) {
    return false;
  }

  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes('provider') || !keys.includes('enabled')) {
    return false;
  }

  if ((value.provider !== 'shopify' && value.provider !== 'woocommerce') || typeof value.enabled !== 'boolean') {
    return false;
  }

  return true;
}

function getEnabledProviders(config: unknown): SupportedShopProvider[] {
  if (!isRecord(config)) {
    return [];
  }

  const maybeEnabled = config.enabledProviders;
  if (!Array.isArray(maybeEnabled)) {
    return [];
  }

  const result: SupportedShopProvider[] = [];
  for (const value of maybeEnabled) {
    if ((value === 'shopify' || value === 'woocommerce') && !result.includes(value)) {
      result.push(value);
    }
  }

  return result;
}

function getShopPermissionsForPlan(plan: string): Record<SupportedShopProvider, boolean> {
  if (Object.hasOwn(SHOP_PLAN_PERMISSIONS, plan)) {
    return { ...SHOP_PLAN_PERMISSIONS[plan as keyof typeof SHOP_PLAN_PERMISSIONS] };
  }

  return { ...SHOP_PLAN_PERMISSIONS.reseller_basic };
}

function canUseShopProvider(plan: string, provider: SupportedShopProvider): boolean {
  return getShopPermissionsForPlan(plan)[provider];
}

function redactMediaConfig(config: {
  _id?: unknown;
  agencyId?: unknown;
  provider: string;
  isActive: boolean;
  publicBaseUrl?: string | null;
  publicConfig?: Record<string, string | number | boolean | null> | null;
  secretConfig?: Record<string, unknown> | null;
  pathPrefix?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  const secretEntries = Object.keys(config.secretConfig ?? {});
  const redactedSecret: Record<string, string> = {};
  for (const key of secretEntries) {
    redactedSecret[key] = '***REDACTED***';
  }

  return {
    ...(config._id ? { id: String(config._id) } : {}),
    ...(config.agencyId ? { agencyId: String(config.agencyId) } : {}),
    provider: config.provider,
    isActive: config.isActive,
    publicBaseUrl: config.publicBaseUrl ?? null,
    publicConfig: config.publicConfig ?? {},
    secretConfig: redactedSecret,
    pathPrefix: config.pathPrefix ?? '',
    ...(config.createdAt ? { createdAt: config.createdAt.toISOString() } : {}),
    ...(config.updatedAt ? { updatedAt: config.updatedAt.toISOString() } : {}),
  };
}

function mapStateToLegacyStatus(state: DashboardMessagingSessionSnapshot['state']): DashboardMessagingSessionSnapshot['status'] {
  if (state === 'connected') {
    return 'connected';
  }

  if (state === 'qr_ready') {
    return 'available';
  }

  if (state === 'preparing') {
    return 'provisioning';
  }

  return 'unavailable';
}

function hasMeIdentity(me: unknown): boolean {
  if (!isRecord(me)) {
    return false;
  }

  const id = toOptionalString(me.id);
  const phone = toOptionalString(me.phone);
  const phoneNumber = toOptionalString(me.phoneNumber);
  return Boolean(id ?? phone ?? phoneNumber);
}

function hasProfileIdentity(profile: Record<string, unknown> | null): boolean {
  if (!profile) {
    return false;
  }

  const hasErrorEnvelope = typeof profile.statusCode === 'number' && typeof profile.error === 'string';
  if (hasErrorEnvelope) {
    return false;
  }

  return Boolean(
    toOptionalString(profile.id)
      ?? toOptionalString(profile.phone)
      ?? toOptionalString(profile.phoneNumber)
      ?? toOptionalString(profile.name),
  );
}

function readQrPayload(input: unknown): string | null {
  if (typeof input === 'string' && input.trim().length > 0) {
    return input;
  }

  if (!isRecord(input)) {
    return null;
  }

  const direct = toOptionalString(input.qr) ?? toOptionalString(input.value) ?? toOptionalString(input.qrValue);
  if (direct) {
    return direct;
  }

  if (isRecord(input.qr) && typeof input.qr.value === 'string') {
    const nested = input.qr.value.trim();
    return nested.length > 0 ? nested : null;
  }

  return null;
}

function readQrAction(input: unknown): 'login' | 'regenerate' {
  if (isRecord(input) && input.action === 'regenerate') {
    return 'regenerate';
  }

  return 'login';
}

async function requireSessionContext(
  request: FastifyRequest,
  reply: FastifyReply,
  permissionCheck: (session: SessionRecord) => boolean,
): Promise<SettingsContext | null> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    await reply.status(401).send({ error: 'Unauthorized' });
    return null;
  }

  if (!permissionCheck(session)) {
    await reply.status(403).send({ error: 'Forbidden' });
    return null;
  }

  const tenantId = session.actor.tenantId || session.actor.tenantIds.find((candidate) => candidate.length > 0) || '';
  if (!tenantId) {
    await reply.status(409).send({ error: 'No tenant workspace available for this agency context' });
    return null;
  }

  return {
    session,
    agencyId: session.actor.agencyId,
    tenantId,
  };
}

async function requireCredentialsContext(request: FastifyRequest, reply: FastifyReply): Promise<SettingsContext | null> {
  return requireSessionContext(request, reply, canManageCredentials);
}

async function requireAgencySettingsContext(request: FastifyRequest, reply: FastifyReply): Promise<SettingsContext | null> {
  return requireSessionContext(request, reply, canManageAgencySettings);
}

function parseInternalResponse<T>(payload: string): T | null {
  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

async function resolveSessionBinding(
  fastify: FastifyInstance,
  context: SettingsContext,
  allowBootstrapRecovery: boolean,
): Promise<SessionBindingPayload | null> {
  const masterApiKey = process.env.ENGINE_API_KEY;
  if (!masterApiKey) {
    throw new Error('Engine API not configured');
  }

  const loadBinding = async (): Promise<SessionBindingPayload | null> => {
    const response = await fastify.inject({
      method: 'GET',
      url: `/api/v1/sessions/by-tenant?agencyId=${encodeURIComponent(context.agencyId)}&tenantId=${encodeURIComponent(context.tenantId)}`,
      headers: {
        'x-api-key': masterApiKey,
      },
    });

    if (response.statusCode === 404) {
      return null;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error('Failed to resolve session binding');
    }

    const payload = parseInternalResponse<SessionBindingPayload>(response.payload);
    if (!payload || typeof payload.id !== 'string' || typeof payload.name !== 'string') {
      throw new Error('Invalid session binding payload');
    }

    return payload;
  };

  const existing = await loadBinding();
  if (existing) {
    return existing;
  }

  if (!allowBootstrapRecovery) {
    return null;
  }

  const bootstrapResponse = await fastify.inject({
    method: 'POST',
    url: '/api/v1/sessions/bootstrap',
    headers: {
      'x-api-key': masterApiKey,
      'content-type': 'application/json',
    },
    payload: {
      agencyId: context.agencyId,
      tenantId: context.tenantId,
    },
  });

  if (bootstrapResponse.statusCode < 200 || bootstrapResponse.statusCode >= 300) {
    throw new Error('Failed to bootstrap session binding');
  }

  return loadBinding();
}

async function resolveDashboardMessagingSnapshot(
  fastify: FastifyInstance,
  context: SettingsContext,
  allowBootstrapRecovery: boolean,
): Promise<DashboardMessagingSessionSnapshot> {
  const masterApiKey = process.env.ENGINE_API_KEY;
  if (!masterApiKey) {
    throw new Error('Engine API not configured');
  }

  const binding = await resolveSessionBinding(fastify, context, allowBootstrapRecovery);

  if (!binding) {
    const state: DashboardMessagingSessionSnapshot['state'] = 'unlinked';
    return {
      sessionName: `unlinked-${context.agencyId.slice(-6)}-${context.tenantId.slice(-6)}`,
      state,
      reason: 'bootstrap_required',
      poll: false,
      qrValue: null,
      status: mapStateToLegacyStatus(state),
      qr: null,
      profile: null,
      diagnostics: {
        status: 'UNLINKED',
        me: null,
        engine: { name: 'MessagingProvider' },
      },
      provisioning: false,
      syncedAt: new Date().toISOString(),
    };
  }

  const statusResponse = await fastify.inject({
    method: 'GET',
    url: `/api/v1/sessions/${encodeURIComponent(binding.id)}/status`,
    headers: {
      'x-api-key': masterApiKey,
    },
  });
  const statusPayload = statusResponse.statusCode >= 200 && statusResponse.statusCode < 300
    ? parseInternalResponse<SessionStatusPayload>(statusResponse.payload)
    : null;

  const rawStatus = statusPayload?.status?.trim().toUpperCase();
  const isConnectedFromStatus = hasMeIdentity(statusPayload?.me) || rawStatus === 'WORKING';

  let qrValue: string | null = null;
  let recoverableQrError = false;
  if (!isConnectedFromStatus) {
    const qrResponse = await fastify.inject({
      method: 'GET',
      url: `/api/v1/sessions/${encodeURIComponent(binding.id)}/qr`,
      headers: {
        'x-api-key': masterApiKey,
      },
    });

    if (qrResponse.statusCode >= 200 && qrResponse.statusCode < 300) {
      qrValue = readQrPayload(parseInternalResponse<unknown>(qrResponse.payload));
    } else {
      recoverableQrError = true;
    }
  }

  let profile: Record<string, unknown> | null = null;
  if (rawStatus === 'WORKING' || hasMeIdentity(statusPayload?.me)) {
    const profileResponse = await fastify.inject({
      method: 'GET',
      url: `/api/v1/sessions/${encodeURIComponent(binding.id)}/profile`,
      headers: {
        'x-api-key': masterApiKey,
      },
    });

    if (profileResponse.statusCode >= 200 && profileResponse.statusCode < 300) {
      const parsedProfile = parseInternalResponse<Record<string, unknown>>(profileResponse.payload);
      if (parsedProfile) {
        profile = parsedProfile;
      }
    }
  }

  const diagnostics = statusPayload
    ? {
        status: statusPayload.status ?? 'unknown',
        me: statusPayload.me ?? null,
        engine: { name: 'MessagingProvider' },
      }
    : null;

  const meConnected = hasMeIdentity(statusPayload?.me);
  const profileConnected = hasProfileIdentity(profile);
  const connected = profileConnected || meConnected || rawStatus === 'WORKING';
  const recoverableStartupStates = new Set(['STARTING', 'SCAN_QR_CODE', 'PROVISIONING', 'BOOTING', 'INITIALIZING']);
  const failureStates = new Set(['FAILED', 'STOPPED', 'OFFLINE', 'UNAVAILABLE', 'ERROR']);
  const isRecoverableStartup = rawStatus ? recoverableStartupStates.has(rawStatus) : true;
  const isFailureState = rawStatus ? failureStates.has(rawStatus) : false;

  const state: DashboardMessagingSessionSnapshot['state'] = connected
    ? 'connected'
    : qrValue
      ? 'qr_ready'
      : isRecoverableStartup
        ? 'preparing'
        : 'failed';

  const reason: string | null = state === 'preparing'
    ? (recoverableQrError ? 'qr_fetch_recoverable_error' : 'startup_in_progress')
    : state === 'failed'
      ? isFailureState
        ? `status_${rawStatus?.toLowerCase() ?? 'unknown'}`
        : 'qr_unavailable'
      : null;

  const profileForUi = profileConnected
    ? profile
    : meConnected && isRecord(statusPayload?.me)
      ? statusPayload?.me
      : null;

  return {
    sessionName: binding.name,
    state,
    reason,
    poll: state === 'preparing' || state === 'qr_ready',
    qrValue,
    status: mapStateToLegacyStatus(state),
    qr: qrValue,
    profile: profileForUi,
    diagnostics,
    provisioning: state === 'preparing',
    syncedAt: new Date().toISOString(),
  };
}

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/credentials', async (request, reply) => {
    const context = await requireCredentialsContext(request, reply);
    if (!context) {
      return;
    }

    const credentials = await TenantCredentialModel.find(
      { agencyId: context.agencyId, tenantId: context.tenantId },
      'provider displayName status config updatedAt',
    )
      .sort({ provider: 1 })
      .lean()
      .exec();

    return reply.status(200).send({
      credentials: credentials.map((credential) => ({
        id: credential._id.toString(),
        provider: credential.provider,
        displayName: credential.displayName,
        status: credential.status,
        config: credential.config ?? {},
        updatedAt: credential.updatedAt.toISOString(),
      })),
    });
  });

  fastify.post('/credentials', async (request, reply) => {
    const context = await requireCredentialsContext(request, reply);
    if (!context) {
      return;
    }

    try {
      const body = parseUpsertCredentialPayload(request.body);

      let normalizedSecret: Record<string, string>;
      let normalizedConfig: Record<string, string | number> = {};

      if (body.provider === 'airtable') {
        normalizedSecret = AirtableCredentialSchema.parse(body.secret);
        normalizedConfig = parseAirtableConfig(body.config);
      } else if (body.provider === 'google_sheets') {
        normalizedSecret = GoogleSheetsCredentialSchema.parse(body.secret);
        normalizedConfig = parseGoogleSheetsConfig(body.config);
      } else if (body.provider === 'shopify') {
        normalizedSecret = ShopifyCredentialSchema.parse(body.secret);
        normalizedConfig = parseShopifyConfig(body.config);
      } else {
        normalizedSecret = WooCommerceCredentialSchema.parse(body.secret);
        normalizedConfig = parseWooCommerceConfig(body.config);
      }

      const credential = await TenantCredentialModel.findOneAndUpdate(
        {
          agencyId: context.agencyId,
          tenantId: context.tenantId,
          provider: body.provider,
        },
        {
          $set: {
            displayName: body.displayName ?? defaultDisplayName(body.provider),
            encryptedData: JSON.stringify(normalizedSecret),
            config: normalizedConfig,
            status: 'active',
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      ).lean().exec();

      if (!credential) {
        return reply.status(500).send({ error: 'Failed to persist credential' });
      }

      if (body.provider === 'shopify' || body.provider === 'woocommerce') {
        await DataSourceModel.findOneAndUpdate(
          {
            agencyId: context.agencyId,
            tenantId: context.tenantId,
            pluginId: 'shop',
            providerType: body.provider,
          },
          {
            $set: {
              displayName: body.displayName ?? defaultDisplayName(body.provider),
              credentialRef: credential._id,
              config: normalizedConfig,
            },
            $setOnInsert: {
              enabled: false,
              healthStatus: 'disabled',
            },
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          },
        ).exec();
      }

      return reply.status(200).send({
        id: credential._id.toString(),
        provider: credential.provider,
        displayName: credential.displayName,
        status: credential.status,
        config: credential.config ?? {},
        updatedAt: credential.updatedAt.toISOString(),
      });
    } catch (error) {
      if (isCredentialValidationError(error)) {
        return reply.status(400).send({ error: 'Invalid credential payload' });
      }

      return reply.status(500).send({ error: 'Failed to persist credential' });
    }
  });

  fastify.get('/shop', async (request, reply) => {
    const context = await requireCredentialsContext(request, reply);
    if (!context) {
      return;
    }

    const agency = await AgencyModel.findById(context.agencyId, { plan: 1 }).lean().exec();
    if (!agency) {
      return reply.status(404).send({ error: 'Agency not found' });
    }

    const credentials = await TenantCredentialModel.find(
      {
        agencyId: context.agencyId,
        tenantId: context.tenantId,
        provider: { $in: SHOP_PROVIDERS },
      },
      { provider: 1, status: 1 },
    ).lean().exec();

    const dataSources = await DataSourceModel.find(
      {
        agencyId: context.agencyId,
        tenantId: context.tenantId,
        pluginId: 'shop',
        providerType: { $in: SHOP_PROVIDERS },
      },
      { providerType: 1, enabled: 1, lastSyncedAt: 1 },
    ).lean().exec();

    const byProviderCredential = new Map<SupportedShopProvider, { status: string }>();
    for (const credential of credentials) {
      if (credential.provider === 'shopify' || credential.provider === 'woocommerce') {
        byProviderCredential.set(credential.provider, { status: credential.status });
      }
    }

    const byProviderDataSource = new Map<SupportedShopProvider, { enabled: boolean; lastSyncedAt: Date | null }>();
    for (const dataSource of dataSources) {
      if (dataSource.providerType === 'shopify' || dataSource.providerType === 'woocommerce') {
        byProviderDataSource.set(dataSource.providerType, {
          enabled: dataSource.enabled,
          lastSyncedAt: dataSource.lastSyncedAt ?? null,
        });
      }
    }

    return reply.status(200).send({
      providers: SHOP_PROVIDERS.map((provider) => {
        const credential = byProviderCredential.get(provider);
        const dataSource = byProviderDataSource.get(provider);

        return {
          provider,
          entitled: canUseShopProvider(agency.plan, provider),
          configured: credential !== undefined,
          enabled: dataSource?.enabled ?? false,
          credentialStatus: credential?.status ?? 'missing',
          lastSyncedAt: dataSource?.lastSyncedAt ? dataSource.lastSyncedAt.toISOString() : null,
        };
      }),
    });
  });

  fastify.post('/shop', async (request, reply) => {
    const context = await requireCredentialsContext(request, reply);
    if (!context) {
      return;
    }

    if (!isToggleProviderPayload(request.body)) {
      return reply.status(400).send({ error: 'Invalid payload' });
    }

    const payload = request.body;

    const agency = await AgencyModel.findById(context.agencyId, { plan: 1 }).lean().exec();
    if (!agency) {
      return reply.status(404).send({ error: 'Agency not found' });
    }

    if (!canUseShopProvider(agency.plan, payload.provider)) {
      return reply.status(403).send({ error: 'Provider not available on current plan' });
    }

    const credential = await TenantCredentialModel.findOne(
      {
        agencyId: context.agencyId,
        tenantId: context.tenantId,
        provider: payload.provider,
      },
      { _id: 1, displayName: 1, config: 1, status: 1 },
    ).lean().exec();

    if (payload.enabled && (!credential || credential.status !== 'active')) {
      return reply.status(409).send({ error: 'Provider credentials are required before activation' });
    }

    const existingInstallation = await PluginInstallationModel.findOne(
      {
        agencyId: context.agencyId,
        tenantId: context.tenantId,
        pluginId: 'shop',
      },
      { config: 1 },
    ).lean().exec();

    const currentEnabledProviders = getEnabledProviders(existingInstallation?.config);
    const nextEnabledProvidersSet = new Set<SupportedShopProvider>(currentEnabledProviders);
    if (payload.enabled) {
      nextEnabledProvidersSet.add(payload.provider);
    } else {
      nextEnabledProvidersSet.delete(payload.provider);
    }

    const nextEnabledProviders = SHOP_PROVIDERS.filter((provider) => nextEnabledProvidersSet.has(provider));
    const existingConfig = isRecord(existingInstallation?.config) ? existingInstallation.config : {};

    await PluginInstallationModel.findOneAndUpdate(
      {
        agencyId: context.agencyId,
        tenantId: context.tenantId,
        pluginId: 'shop',
      },
      {
        $set: {
          pluginVersion: '1.0.0',
          enabled: nextEnabledProviders.length > 0,
          config: {
            ...existingConfig,
            enabledProviders: nextEnabledProviders,
          },
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).exec();

    const dataSourceSet: {
      enabled: boolean;
      healthStatus: 'healthy' | 'disabled';
      displayName?: string;
      credentialRef?: unknown;
      config?: unknown;
    } = {
      enabled: payload.enabled,
      healthStatus: payload.enabled ? 'healthy' : 'disabled',
    };

    if (credential) {
      dataSourceSet.displayName = credential.displayName;
      dataSourceSet.credentialRef = credential._id;
      dataSourceSet.config = credential.config;
    }

    await DataSourceModel.findOneAndUpdate(
      {
        agencyId: context.agencyId,
        tenantId: context.tenantId,
        pluginId: 'shop',
        providerType: payload.provider,
      },
      {
        $set: dataSourceSet,
      },
      {
        upsert: payload.enabled || credential !== null,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).exec();

    return reply.status(200).send({
      provider: payload.provider,
      enabled: payload.enabled,
    });
  });

  fastify.get('/storage', async (request, reply) => {
    const context = await requireAgencySettingsContext(request, reply);
    if (!context) {
      return;
    }

    const config = await MediaStorageConfigModel.findOne({ agencyId: context.agencyId }).lean();
    return reply.status(200).send(config ? redactMediaConfig(config) : null);
  });

  fastify.put('/storage', async (request, reply) => {
    const context = await requireAgencySettingsContext(request, reply);
    if (!context) {
      return;
    }

    try {
      const input = MediaStorageConfigSchema.parse(request.body);

      const config = await MediaStorageConfigModel.findOneAndUpdate(
        { agencyId: context.agencyId },
        {
          $set: {
            agencyId: context.agencyId,
            provider: input.provider,
            isActive: input.isActive,
            publicBaseUrl: input.publicBaseUrl,
            publicConfig: input.publicConfig,
            secretConfig: input.secretConfig,
            pathPrefix: input.pathPrefix,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).lean();

      if (!config) {
        return reply.status(500).send({ error: 'Failed to update storage configuration' });
      }

      return reply.status(200).send(redactMediaConfig(config));
    } catch {
      return reply.status(400).send({ error: 'Failed to update storage configuration' });
    }
  });

  fastify.get('/webhook-inbox-activation', async (request, reply) => {
    const context = await requireCredentialsContext(request, reply);
    if (!context) {
      return;
    }

    const status = await WebhookInboxActivationModel.getStatus(context.agencyId, context.tenantId);
    return reply.status(200).send({
      isActive: status.isActive,
      webhookUrl: status.webhookUrl,
      activatedAt: status.activatedAt,
      deactivatedAt: status.deactivatedAt,
    });
  });

  fastify.post('/webhook-inbox-activation', async (request, reply) => {
    const context = await requireCredentialsContext(request, reply);
    if (!context) {
      return;
    }

    const status = await WebhookInboxActivationModel.activate(context.agencyId, context.tenantId);
    return reply.status(200).send({
      isActive: status.isActive,
      webhookUrl: status.webhookUrl,
      apiKey: status.apiKey,
      activatedAt: status.activatedAt,
    });
  });

  fastify.delete('/webhook-inbox-activation', async (request, reply) => {
    const context = await requireCredentialsContext(request, reply);
    if (!context) {
      return;
    }

    await WebhookInboxActivationModel.deactivate(context.agencyId, context.tenantId);
    return reply.status(200).send({ isActive: false });
  });

  fastify.get('/webhook-inbox-sources', async (request, reply) => {
    const context = await requireCredentialsContext(request, reply);
    if (!context) {
      return;
    }

    const sources = await WebhookInboxSourceModel.find(
      { agencyId: context.agencyId, tenantId: context.tenantId },
      { inboundSecretHash: 0 },
    )
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return reply.status(200).send({
      sources: sources.map((source) => mapWebhookInboxSourceDto(source)),
    });
  });

  fastify.post('/webhook-inbox-sources', async (request, reply) => {
    const context = await requireCredentialsContext(request, reply);
    if (!context) {
      return;
    }

    try {
      const payload = parseCreateWebhookInboxSourcePayload(request.body);
      const source = await WebhookInboxSourceModel.create({
        agencyId: context.agencyId,
        tenantId: context.tenantId,
        name: payload.name,
        status: 'active',
        inboundPath: randomUUID(),
        inboundSecretHash: hashWebhookInboundSecret(payload.inboundSecret),
        outboundUrl: payload.outboundUrl,
        outboundHeaders: payload.outboundHeaders,
        disabledAt: null,
      });

      return reply.status(201).send({
        source: mapWebhookInboxSourceDto(source),
      });
    } catch (error) {
      if (isWebhookInboxSourceValidationError(error)) {
        return reply.status(400).send({ error: error.message });
      }

      return reply.status(500).send({ error: 'Failed to create webhook inbox source' });
    }
  });

  fastify.patch('/webhook-inbox-sources/:sourceId', async (request, reply) => {
    const context = await requireCredentialsContext(request, reply);
    if (!context) {
      return;
    }

    try {
      const payload = parseUpdateWebhookInboxSourcePayload(request.body);
      const sourceId = toRequiredString((request.params as Record<string, unknown>).sourceId);

      const update: {
        name?: string;
        outboundUrl?: string;
        outboundHeaders?: Record<string, string>;
        inboundSecretHash?: string;
        status?: WebhookInboxSourceStatus;
        disabledAt?: Date | null;
      } = {};

      if (payload.name) {
        update.name = payload.name;
      }

      if (payload.outboundUrl) {
        update.outboundUrl = payload.outboundUrl;
      }

      if (payload.outboundHeaders) {
        update.outboundHeaders = payload.outboundHeaders;
      }

      if (payload.inboundSecret) {
        update.inboundSecretHash = hashWebhookInboundSecret(payload.inboundSecret);
      }

      if (payload.status) {
        update.status = payload.status;
        update.disabledAt = payload.status === 'disabled' ? new Date() : null;
      }

      const source = await WebhookInboxSourceModel.findOneAndUpdate(
        {
          _id: sourceId,
          agencyId: context.agencyId,
          tenantId: context.tenantId,
        },
        { $set: update },
        {
          new: true,
        },
      ).lean().exec();

      if (!source) {
        return reply.status(404).send({ error: 'Webhook inbox source not found' });
      }

      return reply.status(200).send({ source: mapWebhookInboxSourceDto(source) });
    } catch (error) {
      if (isWebhookInboxSourceValidationError(error)) {
        return reply.status(400).send({ error: error.message });
      }

      return reply.status(500).send({ error: 'Failed to update webhook inbox source' });
    }
  });

  fastify.get('/developer-api', async (request, reply) => {
    const context = await requireAgencySettingsContext(request, reply);
    if (!context) {
      return;
    }

    const keyRecord = await ApiKeyModel.findOne({
      agencyId: context.agencyId,
      tenantId: context.tenantId,
      status: 'active',
    }).lean();

    return reply.status(200).send({
      key: keyRecord?.key ?? null,
      status: keyRecord?.status ?? 'inactive',
    });
  });

  fastify.post('/developer-api', async (request, reply) => {
    const context = await requireAgencySettingsContext(request, reply);
    if (!context) {
      return;
    }

    await ApiKeyModel.updateMany(
      {
        agencyId: context.agencyId,
        tenantId: context.tenantId,
      },
      {
        $set: {
          status: 'revoked',
        },
      },
    ).exec();

    const key = `nx_${randomBytes(24).toString('hex')}`;
    const keyRecord = await ApiKeyModel.create({
      key,
      agencyId: context.agencyId,
      tenantId: context.tenantId,
      name: `User Key for ${context.agencyId}/${context.tenantId}`,
      status: 'active',
    });

    return reply.status(200).send({ key: keyRecord.key, status: keyRecord.status });
  });

  fastify.delete('/developer-api', async (request, reply) => {
    const context = await requireAgencySettingsContext(request, reply);
    if (!context) {
      return;
    }

    await ApiKeyModel.updateMany(
      {
        agencyId: context.agencyId,
        tenantId: context.tenantId,
      },
      {
        $set: {
          status: 'revoked',
        },
      },
    ).exec();

    return reply.status(200).send({ success: true });
  });

  fastify.get('/whatsapp-check', async (request, reply) => {
    const context = await requireAgencySettingsContext(request, reply);
    if (!context) {
      return;
    }

    try {
      const snapshot = await resolveDashboardMessagingSnapshot(fastify, context, false);
      return reply.status(200).send({
        agencyId: context.agencyId,
        tenantId: context.tenantId,
        ...snapshot,
      });
    } catch {
      return reply.status(502).send({ error: 'Failed to communicate with Engine API' });
    }
  });

  fastify.get('/qr', async (request, reply) => {
    const context = await requireAgencySettingsContext(request, reply);
    if (!context) {
      return;
    }

    try {
      const snapshot = await resolveDashboardMessagingSnapshot(fastify, context, false);
      return reply.status(200).send(snapshot);
    } catch {
      return reply.status(502).send({ error: 'Failed to communicate with Engine API' });
    }
  });

  fastify.post('/qr', async (request, reply) => {
    const context = await requireAgencySettingsContext(request, reply);
    if (!context) {
      return;
    }

    if (!process.env.ENGINE_API_KEY) {
      return reply.status(500).send({ error: 'Engine API not configured' });
    }

    const action = readQrAction(request.body);
    let restarted = false;
    let bootstrapped = false;

    try {
      let binding = await resolveSessionBinding(fastify, context, false);
      if (!binding) {
        binding = await resolveSessionBinding(fastify, context, true);
        bootstrapped = true;
      }

      if (!binding) {
        throw new Error('Failed to resolve session binding');
      }

      const statusResponse = await fastify.inject({
        method: 'GET',
        url: `/api/v1/sessions/${encodeURIComponent(binding.id)}/status`,
        headers: {
          'x-api-key': process.env.ENGINE_API_KEY,
        },
      });

      const statusPayload = statusResponse.statusCode >= 200 && statusResponse.statusCode < 300
        ? parseInternalResponse<SessionStatusPayload>(statusResponse.payload)
        : null;
      const rawStatus = statusPayload?.status?.trim().toUpperCase();
      const shouldStartSession = !rawStatus
        || rawStatus === 'STOPPED'
        || rawStatus === 'OFFLINE'
        || rawStatus === 'FAILED'
        || rawStatus === 'UNAVAILABLE';

      const runSessionAction = async (routePath: '/api/v1/sessions/start' | '/api/v1/sessions/restart') => {
        const actionResponse = await fastify.inject({
          method: 'POST',
          url: routePath,
          headers: {
            'x-api-key': process.env.ENGINE_API_KEY,
            'content-type': 'application/json',
          },
          payload: { id: binding.id },
        });

        if (actionResponse.statusCode < 200 || actionResponse.statusCode >= 300) {
          throw new Error('Failed to run session action');
        }
      };

      if (action === 'regenerate') {
        if (shouldStartSession) {
          await runSessionAction('/api/v1/sessions/start');
        } else {
          await runSessionAction('/api/v1/sessions/restart');
        }
        restarted = true;
      } else if (shouldStartSession) {
        await runSessionAction('/api/v1/sessions/start');
        restarted = true;
      }

      const snapshot = await resolveDashboardMessagingSnapshot(fastify, context, true);
      return reply.status(200).send({
        ...snapshot,
        bootstrapped,
        restarted,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(502).send({
        error: action === 'regenerate'
          ? `Failed to regenerate WhatsApp QR code: ${errorMessage}`
          : `Failed to recover WhatsApp session: ${errorMessage}`,
      });
    }
  });

  fastify.delete('/qr', async (request, reply) => {
    const context = await requireAgencySettingsContext(request, reply);
    if (!context) {
      return;
    }

    if (!process.env.ENGINE_API_KEY) {
      return reply.status(500).send({ error: 'Engine API not configured' });
    }

    try {
      const binding = await resolveSessionBinding(fastify, context, false);
      if (binding) {
        const logoutResponse = await fastify.inject({
          method: 'POST',
          url: '/api/v1/sessions/logout',
          headers: {
            'x-api-key': process.env.ENGINE_API_KEY,
            'content-type': 'application/json',
          },
          payload: { id: binding.id },
        });

        const stopResponse = await fastify.inject({
          method: 'POST',
          url: '/api/v1/sessions/stop',
          headers: {
            'x-api-key': process.env.ENGINE_API_KEY,
            'content-type': 'application/json',
          },
          payload: { id: binding.id },
        });

        if ((logoutResponse.statusCode < 200 || logoutResponse.statusCode >= 300)
          && (stopResponse.statusCode < 200 || stopResponse.statusCode >= 300)) {
          return reply.status(502).send({ error: 'Failed to revoke WhatsApp session' });
        }
      }

      const snapshot = await resolveDashboardMessagingSnapshot(fastify, context, false);
      return reply.status(200).send({ ok: true, ...snapshot });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(502).send({ error: `Failed to revoke WhatsApp session: ${errorMessage}` });
    }
  });
};
