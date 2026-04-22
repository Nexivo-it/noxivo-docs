# Dashboard UI-Only Migration Implementation Record

## Goal

Move `apps/dashboard` to a frontend-only runtime model and make `apps/workflow-engine` the single backend/API surface for dashboard auth, data, realtime streams, support endpoints, and aggregate server-side reads.

## Branch

- `dashboard-ui`

## Final Runtime Boundary

### Dashboard now owns

- Next.js pages, layouts, and client/server UI composition
- browser and server-side API clients that call workflow-engine
- static health page at `/healthz`

### Workflow-engine now owns

- dashboard auth/session
- dashboard branding lookup
- agencies, tenants, team, invitations
- workflows, runs, execution-events SSE
- catalog, catalog settings, uploads, AI help
- team inbox, leads, CRM, memories, inbox events SSE
- settings and integrations
- notifications and ImageKit upload auth
- admin messaging session APIs
- dashboard aggregate data for shell / overview / billing
- webhook inbox ingress

### Dashboard route layer removed

Deleted:

- `apps/dashboard/app/api/**`
- `apps/dashboard/lib/api/workflow-engine-proxy.ts`

That means dashboard runtime no longer depends on local Next route handlers for backend work.

## Implementation Summary

### 1. Workflow-engine parity added

Implemented or extended workflow-engine backend ownership for:

- `apps/workflow-engine/src/modules/dashboard-auth/**`
  - login / signup / logout / session
  - branding lookup by agency slug
- `apps/workflow-engine/src/modules/dashboard-data/**`
  - shell aggregate
  - overview aggregate
  - billing aggregate
- `apps/workflow-engine/src/routes/v1/memories.routes.ts`
- `apps/workflow-engine/src/modules/webhook-inbox/ingress.route.ts`
- `apps/workflow-engine/src/modules/settings/routes/index.ts`
  - notifications
  - ImageKit auth
- `apps/workflow-engine/src/routes/v1/admin.routes.ts`
  - admin session restart/delete parity

Also updated workflow-engine registration/auth wiring in:

- `apps/workflow-engine/src/server.ts`
- `apps/workflow-engine/src/plugins/api-auth.plugin.ts`

## 2. Dashboard client layers added

Added direct workflow-engine client utilities:

- `apps/dashboard/lib/api/workflow-engine-client.ts`
- `apps/dashboard/lib/api/workflow-engine-server.ts`
- `apps/dashboard/lib/api/dashboard-auth-client.ts`
- `apps/dashboard/lib/api/dashboard-api.ts`
- `apps/dashboard/lib/api/dashboard-aggregates.ts`

These now power browser fetches, server-side fetches with forwarded cookies, and direct SSE URL construction.

## 3. Dashboard auth moved off local backend

Updated auth runtime usage in:

- `apps/dashboard/components/login-form.tsx`
- `apps/dashboard/components/signup-form.tsx`
- `apps/dashboard/components/dashboard-shell.tsx`
- `apps/dashboard/lib/auth/current-user.ts`
- slug auth pages now use workflow-engine branding lookup via `apps/dashboard/lib/branding.ts`

## 4. Dashboard feature callers migrated to workflow-engine

Migrated caller surfaces for:

- agencies / tenants / team / invitations
- workflows / templates / workflow builder / edit
- catalog workspace / import / linking / preview / settings
- inbox / leads / CRM / memories
- settings / integrations / webhooks / QR / developer API
- notifications / imagekit / admin messaging support flows

Representative files updated:

- `apps/dashboard/components/tenants-workspace.tsx`
- `apps/dashboard/components/team-workspace.tsx`
- `apps/dashboard/components/url-agency-context-setter.tsx`
- `apps/dashboard/components/workflows/visual-builder.tsx`
- `apps/dashboard/components/team-inbox/team-inbox-crm-panel.tsx`
- `apps/dashboard/app/dashboard/agencies/agencies-client.tsx`
- `apps/dashboard/app/dashboard/workflows/workflows-client.tsx`
- `apps/dashboard/app/dashboard/workflows/templates/templates-client.tsx`
- `apps/dashboard/app/dashboard/catalog/page.tsx`
- `apps/dashboard/app/dashboard/catalog/import/page.tsx`
- `apps/dashboard/app/dashboard/catalog/linking/page.tsx`
- `apps/dashboard/app/dashboard/catalog/preview/page.tsx`
- `apps/dashboard/app/dashboard/catalog/settings/page.tsx`
- `apps/dashboard/app/dashboard/inbox/page.tsx`
- `apps/dashboard/app/dashboard/leads/page.tsx`
- `apps/dashboard/app/dashboard/settings/settings-client.tsx`
- `apps/dashboard/app/dashboard/settings/integrations/integrations-client.tsx`
- `apps/dashboard/app/dashboard/settings/integrations/webhook-inbox-activation-panel.tsx`
- `apps/dashboard/app/dashboard/settings/integrations/webhook-inbox-sources-panel.tsx`
- `apps/dashboard/app/dashboard/admin/messaging/page.tsx`

## 5. Server-rendered dashboard pages moved off direct DB reads

Replaced direct dashboard DB/query helper usage with workflow-engine server fetches in:

- `apps/dashboard/app/dashboard/layout.tsx`
- `apps/dashboard/app/dashboard/page.tsx`
- `apps/dashboard/app/dashboard/billing/page.tsx`
- `apps/dashboard/app/dashboard/agency/page.tsx`
- `apps/dashboard/app/dashboard/agencies/page.tsx`
- `apps/dashboard/app/dashboard/agencies/[agencyId]/page.tsx`
- `apps/dashboard/app/dashboard/team/page.tsx`
- `apps/dashboard/app/dashboard/tenants/page.tsx`
- `apps/dashboard/app/dashboard/workflows/page.tsx`
- `apps/dashboard/app/dashboard/workflows/[workflowId]/edit/page.tsx`

## 6. Admin sessions local backend removed

- Deprecated `apps/dashboard/app/dashboard/admin/sessions/page.tsx` now redirects to `/dashboard/admin/messaging`
- Deleted:
  - `apps/dashboard/app/dashboard/admin/sessions/SessionsClient.tsx`
  - `apps/dashboard/app/dashboard/admin/sessions/actions.ts`

## 7. Health endpoint usage simplified

- Added static page: `apps/dashboard/app/healthz/page.tsx`
- Updated health consumers:
  - `docker-compose.dashboard.yml`
  - `scripts/deep-health-check.ts`

## Verification

Final branch verification passed:

- `pnpm --filter @noxivo/dashboard test`
  - 132 passed, 1 skipped
- `pnpm --filter @noxivo/dashboard build`
  - passed
- `pnpm --filter @noxivo/workflow-engine lint`
  - passed
- `pnpm --filter @noxivo/workflow-engine build`
  - passed
- `pnpm --filter @noxivo/workflow-engine test`
  - 245 passed

## Practical Confirmation

At runtime, dashboard is now a Next.js UI/frontend that uses workflow-engine APIs directly.

It does **not** rely on dashboard-local `app/api/**` routes anymore.

Workflow-engine is the backend surface for dashboard runtime behavior.

## Remaining Non-Runtime Cleanup (Optional)

There may still be legacy dashboard helper files/tests that are no longer on the runtime path. Those are cleanup debt, not active runtime backend ownership.
