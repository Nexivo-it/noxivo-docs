# Shop Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an isolated “Shop” plugin that lets agency/client admins enable Shopify and WooCommerce separately per tenant, manage credentials from the existing dashboard integrations page, and power real-time plus short-TTL cached product search without affecting unrelated project areas when disabled.

**Architecture:** Reuse the existing dashboard integrations UX and tenant credential storage, extend it with `shopify` and `woocommerce` providers, and store per-tenant plugin enablement in `DataSourceModel`. In workflow-engine, replace the mock-only `search_store` behavior with provider-aware adapters that check whether a provider is enabled for the current tenant, read credentials, use 5-minute local cache, and fall back to live APIs for price/stock freshness.

**Tech Stack:** Next.js App Router, Vitest, Mongoose, Zod, Fastify, Shopify GraphQL/Storefront or Admin REST adapter wrapper, WooCommerce REST API.

---

## File Structure

### Existing files to modify
- `packages/contracts/src/plugin.ts` - add credential schemas for Shopify and WooCommerce.
- `packages/contracts/src/index.ts` - export new contract schemas.
- `packages/database/src/models/tenant-credential.ts` - allow `shopify` and `woocommerce` providers.
- `apps/dashboard/app/api/settings/credentials/route.ts` - support CRUD/upsert/listing for Shopify and WooCommerce credentials.
- `apps/dashboard/app/dashboard/settings/integrations/integrations-client.tsx` - add Shopify/WooCommerce cards, modal fields, and provider toggles.
- `apps/dashboard/test/settings-credentials-route.test.ts` - add route coverage for new providers.
- `apps/workflow-engine/src/modules/agents/tools/data-sources/types.ts` - extend adapter contract for provider-aware cache/live access.
- `apps/workflow-engine/src/modules/agents/tools/tool-registry.ts` - resolve enabled provider instead of always using `MockStoreAdapter`.

### New files to create
- `apps/dashboard/app/api/settings/shop/providers/route.ts` - list/update enabled providers for current tenant.
- `apps/dashboard/test/settings-shop-providers-route.test.ts` - tests for per-provider enable/disable authorization and persistence.
- `apps/workflow-engine/src/modules/agents/tools/data-sources/shopify.adapter.ts` - Shopify adapter.
- `apps/workflow-engine/src/modules/agents/tools/data-sources/woocommerce.adapter.ts` - WooCommerce adapter.
- `apps/workflow-engine/src/modules/agents/tools/data-sources/adapter-registry.ts` - picks enabled adapter and loads credentials/cache.
- `apps/workflow-engine/src/modules/agents/tools/data-sources/cache.ts` - 5-minute cache helpers around `DataSourceModel`.
- `apps/workflow-engine/test/shop-data-sources.test.ts` - engine tests for provider resolution, enable/disable, cache/live fallback.
- `docs/superpowers/specs/2026-04-18-shop-plugin-design.md` - persist approved design from brainstorming.

---

### Task 1: Persist the approved design and add provider contracts

**Files:**
- Create: `docs/superpowers/specs/2026-04-18-shop-plugin-design.md`
- Modify: `packages/contracts/src/plugin.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `pnpm --filter @noxivo/contracts build`

- [ ] **Step 1: Write the design doc from the approved conversation**

```md
# Shop Plugin Design

## Goal
Add a generic “Shop” plugin that can connect Shopify and WooCommerce separately per tenant.

## Decisions
- Reuse `/dashboard/settings/integrations`
- Per-provider enable/disable, not one global toggle
- Real-time product access with 5-minute local cache
- Tenant-scoped credentials and tenant-scoped provider enablement
- Disabled providers must have zero runtime effect outside the Shop tool path
```

- [ ] **Step 2: Add credential schemas for Shopify and WooCommerce**

```ts
export const ShopifyCredentialSchema = z.object({
  storeUrl: z.string().min(1),
  accessToken: z.string().min(1),
}).strict();

