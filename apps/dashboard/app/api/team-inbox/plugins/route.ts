import { NextResponse } from 'next/server';
import { PluginInstallationModel } from '@noxivo/database';
import dbConnect from '../../../../lib/mongodb';
import { getCurrentSession } from '../../../../lib/auth/session';
import { resolveActorTenantCandidates, resolveActorTenantId } from '../../../../lib/auth/tenant-context';

function isValidPluginInput(input: unknown): input is { pluginId: string; pluginVersion: string; enabled: boolean; config?: Record<string, unknown> } {
  if (!input || typeof input !== 'object') return false;
  const obj = input as Record<string, unknown>;
  return typeof obj.pluginId === 'string' && obj.pluginId.length > 0
    && typeof obj.pluginVersion === 'string' && obj.pluginVersion.length > 0
    && typeof obj.enabled === 'boolean';
}

export async function GET(request: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const requestedTenantId = resolveActorTenantId(session.actor);
  if (!requestedTenantId) {
    return NextResponse.json(
      { error: 'No tenant workspace available for this agency context' },
      { status: 409 }
    );
  }

  const { searchParams } = new URL(request.url);
  const pluginId = searchParams.get('pluginId');

  await dbConnect();
  const resolvedTenantCandidates = await resolveActorTenantCandidates(session.actor);
  const tenantId = resolvedTenantCandidates[0] ?? requestedTenantId;

  const query: Record<string, unknown> = {
    agencyId: session.actor.agencyId,
    tenantId
  };
  if (pluginId) query.pluginId = pluginId;

  const installations = await PluginInstallationModel.find(query).lean();
  return NextResponse.json(installations.map(i => ({
    pluginId: i.pluginId,
    pluginVersion: i.pluginVersion,
    enabled: i.enabled,
    config: i.config,
    createdAt: i.createdAt?.toISOString(),
    updatedAt: i.updatedAt?.toISOString()
  })));
}

export async function POST(request: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const requestedTenantId = resolveActorTenantId(session.actor);
  if (!requestedTenantId) {
    return NextResponse.json(
      { error: 'No tenant workspace available for this agency context' },
      { status: 409 }
    );
  }

  const raw = await request.json().catch(() => null);
  if (!isValidPluginInput(raw)) {
    return NextResponse.json({ error: 'Invalid plugin configuration' }, { status: 400 });
  }

  await dbConnect();
  const resolvedTenantCandidates = await resolveActorTenantCandidates(session.actor);
  const tenantId = resolvedTenantCandidates[0] ?? requestedTenantId;
  const { pluginId, pluginVersion, enabled, config } = raw;

  const installation = await PluginInstallationModel.findOneAndUpdate(
    { agencyId: session.actor.agencyId, tenantId, pluginId },
    { $set: { pluginVersion, enabled, ...(config ? { config } : {}) } },
    { upsert: true, new: true }
  ).lean();

  return NextResponse.json({
    pluginId: installation.pluginId,
    pluginVersion: installation.pluginVersion,
    enabled: installation.enabled,
    config: installation.config
  });
}
