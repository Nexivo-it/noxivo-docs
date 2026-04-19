import type { DataSourceAdapter, Product, SearchOptions } from './types.js';

export class ShopifyAdapter implements DataSourceAdapter {
  constructor(
    private config: {
      storeUrl: string;
      accessToken: string;
      apiVersion?: string;
    }
  ) {}

  async searchProducts(options: SearchOptions): Promise<Product[]> {
    const { query, limit = 5 } = options;
    const { storeUrl, accessToken, apiVersion = '2025-01' } = this.config;

    // Normalize storeUrl (ensure it doesn't have https:// if it's just the domain)
    const domain = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `https://${domain}/admin/api/${apiVersion}/products.json?title=${encodeURIComponent(query)}&limit=${limit}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        signal: AbortSignal.timeout(10000) // 10s timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as { products: any[] };
      
      return data.products.map(p => ({
        id: String(p.id),
        title: p.title,
        description: p.body_html?.replace(/<[^>]*>?/gm, '') || '', // Strip HTML
        price: parseFloat(p.variants?.[0]?.price || '0'),
        currency: 'USD', // Shopify API returns price in store currency, normalization might be needed later
        available: (p.variants?.[0]?.inventory_quantity ?? 1) > 0,
        sku: p.variants?.[0]?.sku || undefined,
        image: p.image?.src || undefined
      }));
    } catch (error) {
      console.error('ShopifyAdapter search error:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    const { storeUrl, accessToken, apiVersion = '2025-01' } = this.config;
    const domain = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `https://${domain}/admin/api/${apiVersion}/shop.json`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': accessToken
        },
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
