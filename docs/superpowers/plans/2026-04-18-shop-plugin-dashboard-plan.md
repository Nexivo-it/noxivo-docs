# Shop Plugin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dashboard-managed Shop plugin that lets agency/client admins configure Shopify and WooCommerce credentials, activate or deactivate each provider independently for the active agency/tenant, and gate availability by subscription plan without breaking unrelated dashboard areas.

**Architecture:** Keep the feature isolated to the dashboard settings surface. Reuse existing persistence primitives instead of inventing a new plugin system: `TenantCredentialModel` stores secrets, `PluginInstallationModel` stores per-tenant enablement, and `DataSourceModel` stores non-secret provider metadata for future Sharebot/runtime use. The dashboard owns the UX and API routes; no workflow-engine behavior changes are part of this plan.

**Tech Stack:** Next.js App Router, React, Tailwind, Vitest, Mongoose, Zod, pnpm workspace packages (`@noxivo/contracts`, `@noxivo/database`).

---

## File Structure

### Create
- `apps/dashboard/app/api/settings/shop/route.ts` — dashboard-only route to read provider status and toggle Shopify/WooCommerce per tenant.
- `apps/dashboard/lib/settings/shop-permissions.ts` — centralized subscription-plan entitlement matrix and helper functions.
- `apps/dashboard/test/settings-shop-route.test.ts` — route tests for entitlement checks, activation/deactivation, and tenant scoping.

### Modify
- `packages/contracts/src/plugin.ts` — add strict credential schemas for Shopify and WooCommerce.
- `packages/database/src/models/tenant-credential.ts` — extend provider enum to include `shopify` and `woocommerce`.
- `apps/dashboard/app/api/settings/credentials/route.ts` — accept, validate, persist, and return Shopify/WooCommerce credentials; mirror non-secret config into `DataSourceModel`.
- `apps/dashboard/app/dashboard/settings/integrations/integrations-client.tsx` — show Shopify/WooCommerce cards, provider-specific modal fields, entitlement states, and per-provider enable/disable controls.
- `apps/dashboard/test/settings-credentials-route.test.ts` — cover Shopify/WooCommerce persistence and `DataSourceModel` side effects.
- `TODO.md` — update finished work / next step after implementation.
- `SESSION_HANDOFF.md` — record final files, verification, and follow-up runtime work.

### Leave Alone
- `apps/workflow-engine/**` — no runtime search or adapter work in this plan.
- Existing Airtable / Google Sheets behavior — verify it still works after adding new providers.

---

## Implementation Notes To Keep Constant

- Use the existing settings page at `apps/dashboard/app/dashboard/settings/integrations/page.tsx`; do not create a new top-level dashboard page.
- The UI should present **Shopify** and **WooCommerce** as independent cards under the existing integrations layout.
- Provider activation must be **per provider**, not a global plugin switch.
- Subscription gating must be centralized in one helper so product can change the plan matrix later without touching UI code.
- This plan assumes the initial entitlement matrix below; if product changes it later, only `shop-permissions.ts` should need editing:

```ts
export const SHOP_PLAN_PERMISSIONS = {
  reseller_basic: { shopify: false, woocommerce: false },
  reseller_pro: { shopify: true, woocommerce: true },
  enterprise: { shopify: true, woocommerce: true },
} as const;
```

- Store cache policy metadata now even though the cache consumer ships later. Use `DataSourceModel.config.cacheTtlSeconds = 300` and `DataSourceModel.config.syncMode = 'hybrid'` so the later Sharebot/runtime work has stable records to consume.

---

### Task 1: Extend shared schemas and model enums for Shop providers

**Files:**
- Modify: `packages/contracts/src/plugin.ts`
- Modify: `packages/database/src/models/tenant-credential.ts`
- Test: `apps/dashboard/test/settings-credentials-route.test.ts`

- [ ] **Step 1: Write the failing credential-route test for Shopify support**

Add this test near the other credential route cases in `apps/dashboard/test/settings-credentials-route.test.ts`:

