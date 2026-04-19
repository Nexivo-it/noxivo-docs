import { NextResponse } from 'next/server';
import {
  AgencyModel,
  DataSourceModel,
  PluginInstallationModel,
  TenantCredentialModel,
} from '@noxivo/database';
import dbConnect from '../../../../lib/mongodb';
import { canManageCredentials } from '../../../../lib/auth/authorization';
import { getCurrentSession } from '../../../../lib/auth/session';
import { resolveActorTenantId } from '../../../../lib/auth/tenant-context';
import { canUseShopProvider, type SupportedShopProvider } from '../../../../lib/settings/shop-permissions';

type ShopProviderStatus = {
  provider: SupportedShopProvider;
  entitled: boolean;
  configured: boolean;
  enabled: boolean;
  credentialStatus: string;
  lastSyncedAt: string | null;
};

type ToggleProviderPayload = {
  provider: SupportedShopProvider;
  enabled: boolean;
};

const SHOP_PROVIDERS: SupportedShopProvider[] = ['shopify', 'woocommerce'];

function isToggleProviderPayload(value: unknown): value is ToggleProviderPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (keys.length !== 2 || !keys.includes('provider') || !keys.includes('enabled')) {
    return false;
  }

  if ((candidate.provider !== 'shopify' && candidate.provider !== 'woocommerce') || typeof candidate.enabled !== 'boolean') {
    return false;
  }

  return true;
}

function getEnabledProviders(config: unknown): SupportedShopProvider[] {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return [];
  }

  const maybeEnabled = (config as Record<string, unknown>).enabledProviders;
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

export async function GET(): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageCredentials(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenantId = resolveActorTenantId(session.actor);
  if (!tenantId) {
    return NextResponse.json(
      { error: 'No tenant workspace available for this agency context' },
      { status: 409 }
    );
  }

  await dbConnect();

  const agency = await AgencyModel.findById(session.actor.agencyId, { plan: 1 }).lean().exec();
  if (!agency) {
    return NextResponse.json({ error: 'Agency not found' }, { status: 404 });
  }

  const credentials = await TenantCredentialModel.find(
    {
      agencyId: session.actor.agencyId,
      tenantId,
      provider: { $in: SHOP_PROVIDERS },
    },
    { provider: 1, status: 1 }
  ).lean().exec();

  const dataSources = await DataSourceModel.find(
    {
      agencyId: session.actor.agencyId,
      tenantId,
      pluginId: 'shop',
      providerType: { $in: SHOP_PROVIDERS },
    },
    { providerType: 1, enabled: 1, lastSyncedAt: 1 }
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

  const providers: ShopProviderStatus[] = SHOP_PROVIDERS.map((provider) => {
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
  });

  return NextResponse.json({ providers });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageCredentials(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenantId = resolveActorTenantId(session.actor);
  if (!tenantId) {
    return NextResponse.json(
      { error: 'No tenant workspace available for this agency context' },
      { status: 409 }
    );
  }

  const payload = await request.json().catch(() => null);
  if (!isToggleProviderPayload(payload)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  await dbConnect();

  const agency = await AgencyModel.findById(session.actor.agencyId, { plan: 1 }).lean().exec();
  if (!agency) {
    return NextResponse.json({ error: 'Agency not found' }, { status: 404 });
  }

  if (!canUseShopProvider(agency.plan, payload.provider)) {
    return NextResponse.json({ error: 'Provider not available on current plan' }, { status: 403 });
  }

  const credential = await TenantCredentialModel.findOne(
    {
      agencyId: session.actor.agencyId,
      tenantId,
      provider: payload.provider,
    },
    { _id: 1, displayName: 1, config: 1, status: 1 }
  ).lean().exec();

  if (payload.enabled && (!credential || credential.status !== 'active')) {
    return NextResponse.json({ error: 'Provider credentials are required before activation' }, { status: 409 });
  }

  const existingInstallation = await PluginInstallationModel.findOne(
    {
      agencyId: session.actor.agencyId,
      tenantId,
      pluginId: 'shop',
    },
    { config: 1 }
  ).lean().exec();

  const currentEnabledProviders = getEnabledProviders(existingInstallation?.config);
  const nextEnabledProvidersSet = new Set<SupportedShopProvider>(currentEnabledProviders);
  if (payload.enabled) {
    nextEnabledProvidersSet.add(payload.provider);
  } else {
    nextEnabledProvidersSet.delete(payload.provider);
  }
  const nextEnabledProviders = SHOP_PROVIDERS.filter((provider) => nextEnabledProvidersSet.has(provider));

  const existingConfig =
    existingInstallation?.config && typeof existingInstallation.config === 'object' && !Array.isArray(existingInstallation.config)
      ? existingInstallation.config
      : {};

  await PluginInstallationModel.findOneAndUpdate(
    {
      agencyId: session.actor.agencyId,
      tenantId,
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
    }
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
      agencyId: session.actor.agencyId,
      tenantId,
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
    }
  ).exec();

  return NextResponse.json({
    provider: payload.provider,
    enabled: payload.enabled,
  });
}
