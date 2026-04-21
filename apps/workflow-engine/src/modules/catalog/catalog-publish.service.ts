import { getCatalogItems, type CatalogItemDto } from './catalog.service.js';

type WebhookDestination = {
  type: 'webhook';
  url: string;
};

type WordpressDestination = {
  type: 'wordpress';
  siteUrl: string;
  username: string;
  appPassword: string;
};

type ShopifyDestination = {
  type: 'shopify';
  storeUrl: string;
  accessToken: string;
  apiVersion?: string;
};

type PublishDestination = WebhookDestination | WordpressDestination | ShopifyDestination;

type PublishResult = {
  itemId: string;
  success: boolean;
  status?: number;
  error?: string | null;
  externalId?: string | number;
};

function isPublishDestination(input: unknown): input is PublishDestination {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false;
  }

  const destination = input as Record<string, unknown>;
  const type = destination.type;

  if (type === 'webhook') {
    return typeof destination.url === 'string' && destination.url.length > 0;
  }
  if (type === 'wordpress') {
    return typeof destination.siteUrl === 'string'
      && typeof destination.username === 'string'
      && typeof destination.appPassword === 'string';
  }
  if (type === 'shopify') {
    return typeof destination.storeUrl === 'string' && typeof destination.accessToken === 'string';
  }

  return false;
}

function parseExternalProductId(payload: unknown): string | number | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }

  const product = (payload as { product?: unknown }).product;
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    return undefined;
  }

  const id = (product as { id?: unknown }).id;
  if (typeof id === 'string' || typeof id === 'number') {
    return id;
  }

  return undefined;
}

async function publishToWebhook(items: CatalogItemDto[], destination: WebhookDestination): Promise<PublishResult[]> {
  const results: PublishResult[] = [];
  for (const item of items) {
    try {
      const response = await fetch(destination.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_service',
          data: {
            name: item.name,
            price: item.priceAmount,
            description: item.shortDescription,
            duration: item.durationMinutes,
            image: item.mediaPath,
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });

      results.push({
        itemId: item.id,
        success: response.ok,
        status: response.status,
        error: response.ok ? null : 'Webhook failed',
      });
    } catch (error) {
      results.push({
        itemId: item.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

async function publishToWordpress(items: CatalogItemDto[], destination: WordpressDestination): Promise<PublishResult[]> {
  const results: PublishResult[] = [];

  for (const item of items) {
    try {
      const response = await fetch(`${destination.siteUrl}/wp-json/wp/v2/services`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${destination.username}:${destination.appPassword}`).toString('base64')}`,
        },
        body: JSON.stringify({
          title: item.name,
          content: item.shortDescription || item.longDescription || '',
          meta: {
            service_price: item.priceAmount,
            service_duration: item.durationMinutes,
            service_image: item.mediaPath,
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });

      results.push({
        itemId: item.id,
        success: response.ok,
        status: response.status,
        error: response.ok ? null : 'WordPress API failed',
      });
    } catch (error) {
      results.push({
        itemId: item.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

async function publishToShopify(items: CatalogItemDto[], destination: ShopifyDestination): Promise<PublishResult[]> {
  const results: PublishResult[] = [];
  const apiVersion = destination.apiVersion ?? '2025-01';
  const domain = destination.storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  for (const item of items) {
    try {
      const response = await fetch(`https://${domain}/admin/api/${apiVersion}/products.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': destination.accessToken,
        },
        body: JSON.stringify({
          product: {
            title: item.name,
            body_html: item.shortDescription || item.longDescription || '',
            variants: [
              {
                price: String(item.priceAmount),
                sku: item.slug || undefined,
                inventory_management: 'shopify',
              },
            ],
            images: item.mediaPath ? [{ src: item.mediaPath }] : [],
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      const externalId = parseExternalProductId(payload);
      results.push({
        itemId: item.id,
        success: response.ok,
        status: response.status,
        ...(externalId !== undefined ? { externalId } : {}),
        error: response.ok ? null : 'Shopify API failed',
      });
    } catch (error) {
      results.push({
        itemId: item.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

export async function publishCatalogItems(input: {
  tenantId: string;
  destination: unknown;
  items?: CatalogItemDto[];
}) {
  if (!isPublishDestination(input.destination)) {
    throw new Error('Invalid destination payload');
  }

  const items = input.items ?? await getCatalogItems(input.tenantId);
  const destination = input.destination;

  const results =
    destination.type === 'webhook'
      ? await publishToWebhook(items, destination)
      : destination.type === 'wordpress'
        ? await publishToWordpress(items, destination)
        : await publishToShopify(items, destination);

  const successful = results.filter((entry) => entry.success).length;
  return {
    total: results.length,
    successful,
    failed: results.length - successful,
    results,
  };
}