```ts
it('upserts Shopify credentials for the active tenant context', async () => {
  const agencyId = new mongoose.Types.ObjectId().toString();
  const tenantId = new mongoose.Types.ObjectId().toString();

  mockGetCurrentSession.mockResolvedValue({
    id: 'session-id',
    actor: {
      userId: new mongoose.Types.ObjectId().toString(),
      agencyId,
      tenantId,
      tenantIds: [tenantId],
      email: 'admin@example.com',
      fullName: 'Admin User',
      role: 'agency_admin',
      scopeRole: 'agency_admin',
      status: 'active'
    },
    expiresAt: new Date(Date.now() + 60_000)
  });

  const response = await upsertCredential(makeRequest('POST', {
    provider: 'shopify',
    displayName: 'Main Shopify Store',
    secret: {
      accessToken: 'shpat_test_token'
    },
    config: {
      storeUrl: 'acme-shop.myshopify.com',
      apiVersion: '2025-01'
    }
  }));

  expect(response.status).toBe(200);
});
```

- [ ] **Step 2: Run the focused test and verify it fails with unsupported provider**

Run:

```bash
pnpm --filter @noxivo/dashboard test -- test/settings-credentials-route.test.ts
```

Expected: FAIL with `Unsupported provider` / `Invalid credential payload`.

- [ ] **Step 3: Add strict provider schemas in `packages/contracts/src/plugin.ts`**

Insert these exports below the existing credential schemas:

```ts
export const ShopifyCredentialSchema = z.object({
  accessToken: z.string().min(1),
}).strict();

export const WooCommerceCredentialSchema = z.object({
  consumerKey: z.string().min(1),
  consumerSecret: z.string().min(1),
}).strict();
```

- [ ] **Step 4: Extend `TenantCredentialModel` provider enum**

Update `packages/database/src/models/tenant-credential.ts`:

```ts
  provider: {
    type: String,
    required: true,
    enum: ['google_sheets', 'airtable', 'slack', 'hubspot', 'shopify', 'woocommerce'],
    index: true
  },
```

- [ ] **Step 5: Re-run the focused test to verify it now fails deeper in route parsing**

Run:

```bash
pnpm --filter @noxivo/dashboard test -- test/settings-credentials-route.test.ts
```

Expected: FAIL because the route still only accepts Airtable / Google Sheets.

- [ ] **Step 6: Commit the shared-schema groundwork**

```bash
git add packages/contracts/src/plugin.ts packages/database/src/models/tenant-credential.ts apps/dashboard/test/settings-credentials-route.test.ts
git commit -m "feat: add shop credential schemas"
```

### Task 2: Add subscription-plan permission helpers for Shop providers

**Files:**
- Create: `apps/dashboard/lib/settings/shop-permissions.ts`
- Test: `apps/dashboard/test/settings-shop-route.test.ts`

- [ ] **Step 1: Write the failing permissions test**

Create `apps/dashboard/test/settings-shop-route.test.ts` with this first spec:

```ts
import { describe, expect, it } from 'vitest';
import { getShopPermissionsForPlan } from '../lib/settings/shop-permissions.js';

describe('shop permissions', () => {
  it('disables both providers for reseller_basic', () => {
    expect(getShopPermissionsForPlan('reseller_basic')).toEqual({
      shopify: false,
      woocommerce: false,
    });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails because the helper does not exist**

Run:

```bash
pnpm --filter @noxivo/dashboard test -- test/settings-shop-route.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Create `shop-permissions.ts`**

Write this file:

