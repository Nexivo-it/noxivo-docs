import { NextResponse } from 'next/server';
import { getCurrentSession } from '../../../../lib/auth/session';
import { canManageAgencySettings } from '../../../../lib/auth/authorization';
import { resolveDashboardMessagingSession } from '../../../../lib/api/messaging-session';
import { resolveActorTenantId } from '../../../../lib/auth/tenant-context';
import { engineClient } from '../../../../lib/api/engine-client';

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (
    error.name === 'AbortError'
    || error.message.includes('timed out')
    || error.message.includes('Headers Timeout')

  );
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const SESSION_STARTUP_DELAY_MS = 2500;

type QrAction = 'login' | 'regenerate';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBootstrapSessionName(value: unknown): string | null {
  if (!isRecord(value) || typeof value.sessionName !== 'string') {
    return null;
  }

  const sessionName = value.sessionName.trim();
  return sessionName.length > 0 ? sessionName : null;
}

async function readQrAction(request: Request): Promise<QrAction> {
  const payload = await request.json().catch(() => null);

  if (isRecord(payload) && payload.action === 'regenerate') {
    return 'regenerate';
  }

  return 'login';
}

export async function GET(_request: Request): Promise<NextResponse> {
  let session;

  try {
    session = await getCurrentSession();
  } catch {
    return NextResponse.json(
      { error: 'Dashboard session store unavailable. Please verify MONGODB_URI.' },
      { status: 503 }
    );
  }

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageAgencySettings(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const tenantId = resolveActorTenantId(session.actor);
  if (!tenantId) {
    return NextResponse.json(
      { error: 'No tenant workspace available for this agency context' },
      { status: 409 }
    );
  }

  const engineApiUrl = process.env.ENGINE_API_URL;
  const engineApiKey = process.env.ENGINE_API_KEY;
  const legacyBaseUrl = process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL;
  const legacyPsk = process.env.WORKFLOW_ENGINE_INTERNAL_PSK;
  const useEngineApi = Boolean(engineApiUrl && engineApiKey);
  const useLegacyProxy = Boolean(legacyBaseUrl && legacyPsk);

  if (!useEngineApi && !useLegacyProxy) {
    return NextResponse.json(
      { error: 'Engine API not configured' },
      { status: 500 }
    );
  }

  try {
    if (engineApiUrl && engineApiKey) {
      const data = await resolveDashboardMessagingSession(
        session.actor.agencyId,
        tenantId,
        null,
        { allowBootstrapRecovery: false }
      );
      return NextResponse.json({
        sessionName: data.sessionName,
        state: data.state,
        reason: data.reason,
        poll: data.poll,
        status: data.status,
        qr: data.qrValue,
        qrValue: data.qrValue,
        profile: data.profile,
        diagnostics: data.diagnostics,
        provisioning: data.provisioning,
        syncedAt: data.syncedAt
      }, { status: 200 });
    }

    if (legacyBaseUrl && legacyPsk) {
      const query = new URLSearchParams({
        agencyId: session.actor.agencyId,
        tenantId
      });

      const response = await fetch(`${legacyBaseUrl}/v1/messaging/session/qr?${query.toString()}`, {
        headers: {
          'x-nexus-internal-psk': legacyPsk
        }
      });

      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }
  } catch (error) {
    if (isAbortLikeError(error)) {
      return NextResponse.json(
        { error: 'Backend is responding slowly. Please retry.' },
        { status: 503 }
      );
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: useLegacyProxy ? `Failed to communicate with backend: ${errorMessage}` : `Failed to communicate with Engine API: ${errorMessage}` },
      { status: 502 }
    );
  }

}

