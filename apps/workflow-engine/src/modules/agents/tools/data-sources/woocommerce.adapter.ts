import type { DataSourceAdapter, Product, SearchOptions } from './types.js';

export class WooCommerceAdapter implements DataSourceAdapter {
  constructor(
    private config: {
      storeUrl: string;
      consumerKey: string;
      consumerSecret: string;
      apiBasePath?: string;
    }
  ) {}

  async searchProducts(options: SearchOptions): Promise<Product[]> {
    const { query, limit = 5 } = options;
    const { storeUrl, consumerKey, consumerSecret, apiBasePath = '/wp-json/wc/v3' } = this.config;

    const baseUrl = storeUrl.replace(/\/$/, '');
    const url = `${baseUrl}${apiBasePath}/products?search=${encodeURIComponent(query)}&per_page=${limit}`;

    // Basic Auth
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`WooCommerce API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as any[];

      return data.map(p => ({
        id: String(p.id),
        title: p.name,
        description: p.description?.replace(/<[^>]*>?/gm, '') || '', // Strip HTML
        price: parseFloat(p.price || '0'),
        currency: 'USD', // Defaulting to USD for now, could be dynamic
        available: p.stock_status === 'instock',
        sku: p.sku || undefined,
        image: p.images?.[0]?.src || undefined
      }));
    } catch (error) {
      console.error('WooCommerceAdapter search error:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    const { storeUrl, consumerKey, consumerSecret, apiBasePath = '/wp-json/wc/v3' } = this.config;
    const baseUrl = storeUrl.replace(/\/$/, '');
    const url = `${baseUrl}${apiBasePath}/system_status`;

    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`
        },
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