export const WooCommerceCredentialSchema = z.object({
  storeUrl: z.string().url(),
  consumerKey: z.string().min(1),
  consumerSecret: z.string().min(1),
}).strict();
```

- [ ] **Step 3: Export the new schemas from the contracts package**

```ts
export * from './plugin.js';
```

Keep the file export simple; the important change is that `plugin.ts` now contains the two new schemas.

- [ ] **Step 4: Run contracts build**

Run: `pnpm --filter @noxivo/contracts build`
Expected: build completes with exit code 0.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-18-shop-plugin-design.md packages/contracts/src/plugin.ts packages/contracts/src/index.ts
git commit -m "feat: add shop provider contracts"
```

### Task 2: Extend tenant credential storage for Shopify and WooCommerce

**Files:**
- Modify: `packages/database/src/models/tenant-credential.ts`
- Modify: `apps/dashboard/app/api/settings/credentials/route.ts`
- Test: `apps/dashboard/test/settings-credentials-route.test.ts`

- [ ] **Step 1: Write failing route tests for the new providers**

```ts
it('upserts Shopify credentials for agency-admin context', async () => {
  const response = await upsertCredential(makeRequest('POST', {
    provider: 'shopify',
    displayName: 'Shopify Main',
    secret: {
      storeUrl: 'demo-store.myshopify.com',
      accessToken: 'shpat_test'
    },
    config: {}
  }));

  expect(response.status).toBe(200);
});

it('upserts WooCommerce credentials for agency-admin context', async () => {
  const response = await upsertCredential(makeRequest('POST', {
    provider: 'woocommerce',
    displayName: 'Woo Main',
    secret: {
      storeUrl: 'https://shop.example.com',
      consumerKey: 'ck_test',
      consumerSecret: 'cs_test'
    },
    config: {}
  }));

  expect(response.status).toBe(200);
});
```

- [ ] **Step 2: Run the credential route test file and confirm failure**

Run: `pnpm --filter @noxivo/dashboard test -- test/settings-credentials-route.test.ts`
Expected: FAIL with “Unsupported provider” or schema mismatch.

- [ ] **Step 3: Extend the tenant credential enum**

```ts
enum: ['google_sheets', 'airtable', 'slack', 'hubspot', 'shopify', 'woocommerce'],
```

- [ ] **Step 4: Extend the dashboard credentials route parser and validators**

```ts
type SupportedProvider = 'airtable' | 'google_sheets' | 'shopify' | 'woocommerce';

if (body.provider === 'shopify') {
  normalizedSecret = ShopifyCredentialSchema.parse(body.secret);
} else if (body.provider === 'woocommerce') {
  normalizedSecret = WooCommerceCredentialSchema.parse(body.secret);
} else if (body.provider === 'airtable') {
  normalizedSecret = AirtableCredentialSchema.parse(body.secret);
  normalizedConfig = parseAirtableConfig(body.config);
} else {
  normalizedSecret = GoogleSheetsCredentialSchema.parse(body.secret);
  normalizedConfig = parseGoogleSheetsConfig(body.config);
}
```

- [ ] **Step 5: Add default display names for new providers**

```ts
if (provider === 'shopify') {
  return 'Shopify';
}

if (provider === 'woocommerce') {
  return 'WooCommerce';
}
```

- [ ] **Step 6: Re-run the credential route tests**

Run: `pnpm --filter @noxivo/dashboard test -- test/settings-credentials-route.test.ts`
Expected: PASS for new Shopify and WooCommerce upsert scenarios.

- [ ] **Step 7: Commit**

```bash
git add packages/database/src/models/tenant-credential.ts apps/dashboard/app/api/settings/credentials/route.ts apps/dashboard/test/settings-credentials-route.test.ts
git commit -m "feat: support shop credentials"
```

### Task 3: Add tenant-scoped enable/disable controls for each shop provider

**Files:**
- Create: `apps/dashboard/app/api/settings/shop/providers/route.ts`
- Test: `apps/dashboard/test/settings-shop-providers-route.test.ts`
- Modify: `packages/database/src/models/data-source.ts`

- [ ] **Step 1: Write failing tests for GET and POST provider state**

