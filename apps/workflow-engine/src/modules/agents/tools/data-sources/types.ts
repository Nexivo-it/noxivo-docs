import { z } from 'zod';

export const ProductSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  price: z.number(),
  currency: z.string().default('USD'),
  image: z.string().optional(),
  available: z.boolean().default(true),
  sku: z.string().optional()
});

export type Product = z.infer<typeof ProductSchema>;

export const SearchOptionsSchema = z.object({
  query: z.string(),
  limit: z.number().int().min(1).max(20).default(5)
});

export type SearchOptions = z.infer<typeof SearchOptionsSchema>;

export interface DataSourceAdapter {
  searchProducts(options: SearchOptions): Promise<Product[]>;
  testConnection(): Promise<boolean>;
}