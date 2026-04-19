type EngineSessionBinding = {
  id: string;
  name: string;
};

type EngineBootstrapResponse = {
  sessionName: string;
  status: 'WORKING' | 'SCAN_QR_CODE';
};

type EngineSessionStatus = {
  status?: string;
  me?: Record<string, unknown> | null;
};

type EngineSessionProfile = Record<string, unknown> | null;

export type DashboardMessagingSessionSnapshot = {
  sessionName: string;
  status: 'available' | 'connected' | 'provisioning' | 'unavailable';
  qr: string | null;
  profile: EngineSessionProfile;
  diagnostics: Record<string, unknown> | null;
  provisioning: boolean;
  syncedAt: string;
};

const ENGINE_REQUEST_TIMEOUT_MS = 7000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readIdentifier(value: unknown): string | null {
  const direct = readString(value);
  if (direct) {
    return direct;
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

function hasMeIdentity(me: unknown): boolean {
  if (!isRecord(me)) {
    return false;
  }

  return Boolean(
    readString(me.id)
    ?? readString(me.phone)
    ?? readString(me.phoneNumber)
    ?? readIdentifier(me.wid)
  );
}

function hasProfileIdentity(profile: EngineSessionProfile): profile is Record<string, unknown> {
  if (!isRecord(profile)) {
    return false;
  }

  const hasErrorEnvelope = typeof profile.statusCode === 'number' && Boolean(readString(profile.error));
  if (hasErrorEnvelope) {
    return false;
  }

  return Boolean(
    readString(profile.id)
    ?? readString(profile.phone)
    ?? readString(profile.phoneNumber)
    ?? readIdentifier(profile.wid)
    ?? readString(profile.name)
    ?? readString(profile.picture)
  );
}

function extractQrValue(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const qr = record.qr ?? record.qrValue ?? record.value ?? record.code;
  return typeof qr === 'string' && qr.length > 0 ? qr : null;
}

function getEngineApiConfig(): { baseUrl: string; apiKey: string } {
  const rawUrl = process.env.ENGINE_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.ENGINE_API_KEY;

  if (!rawUrl || !apiKey) {
    throw new Error('Engine API not configured');
  }

  // Normalize: strip any existing /api/v1 suffix then re-append it,
  // so the base URL is always "{origin}/api/v1" regardless of how
  // ENGINE_API_URL was defined (with or without the suffix).
  const originUrl = rawUrl.replace(/\/api\/v1$/, '');
  const baseUrl = `${originUrl}/api/v1`;

  return { baseUrl, apiKey };
}

async function fetchJsonWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchEngineJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl, apiKey } = getEngineApiConfig();
  const headers = new Headers(init.headers);
  headers.set('X-API-Key', apiKey);
  headers.set('Content-Type', 'application/json');

  const response = await fetchJsonWithTimeout(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers
  }, ENGINE_REQUEST_TIMEOUT_MS);

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    const message = payload?.error ?? response.statusText;
    throw new Error(message || `Engine API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function getSessionBinding(agencyId: string, tenantId: string): Promise<EngineSessionBinding | null> {
  const { baseUrl, apiKey } = getEngineApiConfig();
  const response = await fetchJsonWithTimeout(
    `${baseUrl}/sessions/by-tenant?agencyId=${encodeURIComponent(agencyId)}&tenantId=${encodeURIComponent(tenantId)}`,
    {
      headers: { 'X-API-Key': apiKey }
    },
    ENGINE_REQUEST_TIMEOUT_MS
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? `Failed to find session: ${response.statusText}`);
  }

  return response.json() as Promise<EngineSessionBinding>;
}

async function bootstrapSession(agencyId: string, tenantId: string, accountName?: string | null): Promise<EngineBootstrapResponse> {
  return await fetchEngineJson<EngineBootstrapResponse>('/sessions/bootstrap', {
    method: 'POST',
    body: JSON.stringify({
      agencyId,
      tenantId,
      ...(accountName ? { accountName } : {})
    })
  });
}

async function resolveBinding(agencyId: string, tenantId: string, accountName?: string | null): Promise<EngineSessionBinding> {
  const existingBinding = await getSessionBinding(agencyId, tenantId);

  if (existingBinding) {
    return existingBinding;
  }

  const bsResult = await bootstrapSession(agencyId, tenantId, accountName);

  const provisionedBinding = await getSessionBinding(agencyId, tenantId);

  if (provisionedBinding) {
    return provisionedBinding;
  }
  
  if (bsResult?.sessionName) {
    return { id: bsResult.sessionName, name: bsResult.sessionName };
  }

  throw new Error('Session binding not found after bootstrap');
}

async function getSessionStatus(sessionId: string): Promise<EngineSessionStatus | null> {
  try {
    return await fetchEngineJson<EngineSessionStatus>(`/sessions/${encodeURIComponent(sessionId)}/status`);
  } catch {
    return null;
  }
}

async function getSessionQr(sessionId: string): Promise<string | null> {
  try {
    const payload = await fetchEngineJson<{ qr?: string | null; qrValue?: string | null; value?: string | null }>(
      `/sessions/${encodeURIComponent(sessionId)}/qr`
    );

    const qrValue = payload.qr ?? payload.qrValue ?? payload.value ?? null;
    if (qrValue) {
      return qrValue;
    }
  } catch {
    return null;
  }
  return null;
}

async function getSessionProfile(sessionId: string): Promise<EngineSessionProfile> {
  try {
    return await fetchEngineJson<EngineSessionProfile>(`/sessions/${encodeURIComponent(sessionId)}/profile`);
  } catch {
    return null;
  }
}

export async function resolveDashboardMessagingSession(
  agencyId: string,
  tenantId: string,
  accountName?: string | null,
  options?: { allowBootstrapRecovery?: boolean }
): Promise<DashboardMessagingSessionSnapshot> {
  const allowBootstrapRecovery = options?.allowBootstrapRecovery ?? true;
  const readSnapshot = async (sessionId: string, sessionName: string): Promise<DashboardMessagingSessionSnapshot> => {
    const [statusPayload, qr] = await Promise.all([
      getSessionStatus(sessionId),
      getSessionQr(sessionId),
    ]);
    const rawStatus = statusPayload?.status?.trim().toUpperCase();
    const shouldFetchProfile = rawStatus === 'WORKING' || hasMeIdentity(statusPayload?.me);
    const profile = shouldFetchProfile ? await getSessionProfile(sessionId) : null;

    const diagnostics = statusPayload
      ? {
          status: statusPayload.status ?? 'unknown',
          me: statusPayload.me ?? null,
          engine: {
            name: 'MessagingProvider'
          }
        }
      : null;

    const profileConnected = hasProfileIdentity(profile);
    const meConnected = hasMeIdentity(statusPayload?.me);
    const connected = profileConnected || meConnected || rawStatus === 'WORKING';
    const sessionStatus = connected
      ? 'connected'
      : qr || rawStatus === 'SCAN_QR_CODE'
        ? 'available'
        : rawStatus === 'STOPPED' || rawStatus === 'OFFLINE'
          ? 'unavailable'
          : 'provisioning';
    const profileForUi = profileConnected
      ? profile
      : meConnected && isRecord(statusPayload?.me)
        ? statusPayload.me
        : null;

    return {
      sessionName,
      status: sessionStatus,
      qr,
      profile: profileForUi,
      diagnostics,
      provisioning: sessionStatus === 'provisioning',
      syncedAt: new Date().toISOString()
    };
  };

  const binding = allowBootstrapRecovery
    ? await resolveBinding(agencyId, tenantId, accountName)
    : await getSessionBinding(agencyId, tenantId);

  if (!binding) {
    return {
      sessionName: `unlinked-${agencyId.slice(-6)}-${tenantId.slice(-6)}`,
      status: 'unavailable',
      qr: null,
      profile: null,
      diagnostics: {
        status: 'UNLINKED',
        me: null,
        engine: { name: 'MessagingProvider' }
      },
      provisioning: false,
      syncedAt: new Date().toISOString()
    };
  }

  const snapshot = await readSnapshot(binding.id, binding.name);

  if (!allowBootstrapRecovery || snapshot.qr || snapshot.status === 'connected') {
    return snapshot;
  }

  // Recover stale/pending bindings by forcing one bootstrap attempt.
  // Suppress errors here so a slow MessagingProvider start doesn't crash the UI route.
  await bootstrapSession(agencyId, tenantId, accountName).catch(console.error);
  const reboundBinding = await getSessionBinding(agencyId, tenantId).catch(() => null) ?? binding;
  return readSnapshot(reboundBinding.id, reboundBinding.name);
}
