import { NextResponse } from 'next/server';
import { CatalogSettingsModel, MediaStorageConfigModel, TenantModel } from '@noxivo/database';
import dbConnect from '../../../../lib/mongodb';
import { getCurrentSession } from '../../../../lib/auth/session';
import { resolveActorTenantId } from '../../../../lib/auth/tenant-context';

export async function GET(): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = resolveActorTenantId(session.actor);
  if (!tenantId) {
    return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
  }

  const timeoutPromise = new Promise<never>((_, reject) => 
    setTimeout(() => reject(new Error('API request timed out after 8s')), 8000)
  );

  try {
    const result = await Promise.race([
      (async () => {
        console.log('[DEBUG] API: Connecting to DB...');
        await dbConnect();
        console.log('[DEBUG] API: DB connected');
        
        console.log(`[CatalogSettings] Fetching settings for tenant: ${tenantId}`);

        console.log('[DEBUG] API: Finding settings...');
        let settings = await CatalogSettingsModel.findOne({ tenantId }).lean();
        console.log('[DEBUG] API: Settings found:', !!settings);
        
        // If no settings exist, create defaults or pull from tenant
        if (!settings) {
          console.log(`[CatalogSettings] No settings found, creating defaults for tenant: ${tenantId}`);
          const tenant = await TenantModel.findById(tenantId).lean();
          settings = await CatalogSettingsModel.findOneAndUpdate(
            { tenantId },
            { 
              tenantId,
              businessName: tenant?.name || '',
              currency: 'USD',
              timezone: 'UTC',
              accentColor: '#4F46E5',
              logoUrl: '',
              defaultDuration: 30
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          ).lean();
        }

        const tenant = await TenantModel.findById(tenantId).lean();
        const storageConfig = await MediaStorageConfigModel.findOne({ agencyId: session.actor.agencyId }).lean();

        return { settings, storageConfig, tenant };
      })(),
      timeoutPromise
    ]);

    const { settings, storageConfig, tenant } = result;

    // Redaction logic for storage secrets
    const redactedSecretConfig = storageConfig?.secretConfig ? 
      Object.keys(storageConfig.secretConfig).reduce((acc: any, key) => {
        acc[key] = '$$$$$$';
        return acc;
      }, {}) : {};

    return NextResponse.json({
      settings,
      storage: {
        provider: storageConfig?.provider || 'local',
        isActive: storageConfig?.isActive ?? true,
        publicBaseUrl: storageConfig?.publicBaseUrl || '',
        publicConfig: storageConfig?.publicConfig || {},
        secretConfig: redactedSecretConfig,
        pathPrefix: storageConfig?.pathPrefix || ''
      },
      storeUrl: tenant ? `https://${tenant.slug}.noxivo.app` : null
    });

  } catch (error) {
    console.error('[DEBUG] API ERROR:', error);
    const isTimeout = error instanceof Error && error.message.includes('timeout');
    return NextResponse.json(
      { 
        error: isTimeout ? 'API Timeout' : 'Internal Server Error', 
        details: error instanceof Error ? error.message : String(error) 
      }, 
      { status: isTimeout ? 504 : 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = resolveActorTenantId(session.actor);
  if (!tenantId) {
    return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    await dbConnect();

    console.log(`[CatalogSettings] Updating settings for tenant: ${tenantId}`);

    const { 
      businessName, 
      currency, 
      timezone, 
      accentColor, 
      logoUrl, 
      defaultDuration,
      storage
    } = body;

    const settings = await CatalogSettingsModel.findOneAndUpdate(
      { tenantId },
      {
        $set: {
          businessName,
          currency,
          timezone,
          accentColor,
          logoUrl,
          defaultDuration
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    // Handle Storage updates if provided
    if (storage) {
      const { provider, isActive, publicBaseUrl, publicConfig, secretConfig, pathPrefix } = storage;
      
      const updateData: any = {
        provider,
        isActive,
        publicBaseUrl,
        publicConfig,
        pathPrefix
      };

      // Only update secrets that aren't the redacted placeholder
      if (secretConfig) {
        const existingConfig = await MediaStorageConfigModel.findOne({ agencyId: session.actor.agencyId });
        const mergedSecrets = { ...(existingConfig?.secretConfig || {}) };
        
        Object.entries(secretConfig).forEach(([key, value]) => {
          if (value !== '$$$$$$') {
            mergedSecrets[key] = value;
          }
        });
        
        updateData.secretConfig = mergedSecrets;
      }

      await MediaStorageConfigModel.findOneAndUpdate(
        { agencyId: session.actor.agencyId },
        { $set: updateData },
        { upsert: true, new: true }
      );
    }

    // Also update tenant white-label overrides if accent color or logo changed
    if (accentColor || logoUrl) {
      await TenantModel.findByIdAndUpdate(tenantId, {
        $set: {
          'whiteLabelOverrides.primaryColor': accentColor,
          'whiteLabelOverrides.logoUrl': logoUrl
        }
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error('[CatalogSettings] Failed to update catalog settings:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 
      { status: 500 }
    );
  }
}