export async function POST(request: Request): Promise<NextResponse> {
  let session;

  try {
    session = await getCurrentSession();
  } catch {
    return NextResponse.json(
      { error: 'Dashboard session store unavailable. Please verify MONGODB_URI.' },
      { status: 503 }
    );
  }

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageAgencySettings(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenantId = resolveActorTenantId(session.actor);
  if (!tenantId) {
    return NextResponse.json(
      { error: 'No tenant workspace available for this agency context' },
      { status: 409 }
    );
  }

  if (!process.env.ENGINE_API_URL || !process.env.ENGINE_API_KEY) {
    return NextResponse.json({ error: 'Engine API not configured' }, { status: 500 });
  }

  let bootstrapped = false;
  let restarted = false;
  const action = await readQrAction(request);

  try {
    let binding = await engineClient
      .getSessionByTenant(session.actor.agencyId, tenantId)
      .catch(() => null);

    if (!binding) {
      const bsResult = await engineClient.bootstrapSession(session.actor.agencyId, tenantId);
      const bootstrapSessionName = readBootstrapSessionName(bsResult);
      bootstrapped = true;
      binding = await engineClient.getSessionByTenant(session.actor.agencyId, tenantId).catch(() => null);
      if (!binding && bootstrapSessionName) {
        binding = { id: bootstrapSessionName, name: bootstrapSessionName };
      }

      if (!binding) {
        throw new Error('Failed to create or lookup session binding');
      }

      // Give MessagingProvider time to spin-up the new session container and emit a QR
      await delay(SESSION_STARTUP_DELAY_MS);
    }

    const statusPayload = await engineClient.getStatus(binding.id).catch(() => null);
    const rawStatus = statusPayload?.status?.trim().toUpperCase();
    const shouldStartSession = !rawStatus
      || rawStatus === 'STOPPED'
      || rawStatus === 'OFFLINE'
      || rawStatus === 'FAILED'
      || rawStatus === 'UNAVAILABLE';

    if (action === 'regenerate') {
      if (shouldStartSession) {
        await engineClient.startSession(binding.id);
      } else {
        await engineClient.restartSession(binding.id);
      }
      restarted = true;
      await delay(SESSION_STARTUP_DELAY_MS); // Give MessagingProvider time to rebuild container and get QR
    } else if (shouldStartSession) {
      await engineClient.startSession(binding.id);
      restarted = true;
      await delay(SESSION_STARTUP_DELAY_MS); // Give MessagingProvider time to rebuild container and get QR
    }

    const data = await resolveDashboardMessagingSession(
      session.actor.agencyId,
      tenantId,
      null,
      { allowBootstrapRecovery: true }
    );

    return NextResponse.json({
      sessionName: data.sessionName,
      state: data.state,
      reason: data.reason,
      poll: data.poll,
      status: data.status,
      qr: data.qrValue,
      qrValue: data.qrValue,
      profile: data.profile,
      diagnostics: data.diagnostics,
      provisioning: data.provisioning,
      syncedAt: data.syncedAt,
      bootstrapped,
      restarted
    });
  } catch (error) {
    if (isAbortLikeError(error)) {
      return NextResponse.json(
        { error: 'Backend is responding slowly. Please retry.' },
        { status: 503 }
      );
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { 
        error: action === 'regenerate' 
          ? `Failed to regenerate WhatsApp QR code: ${errorMessage}` 
          : `Failed to recover WhatsApp session: ${errorMessage}` 
      },
      { status: 502 }
    );
  }
}

export async function DELETE(_request: Request): Promise<NextResponse> {
  let session;

  try {
    session = await getCurrentSession();
  } catch {
    return NextResponse.json(
      { error: 'Dashboard session store unavailable. Please verify MONGODB_URI.' },
      { status: 503 }
    );
  }

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageAgencySettings(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenantId = resolveActorTenantId(session.actor);
  if (!tenantId) {
    return NextResponse.json(
      { error: 'No tenant workspace available for this agency context' },
      { status: 409 }
    );
  }

  if (!process.env.ENGINE_API_URL || !process.env.ENGINE_API_KEY) {
    return NextResponse.json({ error: 'Engine API not configured' }, { status: 500 });
  }

  try {
    const binding = await engineClient
      .getSessionByTenant(session.actor.agencyId, tenantId)
      .catch(() => null);

    if (binding) {
      const logoutError = await engineClient.logoutSession(binding.id)
        .then(() => null)
        .catch((error: unknown) => error);
      const stopError = await engineClient.stopSession(binding.id)
        .then(() => null)
        .catch((error: unknown) => error);

      if (logoutError && stopError) {
        return NextResponse.json(
          { error: 'Failed to revoke WhatsApp session' },
          { status: 502 }
        );
      }
    }

    const data = await resolveDashboardMessagingSession(
      session.actor.agencyId,
      tenantId,
      null,
      { allowBootstrapRecovery: false }
    );

    return NextResponse.json({
      ok: true,
      sessionName: data.sessionName,
      state: data.state,
      reason: data.reason,
      poll: data.poll,
      status: data.status,
      qr: data.qrValue,
      qrValue: data.qrValue,
      profile: data.profile,
      diagnostics: data.diagnostics,
      provisioning: data.provisioning,
      syncedAt: data.syncedAt
    });
  } catch (error) {
    if (isAbortLikeError(error)) {
      return NextResponse.json(
        { error: 'Backend is responding slowly. Please retry.' },
        { status: 503 }
      );
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to revoke WhatsApp session: ${errorMessage}` },
      { status: 502 }
    );
  }
}
