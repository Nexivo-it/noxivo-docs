import { DataSourceModel, TenantCredentialModel } from '@noxivo/database';
import { ShopifyAdapter } from './shopify.adapter.js';
import { WooCommerceAdapter } from './woocommerce.adapter.js';
import { MockStoreAdapter } from './mock-store.adapter.js';
import type { DataSourceAdapter } from './types.js';
import type { ToolContext } from '../tool-registry.js';
import {
  ShopifyCredentialSchema,
  WooCommerceCredentialSchema
} from '@noxivo/contracts';

/**
 * Resolves the appropriate product data source adapter for a given tenant context.
 */
export async function getDataSourceAdapter(context: ToolContext): Promise<DataSourceAdapter> {
  const { agencyId, tenantId } = context;

  // 1. Find the enabled 'shop' data source for this tenant
  // We check for pluginId 'shop' first (new standard), then fall back to 'ai-sales-agent' 
  // if that's where it was historically stored.
  const dataSource = await DataSourceModel.findOne({
    agencyId,
    tenantId,
    enabled: true,
    pluginId: { $in: ['shop', 'ai-sales-agent'] },
    providerType: { $in: ['shopify', 'woocommerce'] }
  }).lean().exec();

  if (!dataSource || !dataSource.credentialRef) {
    console.log(`[DataSourceFactory] No active shop integration found for tenant ${tenantId}, falling back to MockStoreAdapter`);
    return new MockStoreAdapter();
  }

  // 2. Fetch the linked credential
  const credential = await TenantCredentialModel.findById(dataSource.credentialRef).lean().exec();
  if (!credential || credential.status !== 'active') {
    console.warn(`[DataSourceFactory] Active credential not found for data source ${dataSource._id}`);
    return new MockStoreAdapter();
  }

  // 3. Resolve adapter by providerType
  try {
    // Note: encryptedData is currently a JSON string of the secret payload
    const secret = JSON.parse(credential.encryptedData);

    if (dataSource.providerType === 'shopify') {
      const parsedSecret = ShopifyCredentialSchema.parse(secret);
      return new ShopifyAdapter({
        storeUrl: dataSource.config?.storeUrl || credential.config?.storeUrl,
        accessToken: parsedSecret.accessToken,
        apiVersion: dataSource.config?.apiVersion || credential.config?.apiVersion
      });
    }

    if (dataSource.providerType === 'woocommerce') {
      const parsedSecret = WooCommerceCredentialSchema.parse(secret);
      return new WooCommerceAdapter({
        storeUrl: dataSource.config?.storeUrl || credential.config?.storeUrl,
        consumerKey: parsedSecret.consumerKey,
        consumerSecret: parsedSecret.consumerSecret,
        apiBasePath: dataSource.config?.apiBasePath || credential.config?.apiBasePath
      });
    }
  } catch (error) {
    console.error(`[DataSourceFactory] Failed to initialize adapter for ${dataSource.providerType}:`, error);
  }

  return new MockStoreAdapter();
}
