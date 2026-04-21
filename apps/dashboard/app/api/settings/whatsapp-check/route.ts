import { NextResponse } from 'next/server';
import { getCurrentSession } from '../../../../lib/auth/session';
import { canManageAgencySettings } from '../../../../lib/auth/authorization';
import { resolveDashboardMessagingSession } from '../../../../lib/api/messaging-session';
import { resolveActorTenantId } from '../../../../lib/auth/tenant-context';

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (
    error.name === 'AbortError'
    || error.message.includes('timed out')
    || error.message.includes('Headers Timeout')
  );
}

export async function GET(): Promise<NextResponse> {
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
        agencyId: session.actor.agencyId,
        tenantId,
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
    }

    else if (legacyBaseUrl && legacyPsk) {
      const query = new URLSearchParams({
        agencyId: session.actor.agencyId,
        tenantId
      });

      const response = await fetch(`${legacyBaseUrl}/v1/messaging/session/status?${query.toString()}`, {
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
    return NextResponse.json(
      { error: useLegacyProxy ? 'Failed to communicate with backend' : 'Failed to communicate with Engine API' },
      { status: 502 }
    );
  }
}
