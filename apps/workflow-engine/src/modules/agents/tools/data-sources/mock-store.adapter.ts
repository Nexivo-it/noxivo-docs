import type { DataSourceAdapter, Product, SearchOptions } from './types.js';

const MOCK_PRODUCTS: Product[] = [
  { id: 'ip15-128', title: 'iPhone 15 128GB', description: 'Latest Apple smartphone', price: 999, currency: 'USD', available: true, sku: 'IP15-128-BLK' },
  { id: 'ip15-256', title: 'iPhone 15 256GB', description: 'Latest Apple smartphone', price: 1199, currency: 'USD', available: true, sku: 'IP15-256-BLK' },
  { id: 'ip15-pro', title: 'iPhone 15 Pro 256GB', description: 'Pro model with titanium', price: 1299, currency: 'USD', available: true, sku: 'IP15-PRO-256' },
  { id: 'ip15-pro-max', title: 'iPhone 15 Pro Max 512GB', description: 'Top-tier flagship', price: 1599, currency: 'USD', available: true, sku: 'IP15-PRO-MAX-512' },
  { id: 'airpods-pro', title: 'AirPods Pro 2nd Gen', description: 'Premium wireless earbuds', price: 249, currency: 'USD', available: true, sku: 'APP2-001' },
  { id: 'airpods-max', title: 'AirPods Max', description: 'Over-ear wireless headphones', price: 549, currency: 'USD', available: true, sku: 'APM-001' },
  { id: 'macbook-air-m3', title: 'MacBook Air M3', description: '15-inch laptop', price: 1299, currency: 'USD', available: true, sku: 'MBA-M3-15' },
  { id: 'macbook-pro-14', title: 'MacBook Pro 14" M3 Pro', description: 'Professional laptop', price: 1999, currency: 'USD', available: true, sku: 'MBP-14-M3P' },
  { id: 'ipad-pro-12', title: 'iPad Pro 12.9"', description: 'Professional tablet', price: 1099, currency: 'USD', available: false, sku: 'IPP-129' },
  { id: 'ipad-air', title: 'iPad Air 11"', description: 'Lightweight tablet', price: 599, currency: 'USD', available: true, sku: 'IPA-11' },
  { id: 'apple-watch-s9', title: 'Apple Watch Series 9', description: 'Smartwatch', price: 399, currency: 'USD', available: true, sku: 'AWS-S9-45' },
  { id: 'apple-watch-ultra', title: 'Apple Watch Ultra 2', description: 'Adventure smartwatch', price: 799, currency: 'USD', available: true, sku: 'AWU2-001' }
];

export class MockStoreAdapter implements DataSourceAdapter {
  async searchProducts(options: SearchOptions): Promise<Product[]> {
    const q = options.query.toLowerCase();
    const results = MOCK_PRODUCTS.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q)
    );
    return results.slice(0, options.limit);
  }

  async testConnection(): Promise<boolean> {
    return true;
  }
}