```ts
export type SupportedShopProvider = 'shopify' | 'woocommerce';
export type SupportedAgencyPlan = 'reseller_basic' | 'reseller_pro' | 'enterprise';

const SHOP_PLAN_PERMISSIONS: Record<SupportedAgencyPlan, Record<SupportedShopProvider, boolean>> = {
  reseller_basic: { shopify: false, woocommerce: false },
  reseller_pro: { shopify: true, woocommerce: true },
  enterprise: { shopify: true, woocommerce: true },
};

export function getShopPermissionsForPlan(plan: string): Record<SupportedShopProvider, boolean> {
  if (plan === 'reseller_pro' || plan === 'enterprise' || plan === 'reseller_basic') {
    return SHOP_PLAN_PERMISSIONS[plan];
  }

  return SHOP_PLAN_PERMISSIONS.reseller_basic;
}

export function canUseShopProvider(plan: string, provider: SupportedShopProvider): boolean {
  return getShopPermissionsForPlan(plan)[provider];
}
```

- [ ] **Step 4: Re-run the permissions test and verify it passes**

Run:

```bash
pnpm --filter @noxivo/dashboard test -- test/settings-shop-route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the permissions helper**

```bash
git add apps/dashboard/lib/settings/shop-permissions.ts apps/dashboard/test/settings-shop-route.test.ts
git commit -m "feat: add shop plan permissions helper"
```

### Task 3: Extend the dashboard credentials route for Shopify and WooCommerce

**Files:**
- Modify: `apps/dashboard/app/api/settings/credentials/route.ts`
- Modify: `apps/dashboard/test/settings-credentials-route.test.ts`
- Modify: `packages/contracts/src/plugin.ts` (reuse schemas from Task 1)
- Optional read context: `packages/database/src/models/data-source.ts`

- [ ] **Step 1: Add failing WooCommerce and GET-shape tests**

Append these cases to `apps/dashboard/test/settings-credentials-route.test.ts`:

```ts
it('upserts WooCommerce credentials and persists non-secret config', async () => {
  const agencyId = new mongoose.Types.ObjectId().toString();
  const tenantId = new mongoose.Types.ObjectId().toString();

  mockGetCurrentSession.mockResolvedValue({
    id: 'session-id',
    actor: {
      userId: new mongoose.Types.ObjectId().toString(),
      agencyId,
      tenantId,
      tenantIds: [tenantId],
      email: 'admin@example.com',
      fullName: 'Admin User',
      role: 'agency_admin',
      scopeRole: 'agency_admin',
      status: 'active'
    },
    expiresAt: new Date(Date.now() + 60_000)
  });

  const response = await upsertCredential(makeRequest('POST', {
    provider: 'woocommerce',
    displayName: 'Main Woo Store',
    secret: {
      consumerKey: 'ck_test',
      consumerSecret: 'cs_test'
    },
    config: {
      storeUrl: 'https://acme.example.com',
      apiBasePath: '/wp-json/wc/v3'
    }
  }));

  expect(response.status).toBe(200);
});

it('returns Shopify and WooCommerce credentials in GET payload', async () => {
  // seed two TenantCredential records, call getCredentials(), assert providers are returned
});
```

- [ ] **Step 2: Run the credential-route suite and verify the new tests fail**

Run:

```bash
pnpm --filter @noxivo/dashboard test -- test/settings-credentials-route.test.ts
```

Expected: FAIL because `SupportedProvider` and parsing functions do not include shop providers.

- [ ] **Step 3: Extend provider support and config parsing in the route**

Update the top of `apps/dashboard/app/api/settings/credentials/route.ts`:

```ts
import {
  AirtableCredentialSchema,
  GoogleSheetsCredentialSchema,
  ShopifyCredentialSchema,
  WooCommerceCredentialSchema,
} from '@noxivo/contracts';
import { DataSourceModel, TenantCredentialModel } from '@noxivo/database';

