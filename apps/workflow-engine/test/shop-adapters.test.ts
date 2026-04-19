import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { ShopifyAdapter } from '../src/modules/agents/tools/data-sources/shopify.adapter.js';
import { WooCommerceAdapter } from '../src/modules/agents/tools/data-sources/woocommerce.adapter.js';
import { getDataSourceAdapter } from '../src/modules/agents/tools/data-sources/factory.js';
import { DataSourceModel, TenantCredentialModel } from '@noxivo/database';
import mongoose from 'mongoose';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('Shop Data Sources', () => {
  describe('ShopifyAdapter', () => {
    it('searches products and normalizes response', async () => {
      const adapter = new ShopifyAdapter({
        storeUrl: 'test-store.myshopify.com',
        accessToken: 'shpat_test',
        apiVersion: '2025-01'
      });

      const mockResponse = {
        products: [
          {
            id: 12345,
            title: 'Test Product',
            body_html: '<b>Very</b> nice product',
            variants: [{ price: '99.99', inventory_quantity: 5, sku: 'TS-01' }],
            image: { src: 'https://cdn.shopify.com/test.jpg' }
          }
        ]
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const results = await adapter.searchProducts({ query: 'test', limit: 1 });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://test-store.myshopify.com/admin/api/2025-01/products.json?title=test&limit=1'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Shopify-Access-Token': 'shpat_test'
          })
        })
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: '12345',
        title: 'Test Product',
        description: 'Very nice product',
        price: 99.99,
        currency: 'USD',
        available: true,
        sku: 'TS-01',
        image: 'https://cdn.shopify.com/test.jpg'
      });
    });
  });

  describe('WooCommerceAdapter', () => {
    it('searches products and normalizes response', async () => {
      const adapter = new WooCommerceAdapter({
        storeUrl: 'https://test-woo.com',
        consumerKey: 'ck_123',
        consumerSecret: 'cs_456'
      });

      const mockResponse = [
        {
          id: 789,
          name: 'Woo Product',
          description: '<p>Woo desc</p>',
          price: '49.50',
          stock_status: 'instock',
          sku: 'WOO-01',
          images: [{ src: 'https://test-woo.com/image.png' }]
        }
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const results = await adapter.searchProducts({ query: 'woo', limit: 1 });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://test-woo.com/wp-json/wc/v3/products?search=woo&per_page=1'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Basic ')
          })
        })
      );

      expect(results[0]).toMatchObject({
        id: '789',
        title: 'Woo Product',
        available: true,
        price: 49.5
      });
    });
  });

  describe('DataSource Factory', () => {
    beforeAll(async () => {
      await connectWorkflowEngineTestDb({ dbName: 'noxivo-factory-tests' });
      await Promise.all([
        DataSourceModel.init(),
        TenantCredentialModel.init()
      ]);
    });

    afterAll(async () => {
      await disconnectWorkflowEngineTestDb();
    });

    beforeEach(async () => {
      await resetWorkflowEngineTestDb();
      vi.resetAllMocks();
    });

    it('resolves ShopifyAdapter when configured', async () => {
      const agencyId = new mongoose.Types.ObjectId().toString();
      const tenantId = new mongoose.Types.ObjectId().toString();

      const cred = await TenantCredentialModel.create({
        agencyId,
        tenantId,
        provider: 'shopify',
        displayName: 'My Shopify',
        encryptedData: JSON.stringify({ accessToken: 'test-token' }),
        status: 'active'
      });

      await DataSourceModel.create({
        agencyId,
        tenantId,
        pluginId: 'shop',
        providerType: 'shopify',
        displayName: 'Shopify Store',
        enabled: true,
        credentialRef: cred._id,
        config: { storeUrl: 'factory-test.com' }
      });

      const adapter = await getDataSourceAdapter({
        agencyId,
        tenantId,
        conversationId: 'conv-1',
        pluginId: 'ai-sales-agent'
      });

      expect(adapter).toBeInstanceOf(ShopifyAdapter);
    });

    it('falls back to MockStoreAdapter when no integration is found', async () => {
      const adapter = await getDataSourceAdapter({
        agencyId: new mongoose.Types.ObjectId().toString(),
        tenantId: new mongoose.Types.ObjectId().toString(),
        conversationId: 'any',
        pluginId: 'any'
      });

      const { MockStoreAdapter } = await import('../src/modules/agents/tools/data-sources/mock-store.adapter.js');
      expect(adapter).toBeInstanceOf(MockStoreAdapter);
    });
  });
});
