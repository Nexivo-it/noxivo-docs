import { CatalogSettingsModel, MediaStorageConfigModel, TenantModel } from '@noxivo/database';
import { dbConnect } from '../../lib/mongodb.js';

type SettingsInput = {
  businessName?: string;
  currency?: 'USD' | 'EUR' | 'GBP' | 'VND' | 'AUD' | 'CAD';
  timezone?: string;
  accentColor?: string;
  logoUrl?: string;
  defaultDuration?: number;
  storage?: {
    provider?: 's3' | 'google_drive' | 'imagekit' | 'cloudinary' | 'bunny' | 'cloudflare_r2' | 'local';
    isActive?: boolean;
    publicBaseUrl?: string;
    publicConfig?: Record<string, string | number | boolean | null>;
    secretConfig?: Record<string, string>;
    pathPrefix?: string;
  };
};

function redactSecretConfig(secretConfig: unknown): Record<string, string> {
  if (!secretConfig || typeof secretConfig !== 'object' || Array.isArray(secretConfig)) {
    return {};
  }

  const entries = Object.keys(secretConfig as Record<string, unknown>);
  return Object.fromEntries(entries.map((entry) => [entry, '$$$$$$']));
}

function toStoreUrl(slug: string | null | undefined): string | null {
  if (!slug || slug.length === 0) {
    return null;
  }
  return `https://${slug}.noxivo.app`;
}

export async function getCatalogSettings(tenantId: string, agencyId: string) {
  await dbConnect();

  let settings = await CatalogSettingsModel.findOne({ tenantId }).lean();
  if (!settings) {
    const tenant = await TenantModel.findById(tenantId).lean();
    settings = await CatalogSettingsModel.findOneAndUpdate(
      { tenantId },
      {
        tenantId,
        businessName: tenant?.name ?? '',
        currency: 'USD',
        timezone: 'UTC',
        accentColor: '#4F46E5',
        logoUrl: '',
        defaultDuration: 30,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  }

  const [storageConfig, tenant] = await Promise.all([
    MediaStorageConfigModel.findOne({ agencyId }).lean(),
    TenantModel.findById(tenantId).lean(),
  ]);

  return {
    settings,
    storage: {
      provider: storageConfig?.provider ?? 'local',
      isActive: storageConfig?.isActive ?? true,
      publicBaseUrl: storageConfig?.publicBaseUrl ?? '',
      publicConfig: storageConfig?.publicConfig ?? {},
      secretConfig: redactSecretConfig(storageConfig?.secretConfig),
      pathPrefix: storageConfig?.pathPrefix ?? '',
    },
    storeUrl: toStoreUrl(tenant?.slug),
  };
}

export async function updateCatalogSettings(tenantId: string, agencyId: string, input: SettingsInput) {
  await dbConnect();

  const settings = await CatalogSettingsModel.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        businessName: input.businessName,
        currency: input.currency,
        timezone: input.timezone,
        accentColor: input.accentColor,
        logoUrl: input.logoUrl,
        defaultDuration: input.defaultDuration,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  if (input.storage) {
    const existingConfig = await MediaStorageConfigModel.findOne({ agencyId }).lean();
    const currentSecretConfig =
      existingConfig?.secretConfig && typeof existingConfig.secretConfig === 'object' && !Array.isArray(existingConfig.secretConfig)
        ? { ...(existingConfig.secretConfig as Record<string, unknown>) }
        : {};

    if (input.storage.secretConfig) {
      for (const [key, value] of Object.entries(input.storage.secretConfig)) {
        if (value !== '$$$$$$') {
          currentSecretConfig[key] = value;
        }
      }
    }

    await MediaStorageConfigModel.findOneAndUpdate(
      { agencyId },
      {
        $set: {
          provider: input.storage.provider,
          isActive: input.storage.isActive,
          publicBaseUrl: input.storage.publicBaseUrl,
          publicConfig: input.storage.publicConfig,
          pathPrefix: input.storage.pathPrefix,
          secretConfig: currentSecretConfig,
        },
      },
      { upsert: true, new: true },
    ).lean();
  }

  if (input.accentColor || input.logoUrl) {
    const tenant = await TenantModel.findById(tenantId).lean();
    const currentOverrides =
      tenant?.whiteLabelOverrides && typeof tenant.whiteLabelOverrides === 'object' && !Array.isArray(tenant.whiteLabelOverrides)
        ? tenant.whiteLabelOverrides as Record<string, unknown>
        : {};

    await TenantModel.findByIdAndUpdate(tenantId, {
      $set: {
        whiteLabelOverrides: {
          ...currentOverrides,
          ...(input.accentColor ? { primaryColor: input.accentColor } : {}),
          ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}),
        },
      },
    }).lean();
  }

  return settings;
}