type SupportedProvider = 'airtable' | 'google_sheets' | 'shopify' | 'woocommerce';
```

Add provider-specific config normalizers:

```ts
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
```

- [ ] **Step 4: Persist/update `DataSourceModel` when a shop credential is saved**

Inside the POST handler, after `TenantCredentialModel.findOneAndUpdate`, add:

```ts
if (body.provider === 'shopify' || body.provider === 'woocommerce') {
  await DataSourceModel.findOneAndUpdate(
    {
      agencyId: session.actor.agencyId,
      tenantId,
      pluginId: 'shop',
      providerType: body.provider,
      displayName: body.displayName ?? defaultDisplayName(body.provider),
    },
    {
      $set: {
        enabled: false,
        credentialRef: credential._id,
        config: normalizedConfig,
        healthStatus: 'disabled',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();
}
```

- [ ] **Step 5: Update `defaultDisplayName`, `parseUpsertPayload`, and validation guard strings**

Make these exact adjustments:

```ts
if (provider !== 'airtable' && provider !== 'google_sheets' && provider !== 'shopify' && provider !== 'woocommerce') {
  throw new Error('Unsupported provider');
}
```

```ts
function defaultDisplayName(provider: SupportedProvider): string {
  if (provider === 'airtable') return 'Airtable';
  if (provider === 'google_sheets') return 'Google Sheets';
  if (provider === 'shopify') return 'Shopify';
  return 'WooCommerce';
}
```

- [ ] **Step 6: Re-run the credential-route suite and verify it passes**

Run:

```bash
pnpm --filter @noxivo/dashboard test -- test/settings-credentials-route.test.ts
```

Expected: PASS, including old Airtable / Google Sheets cases.

- [ ] **Step 7: Commit the route expansion**

```bash
git add apps/dashboard/app/api/settings/credentials/route.ts apps/dashboard/test/settings-credentials-route.test.ts
git commit -m "feat: add shop credential persistence"
```

### Task 4: Add a dedicated dashboard route for Shop provider status and activation

**Files:**
- Create: `apps/dashboard/app/api/settings/shop/route.ts`
- Modify: `apps/dashboard/test/settings-shop-route.test.ts`
- Read context: `apps/dashboard/app/api/team-inbox/plugins/route.ts`, `packages/database/src/models/plugin-installation.ts`

- [ ] **Step 1: Add failing route tests for status, forbidden plan, activate, and deactivate**

Extend `apps/dashboard/test/settings-shop-route.test.ts` with these cases:

```ts
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgencyModel, DataSourceModel, PluginInstallationModel, TenantCredentialModel } from '@noxivo/database';
import { GET as getShopSettings, POST as updateShopSettings } from '../app/api/settings/shop/route.js';
import { connectDashboardTestDb, disconnectDashboardTestDb, resetDashboardTestDb } from './helpers/mongo-memory.js';

// mock session the same way as other route tests

it('blocks activation when the agency plan lacks provider permission', async () => {
  // seed agency with reseller_basic, then POST { provider: 'shopify', enabled: true }
  // expect 403 and no PluginInstallation row enabled
});

it('activates Shopify for the active tenant when credentials exist and plan allows it', async () => {
  // seed agency reseller_pro + credential + datasource, expect 200 and enabled state
});

it('deactivates WooCommerce without deleting credentials', async () => {
  // seed enabled installation, POST enabled:false, expect PluginInstallation false and DataSource enabled false
});
```

- [ ] **Step 2: Run the test file and verify it fails because the route does not exist**

Run:

```bash
pnpm --filter @noxivo/dashboard test -- test/settings-shop-route.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Create the status/update route**

Write `apps/dashboard/app/api/settings/shop/route.ts` using this structure:

```ts
import { NextResponse } from 'next/server';
import { AgencyModel, DataSourceModel, PluginInstallationModel, TenantCredentialModel } from '@noxivo/database';
import dbConnect from '../../../../lib/mongodb';
import { getCurrentSession } from '../../../../lib/auth/session';
import { canManageCredentials } from '../../../../lib/auth/authorization';
import { resolveActorTenantId } from '../../../../lib/auth/tenant-context';
import { canUseShopProvider, type SupportedShopProvider } from '../../../../lib/settings/shop-permissions';

type ShopStatusResponse = {
  provider: SupportedShopProvider;
  entitled: boolean;
  configured: boolean;
  enabled: boolean;
  credentialStatus: 'active' | 'error' | 'expired' | 'missing';
  lastSyncedAt: string | null;
};
```

The GET handler should:
- require authenticated session
- require `canManageCredentials(session)`
- resolve active tenant
- load `AgencyModel` to inspect `agency.plan`
- return one entry for `shopify` and one for `woocommerce`

The POST handler should:
- accept `{ provider, enabled }`
- reject unsupported providers with 400
- reject disallowed plan/provider combos with 403
- reject enable requests when no active credential exists with 409
- upsert `PluginInstallationModel` using `pluginId: \'shop\'`, `pluginVersion: '1.0.0'`, and `config.enabledProviders`
- mirror enablement into the matching `DataSourceModel.enabled`

- [ ] **Step 4: Add the exact POST update body parser**

Use this parser inside the route:

```ts
function parseRequestBody(input: unknown): { provider: SupportedShopProvider; enabled: boolean } {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid payload');
  }

  const value = input as Record<string, unknown>;
  if (value.provider !== 'shopify' && value.provider !== 'woocommerce') {
    throw new Error('Unsupported provider');
  }

  if (typeof value.enabled !== 'boolean') {
    throw new Error('enabled must be boolean');
  }

  return { provider: value.provider, enabled: value.enabled };
}
```

- [ ] **Step 5: Re-run the shop-route test file and make it pass**

Run:

```bash
pnpm --filter @noxivo/dashboard test -- test/settings-shop-route.test.ts
```

Expected: PASS with reseller_basic forbidden and reseller_pro activation allowed.

- [ ] **Step 6: Commit the activation route**

```bash
git add apps/dashboard/app/api/settings/shop/route.ts apps/dashboard/lib/settings/shop-permissions.ts apps/dashboard/test/settings-shop-route.test.ts
git commit -m "feat: add shop provider activation route"
```

### Task 5: Update the dashboard integrations UI for Shop cards and per-provider toggles

**Files:**
- Modify: `apps/dashboard/app/dashboard/settings/integrations/integrations-client.tsx`
- Read context: `apps/dashboard/app/dashboard/settings/integrations/page.tsx`
- Manual QA: `/dashboard/settings/integrations`

- [ ] **Step 1: Add a failing manual checklist before editing UI**

Use this checklist while the route work is fresh:

```md
- Shopify card visible in integrations grid
- WooCommerce card visible in integrations grid
- Disabled provider shows "Not enabled on current plan"
- Configured provider shows status badge + enable toggle
- Toggling OFF keeps credentials but disables plugin
```

- [ ] **Step 2: Add provider metadata and form fields for shop providers**

Extend the provider types and form state in `integrations-client.tsx`:

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
  shopifyAccessToken: string;
  shopifyStoreUrl: string;
  shopifyApiVersion: string;
  wooConsumerKey: string;
  wooConsumerSecret: string;
  wooStoreUrl: string;
  wooApiBasePath: string;
};
```

Add provider meta entries:

```ts
shopify: {
  title: 'Shopify',
  description: 'Connect a Shopify catalog for Shop-powered product answers and live inventory lookups.',
},
woocommerce: {
  title: 'WooCommerce',
  description: 'Connect a WooCommerce catalog for Shop-powered product answers and live inventory lookups.',
},
```

- [ ] **Step 3: Load shop status alongside credentials**

Add local state:

```ts
type ShopStatusRecord = {
  provider: 'shopify' | 'woocommerce';
  entitled: boolean;
  configured: boolean;
  enabled: boolean;
  credentialStatus: 'active' | 'error' | 'expired' | 'missing';
  lastSyncedAt: string | null;
};

const [shopStatuses, setShopStatuses] = useState<ShopStatusRecord[]>([]);
const [isTogglingProvider, setIsTogglingProvider] = useState<Provider | null>(null);
```

And fetch them inside `loadCredentials()`:

```ts
const [credentialsResponse, shopResponse] = await Promise.all([
  fetch('/api/settings/credentials', { cache: 'no-store' }),
  fetch('/api/settings/shop', { cache: 'no-store' }),
]);
```

- [ ] **Step 4: Add enable / disable action buttons per shop provider**

Use this button pattern in each Shopify/WooCommerce card:

```tsx
<button
  type="button"
  disabled={!shopStatus?.entitled || !existing || isTogglingProvider === provider}
  onClick={() => void toggleShopProvider(provider, !(shopStatus?.enabled ?? false))}
  className="h-11 min-w-[44px] w-full rounded-2xl border border-border-ghost bg-surface-base text-sm font-bold text-on-surface transition-all hover:border-primary/30 hover:text-primary disabled:opacity-50"
>
  {shopStatus?.enabled ? 'Deactivate Plugin' : 'Activate Plugin'}
</button>
```

`toggleShopProvider` should POST to `/api/settings/shop` with `{ provider, enabled }`, then reload credentials + statuses.

- [ ] **Step 5: Add locked / permission messaging**

For disallowed plans, render this status block instead of an activation button:

```tsx
<div className="rounded-2xl border border-warning/20 bg-warning/5 px-4 py-3 text-xs font-semibold text-warning">
  Not enabled on the current subscription. Upgrade the workspace plan to activate this provider.
</div>
```

- [ ] **Step 6: Run lint and perform manual QA on the page**

Run:

```bash
pnpm --filter @noxivo/dashboard lint
```

Expected: existing repo-wide status; fix only errors introduced by this feature.

Then manually verify:

```bash
pnpm --filter @noxivo/dashboard dev
```

Open `/dashboard/settings/integrations` and confirm:
- Shopify and WooCommerce cards render.
- Modal fields match the selected provider.
- Activation is blocked on a disallowed plan.
- Deactivation leaves credentials intact.

- [ ] **Step 7: Commit the UI changes**

```bash
git add apps/dashboard/app/dashboard/settings/integrations/integrations-client.tsx
git commit -m "feat: add shop integration controls"
```

### Task 6: Final verification and handoff updates

**Files:**
- Modify: `TODO.md`
- Modify: `SESSION_HANDOFF.md`

- [ ] **Step 1: Run the focused automated checks**

Run:

```bash
pnpm --filter @noxivo/dashboard test -- test/settings-credentials-route.test.ts
pnpm --filter @noxivo/dashboard test -- test/settings-shop-route.test.ts
pnpm --filter @noxivo/dashboard lint
```

Expected:
- settings route tests PASS
- new shop route tests PASS
- lint shows no new failures caused by this feature

- [ ] **Step 2: Update TODO.md**

Add finished work and next step in this exact style:

```md
- [x] Add dashboard-only Shop plugin controls for Shopify and WooCommerce

## Next Action
- Wire the workflow-engine/runtime to consume enabled Shop data sources for Sharebot product answers.
```

- [ ] **Step 3: Update SESSION_HANDOFF.md**

Document:
- files changed
- route tests added
- plan-permission matrix used
- note that runtime product search is still a follow-up

- [ ] **Step 4: Final commit**

```bash
git add TODO.md SESSION_HANDOFF.md
git commit -m "docs: record shop plugin dashboard rollout"
```

---

## Self-Review

### Spec coverage
- Dashboard-only plugin management: covered by Tasks 2, 4, and 5.
- Per-provider activation/deactivation: covered by Task 4 and Task 5.
- Subscription-plan permissions: covered by Task 2 and enforced in Task 4 / Task 5.
- Shopify + WooCommerce credentials: covered by Task 1 and Task 3.
- Local cache metadata preserved for future runtime work: covered by Task 3 through `DataSourceModel.config`.

### Placeholder scan
- No `TBD`, `TODO`, or “implement later” placeholders remain inside tasks.
- Each route/UI task includes explicit file paths, commands, and example code.

### Type consistency
- Providers consistently use `'shopify' | 'woocommerce'`.
- Plugin id consistently uses `'shop'`.
- Activation route and UI both use the same entitlement helper (`canUseShopProvider`).

---

Plan complete and saved to `docs/superpowers/plans/2026-04-18-shop-plugin-dashboard-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
