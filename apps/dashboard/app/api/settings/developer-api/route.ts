import { NextResponse } from 'next/server';
import { getCurrentSession } from '../../../../lib/auth/session';
import { resolveActorTenantId } from '../../../../lib/auth/tenant-context';
import { engineClient } from '../../../../lib/api/engine-client';

export async function GET() {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    return NextResponse.json(
      { error: 'Dashboard session store unavailable. Please verify MONGODB_URI.' },
      { status: 503 }
    );
  }
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = resolveActorTenantId(session.actor);
  if (!tenantId) return NextResponse.json({ error: 'No tenant workspace' }, { status: 409 });

  try {
    const data = await engineClient.getDeveloperApiKey(session.actor.agencyId, tenantId);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message || 'Failed to fetch API key' }, { status: 500 });
  }
}

export async function POST() {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    return NextResponse.json(
      { error: 'Dashboard session store unavailable. Please verify MONGODB_URI.' },
      { status: 503 }
    );
  }
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = resolveActorTenantId(session.actor);
  if (!tenantId) return NextResponse.json({ error: 'No tenant workspace' }, { status: 409 });

  try {
    const data = await engineClient.generateDeveloperApiKey(session.actor.agencyId, tenantId);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message || 'Failed to generate API key' }, { status: 500 });
  }
}

export async function DELETE() {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    return NextResponse.json(
      { error: 'Dashboard session store unavailable. Please verify MONGODB_URI.' },
      { status: 503 }
    );
  }
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = resolveActorTenantId(session.actor);
  if (!tenantId) return NextResponse.json({ error: 'No tenant workspace' }, { status: 409 });

  try {
    const data = await engineClient.revokeDeveloperApiKey(session.actor.agencyId, tenantId);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message || 'Failed to revoke API key' }, { status: 500 });
  }
}
