import { NextResponse } from 'next/server';
import {
  AirtableCredentialSchema,
  GoogleSheetsCredentialSchema,
  ShopifyCredentialSchema,
  WooCommerceCredentialSchema
} from '@noxivo/contracts';
import { DataSourceModel, TenantCredentialModel } from '@noxivo/database';
import dbConnect from '../../../../lib/mongodb';
import { getCurrentSession } from '../../../../lib/auth/session';
import { canManageCredentials } from '../../../../lib/auth/authorization';
import { resolveActorTenantId } from '../../../../lib/auth/tenant-context';

type SupportedProvider = 'airtable' | 'google_sheets' | 'shopify' | 'woocommerce';

type UpsertCredentialPayload = {
  provider: SupportedProvider;
  displayName?: string;
  secret: Record<string, unknown>;
  config?: Record<string, unknown>;
};

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

function parseUpsertPayload(input: unknown): UpsertCredentialPayload {
  if (!isRecord(input)) {
    throw new Error('Invalid payload object');
  }

  const provider = input.provider as string;
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
    secret: input.secret as Record<string, unknown>,
    ...(displayName ? { displayName } : {}),
    ...(input.config ? { config: input.config as Record<string, unknown> } : {})
  };
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

function defaultDisplayName(provider: SupportedProvider): string {
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

function isValidationError(error: unknown): boolean {
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
    'WooCommerce storeUrl is required'
  ].includes(error.message);
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

  const credentials = await TenantCredentialModel.find(
    { agencyId: session.actor.agencyId, tenantId },
    'provider displayName status config updatedAt'
  )
    .sort({ provider: 1 })
    .lean()
    .exec();

  return NextResponse.json({
    credentials: credentials.map((credential) => ({
      id: credential._id.toString(),
      provider: credential.provider,
      displayName: credential.displayName,
      status: credential.status,
      config: credential.config ?? {},
      updatedAt: credential.updatedAt.toISOString()
    }))
  });
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

  try {
    const body = parseUpsertPayload(await request.json());

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

    await dbConnect();

    const credential = await TenantCredentialModel.findOneAndUpdate(
      {
        agencyId: session.actor.agencyId,
        tenantId,
        provider: body.provider
      },
      {
        $set: {
          displayName: body.displayName ?? defaultDisplayName(body.provider),
          encryptedData: JSON.stringify(normalizedSecret),
          config: normalizedConfig,
          status: 'active'
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    ).lean().exec();

    if (!credential) {
      return NextResponse.json({ error: 'Failed to persist credential' }, { status: 500 });
    }

    if (body.provider === 'shopify' || body.provider === 'woocommerce') {
      await DataSourceModel.findOneAndUpdate(
        {
          agencyId: session.actor.agencyId,
          tenantId,
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
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      ).exec();
    }

    return NextResponse.json({
      id: credential._id.toString(),
      provider: credential.provider,
      displayName: credential.displayName,
      status: credential.status,
      config: credential.config ?? {},
      updatedAt: credential.updatedAt.toISOString()
    });
  } catch (error) {
    if (isValidationError(error)) {
      return NextResponse.json({ error: 'Invalid credential payload' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to persist credential' }, { status: 500 });
  }
}