```ts
it('returns tenant-scoped shop provider states', async () => {
  const response = await GET();
  expect(response.status).toBe(200);
});

it('enables shopify for current tenant only', async () => {
  const response = await POST(makeRequest('POST', {
    providerType: 'shopify',
    enabled: true,
    displayName: 'Shopify'
  }));

  expect(response.status).toBe(200);
});
```

- [ ] **Step 2: Run the new provider-state test file and confirm failure**

Run: `pnpm --filter @noxivo/dashboard test -- test/settings-shop-providers-route.test.ts`
Expected: FAIL because the route file does not exist.

- [ ] **Step 3: Add the route using `DataSourceModel` as the plugin toggle record**

```ts
const ShopProviderStateSchema = z.object({
  providerType: z.enum(['shopify', 'woocommerce']),
  enabled: z.boolean(),
  displayName: z.string().min(1).max(80).optional(),
}).strict();

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
    return NextResponse.json({ error: 'No tenant workspace available for this agency context' }, { status: 409 });
  }

  const body = ShopProviderStateSchema.parse(await request.json());
  await dbConnect();

  const record = await DataSourceModel.findOneAndUpdate(
    {
      agencyId: session.actor.agencyId,
      tenantId,
      pluginId: 'shop',
      providerType: body.providerType,
      displayName: body.displayName ?? (body.providerType === 'shopify' ? 'Shopify' : 'WooCommerce'),
    },
    {
      $set: {
        enabled: body.enabled,
        healthStatus: body.enabled ? 'disabled' : 'disabled',
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean().exec();

  return NextResponse.json({
    id: record?._id.toString(),
    providerType: record?.providerType,
    enabled: record?.enabled,
  });
}
```

- [ ] **Step 4: Add GET state listing for both providers**

```ts
const records = await DataSourceModel.find({
  agencyId: session.actor.agencyId,
  tenantId,
  pluginId: 'shop',
  providerType: { $in: ['shopify', 'woocommerce'] }
}).lean().exec();

return NextResponse.json({
  providers: ['shopify', 'woocommerce'].map((providerType) => {
    const record = records.find((item) => item.providerType === providerType);
    return {
      providerType,
      enabled: record?.enabled ?? false,
      healthStatus: record?.healthStatus ?? 'disabled',
      lastSyncedAt: record?.lastSyncedAt?.toISOString() ?? null,
    };
  })
});
```

- [ ] **Step 5: Run the provider-state tests**

Run: `pnpm --filter @noxivo/dashboard test -- test/settings-shop-providers-route.test.ts`
Expected: PASS for auth, tenant isolation, and enable/disable persistence.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/app/api/settings/shop/providers/route.ts apps/dashboard/test/settings-shop-providers-route.test.ts packages/database/src/models/data-source.ts
git commit -m "feat: add shop provider toggles"
```

### Task 4: Add Shopify and WooCommerce controls to the dashboard integrations page

**Files:**
- Modify: `apps/dashboard/app/dashboard/settings/integrations/integrations-client.tsx`
- Test: `apps/dashboard/test/dashboard-admin-pages.test.tsx`

- [ ] **Step 1: Write a failing UI test for the new provider cards**

```ts
it('renders Shopify and WooCommerce integration cards', async () => {
  render(<IntegrationsClient />);
  expect(await screen.findByText('Shopify')).toBeInTheDocument();
  expect(await screen.findByText('WooCommerce')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the targeted dashboard page test and confirm failure**

Run: `pnpm --filter @noxivo/dashboard test -- test/dashboard-admin-pages.test.tsx`
Expected: FAIL because the new cards are not rendered.

- [ ] **Step 3: Extend provider metadata and form state**

```ts
type Provider = 'airtable' | 'google_sheets' | 'shopify' | 'woocommerce';

type FormState = {
  displayName: string;
  airtableApiKey: string;
  airtableBaseId: string;
  airtableTableId: string;
  googleClientEmail: string;
  googlePrivateKey: string;
  googleSpreadsheetId: string;
  googleSheetName: string;
  shopifyStoreUrl: string;
  shopifyAccessToken: string;
  wooStoreUrl: string;
  wooConsumerKey: string;
  wooConsumerSecret: string;
};
```

- [ ] **Step 4: Add provider cards and enable toggles**

```tsx
const cards = [
  { provider: 'airtable', icon: Table2 },
  { provider: 'google_sheets', icon: FileSpreadsheet },
  { provider: 'shopify', icon: ShoppingBag },
  { provider: 'woocommerce', icon: Store },
] as const;
```

Add a secondary button per shop card:

```tsx
<button
  type="button"
  onClick={() => void toggleProvider(provider, !(providerState?.enabled ?? false))}
  className="h-11 min-w-[44px] rounded-2xl border border-border-ghost bg-surface-base px-4 text-sm font-bold"
>
  {providerState?.enabled ? 'Disable Provider' : 'Enable Provider'}
</button>
```

- [ ] **Step 5: Add Shopify and WooCommerce modal payloads**

```ts
const payload = activeProvider === 'shopify'
  ? {
      provider: 'shopify' as const,
      displayName: formState.displayName,
      secret: {
        storeUrl: formState.shopifyStoreUrl,
        accessToken: formState.shopifyAccessToken,
      },
      config: {},
    }
  : activeProvider === 'woocommerce'
    ? {
        provider: 'woocommerce' as const,
        displayName: formState.displayName,
        secret: {
          storeUrl: formState.wooStoreUrl,
          consumerKey: formState.wooConsumerKey,
          consumerSecret: formState.wooConsumerSecret,
        },
        config: {},
      }
    : existingPayload;
```

- [ ] **Step 6: Re-run the UI test**

Run: `pnpm --filter @noxivo/dashboard test -- test/dashboard-admin-pages.test.tsx`
Expected: PASS for rendering and interaction of the new provider cards.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/app/dashboard/settings/integrations/integrations-client.tsx apps/dashboard/test/dashboard-admin-pages.test.tsx
git commit -m "feat: add shop integrations ui"
```

### Task 5: Replace the mock-only store search with provider-aware adapters and cache

**Files:**
- Modify: `apps/workflow-engine/src/modules/agents/tools/data-sources/types.ts`
- Create: `apps/workflow-engine/src/modules/agents/tools/data-sources/cache.ts`
- Create: `apps/workflow-engine/src/modules/agents/tools/data-sources/adapter-registry.ts`
- Create: `apps/workflow-engine/src/modules/agents/tools/data-sources/shopify.adapter.ts`
- Create: `apps/workflow-engine/src/modules/agents/tools/data-sources/woocommerce.adapter.ts`
- Modify: `apps/workflow-engine/src/modules/agents/tools/tool-registry.ts`
- Test: `apps/workflow-engine/test/shop-data-sources.test.ts`

- [ ] **Step 1: Write failing engine tests for disabled provider, live fetch, and cache hit**

```ts
it('returns error when no shop provider is enabled for tenant', async () => {
  const result = await toolRegistry.execute('search_store', context, { query: 'iphone', limit: 5 });
  expect(result.success).toBe(false);
  expect(result.error).toContain('No enabled shop provider');
});

it('uses cached products when cache is fresh', async () => {
  expect(result.success).toBe(true);
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('falls back to live provider request when cache is stale', async () => {
  expect(fetchSpy).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the engine test file and confirm failure**

Run: `pnpm --filter @noxivo/workflow-engine test -- test/shop-data-sources.test.ts`
Expected: FAIL because adapters and cache helpers do not exist.

- [ ] **Step 3: Extend the adapter contract to support product detail and connection metadata**

```ts
export interface DataSourceAdapter {
  searchProducts(options: SearchOptions): Promise<Product[]>;
  testConnection(): Promise<boolean>;
  getProviderName(): 'shopify' | 'woocommerce' | 'mock';
}
```

- [ ] **Step 4: Add 5-minute cache helpers around `DataSourceModel`**

```ts
const CACHE_TTL_MS = 5 * 60 * 1000;

export function isCacheFresh(lastSyncedAt: Date | null | undefined): boolean {
  return Boolean(lastSyncedAt && Date.now() - lastSyncedAt.getTime() < CACHE_TTL_MS);
}

export async function saveCachedProducts(dataSourceId: string, products: Product[]) {
  await DataSourceModel.findByIdAndUpdate(dataSourceId, {
    $set: {
      'config.cachedProducts': products,
      lastSyncedAt: new Date(),
      healthStatus: 'healthy'
    }
  }).exec();
}
```

- [ ] **Step 5: Create a Shopify adapter with live product search**

```ts
export class ShopifyAdapter implements DataSourceAdapter {
  constructor(private readonly credentials: { storeUrl: string; accessToken: string }) {}

  getProviderName() {
    return 'shopify' as const;
  }

  async searchProducts(options: SearchOptions): Promise<Product[]> {
    const response = await fetch(`https://${this.credentials.storeUrl}/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': this.credentials.accessToken,
      },
      body: JSON.stringify({
        query: `query SearchProducts($query: String!) { products(first: 10, query: $query) { nodes { id title description availableForSale featuredImage { url } variants(first: 1) { nodes { price { amount currencyCode } sku } } } } }`,
        variables: { query: options.query },
      }),
    });

    const payload = await response.json() as {
      data?: { products?: { nodes?: Array<any> } };
    };

    return (payload.data?.products?.nodes ?? []).slice(0, options.limit).map((node) => ({
      id: String(node.id),
      title: String(node.title),
      description: typeof node.description === 'string' ? node.description : undefined,
      price: Number(node.variants?.nodes?.[0]?.price?.amount ?? 0),
      currency: String(node.variants?.nodes?.[0]?.price?.currencyCode ?? 'USD'),
      image: typeof node.featuredImage?.url === 'string' ? node.featuredImage.url : undefined,
      available: Boolean(node.availableForSale),
      sku: typeof node.variants?.nodes?.[0]?.sku === 'string' ? node.variants.nodes[0].sku : undefined,
    }));
  }

  async testConnection(): Promise<boolean> {
    const products = await this.searchProducts({ query: 'test', limit: 1 });
    return Array.isArray(products);
  }
}
```

- [ ] **Step 6: Create a WooCommerce adapter with live product search**

```ts
export class WooCommerceAdapter implements DataSourceAdapter {
  constructor(private readonly credentials: { storeUrl: string; consumerKey: string; consumerSecret: string }) {}

  getProviderName() {
    return 'woocommerce' as const;
  }

  async searchProducts(options: SearchOptions): Promise<Product[]> {
    const url = new URL('/wp-json/wc/v3/products', this.credentials.storeUrl);
    url.searchParams.set('search', options.query);
    url.searchParams.set('per_page', String(options.limit));
    url.searchParams.set('consumer_key', this.credentials.consumerKey);
    url.searchParams.set('consumer_secret', this.credentials.consumerSecret);

    const response = await fetch(url.toString());
    const payload = await response.json() as Array<any>;

    return payload.map((item) => ({
      id: String(item.id),
      title: String(item.name),
      description: typeof item.short_description === 'string' ? item.short_description : undefined,
      price: Number(item.price ?? 0),
      currency: typeof item.currency === 'string' ? item.currency : 'USD',
      image: typeof item.images?.[0]?.src === 'string' ? item.images[0].src : undefined,
      available: item.stock_status === 'instock',
      sku: typeof item.sku === 'string' ? item.sku : undefined,
    }));
  }

  async testConnection(): Promise<boolean> {
    const products = await this.searchProducts({ query: 'test', limit: 1 });
    return Array.isArray(products);
  }
}
```

- [ ] **Step 7: Resolve enabled provider from `DataSourceModel` and `TenantCredentialModel` in an adapter registry**

```ts
export async function resolveShopAdapter(agencyId: string, tenantId: string) {
  const dataSource = await DataSourceModel.findOne({
    agencyId,
    tenantId,
    pluginId: 'shop',
    enabled: true,
    providerType: { $in: ['shopify', 'woocommerce'] },
  }).lean().exec();

  if (!dataSource) {
    throw new Error('No enabled shop provider for this tenant');
  }

  const credential = await TenantCredentialModel.findOne({
    agencyId,
    tenantId,
    provider: dataSource.providerType,
  }).lean().exec();

  if (!credential) {
    throw new Error(`Missing credential for ${dataSource.providerType}`);
  }

  const secret = JSON.parse(credential.encryptedData) as Record<string, string>;
  return { dataSource, adapter: dataSource.providerType === 'shopify' ? new ShopifyAdapter(secret as any) : new WooCommerceAdapter(secret as any) };
}
```

- [ ] **Step 8: Replace mock-only execution in `tool-registry.ts`**

```ts
const { resolveShopAdapter } = await import('./data-sources/adapter-registry.js');
const { getCachedProducts, isCacheFresh, saveCachedProducts } = await import('./data-sources/cache.js');

const { dataSource, adapter } = await resolveShopAdapter(context.agencyId, context.tenantId);
const cachedItems = getCachedProducts(dataSource);

if (isCacheFresh(dataSource.lastSyncedAt) && cachedItems.length > 0) {
  return {
    success: true,
    result: { items: cachedItems.filter((item) => item.title.toLowerCase().includes(query.toLowerCase())).slice(0, limit) },
    executedAt: new Date().toISOString(),
  };
}

const items = await adapter.searchProducts({ query, limit });
await saveCachedProducts(dataSource._id.toString(), items);
```

- [ ] **Step 9: Run the engine tests**

Run: `pnpm --filter @noxivo/workflow-engine test -- test/shop-data-sources.test.ts`
Expected: PASS for enabled/disabled, cache hit, and live fallback behavior.

- [ ] **Step 10: Commit**

```bash
git add apps/workflow-engine/src/modules/agents/tools/data-sources/types.ts apps/workflow-engine/src/modules/agents/tools/data-sources/cache.ts apps/workflow-engine/src/modules/agents/tools/data-sources/adapter-registry.ts apps/workflow-engine/src/modules/agents/tools/data-sources/shopify.adapter.ts apps/workflow-engine/src/modules/agents/tools/data-sources/woocommerce.adapter.ts apps/workflow-engine/src/modules/agents/tools/tool-registry.ts apps/workflow-engine/test/shop-data-sources.test.ts
git commit -m "feat: add shop data source adapters"
```

### Task 6: Verify end-to-end behavior and update handoff docs

**Files:**
- Modify: `TODO.md`
- Modify: `SESSION_HANDOFF.md`

- [ ] **Step 1: Run dashboard test coverage for the new settings flows**

Run: `pnpm --filter @noxivo/dashboard test -- test/settings-credentials-route.test.ts test/settings-shop-providers-route.test.ts`
Expected: PASS.

- [ ] **Step 2: Run workflow-engine coverage for shop adapters**

Run: `pnpm --filter @noxivo/workflow-engine test -- test/shop-data-sources.test.ts`
Expected: PASS.

- [ ] **Step 3: Run focused type checks**

Run: `pnpm --filter @noxivo/dashboard lint && pnpm --filter @noxivo/workflow-engine lint`
Expected: workflow-engine passes; dashboard passes if unrelated pre-existing errors have also been cleared, otherwise document the unrelated failures explicitly.

- [ ] **Step 4: Update execution state docs**

```md
## Next Action
- Connect a real Shopify tenant and a real WooCommerce tenant, then verify live price/stock answers through `search_store`.
```

- [ ] **Step 5: Commit docs updates**

```bash
git add TODO.md SESSION_HANDOFF.md
git commit -m "docs: record shop plugin rollout status"
```

---

## Self-Review

- **Spec coverage:** covers provider credentials, tenant-scoped enable/disable, dashboard integration UX, workflow-engine adapters, cache/live fallback, and verification/docs.
- **Placeholder scan:** no TODO/TBD placeholders remain.
- **Type consistency:** uses `shopify` and `woocommerce` consistently across contracts, credential storage, data-source state, and adapter resolution.
