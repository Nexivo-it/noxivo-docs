# Noxivo SaaS TODO

## Active Sprint

- [x] Fix Voicetree context drift for workflow-engine docs (stale `messaging_integration.md` links and stale `.../messaging/noxivo-saas/...` paths)
- [x] Sync Voicetree workflow-engine context docs with live code (webhook secret var, webhook service naming, action support statement, CRM specialized mapping note)
- [x] AI-Powered Reply Suggestions
- [x] CRM synchronization on message creation
- [x] Multi-tenant SSE security hardening
- [x] Fix Dashboard Docker build and runtime dependency resolution
- [x] Add platform initial seeding to Docker container startup
- [x] Resolve @noxivo/database model exports for build-time compatibility
- [x] Optimize Docker build context with refined .dockerignore
- [x] Install mongoose in `@noxivo/database`
- [x] Organizational Restructure of `voicetree-14-4`
- [x] Documentation of all 17 Workflow Engine modules
- [x] Documentation of shared workspace packages (`database`, `contracts`, `messaging-client`)
- [x] Summary of product-level documentation in `product/`
- [x] Standardize Engine API URL handling and normalize root vs /api/v1 usage
- [x] Final visual layout audit of VoiceTree nodes in the viewer
- [x] Comprehensive link audit for broken markdown links after file movements
- [x] Update WhatsApp settings session actions to use login / regenerate QR / logout semantics
- [x] Add explicit workflow-engine session restart endpoint and dashboard QR regeneration coverage
- [x] Fix TypeScript errors in workflow-engine (swagger.plugin.ts, messages.routes.ts, pairing.routes.ts, sessions.routes.ts)
- [x] Fix QR session payload parsing to support direct string value instead of object wrapper (Dashboard Settings UI blank QR)
- [x] Verify Swagger/OpenAPI V1 routes exposed correctly (20+ routes verified on production)
- [x] Fix inbox realtime SSE dedupe to allow same-timestamp inbound messages when message identity differs
- [x] Stabilize inbox SSE envelope latest-message lookup with deterministic `timestamp + _id` sorting
- [x] Fix workflow-engine plugin manifest crash (`ai-sales-agent` category now valid enum `messaging`)
- [x] Add regression test for same-timestamp inbox realtime events (`test/inbox-events-route.test.ts`)
- [x] Fix selected-thread history sync for opaque `@lid` chats by resolving canonical MessagingProvider contact identity and merging sibling `@c.us` conversation history
- [x] Add workflow-engine fallback to import latest chat overview `lastMessage` when MessagingProvider message history endpoints fail
- [x] Prevent duplicate inbound writes during concurrent MessagingProvider sync runs using per-conversation sync lock + sibling-conversation provider-id dedupe
- [x] Prevent duplicate inbox rendering by deduping message history payloads and merging sibling chat summaries when latest provider message id matches
- [x] Fix sparse inbox history recovery to fetch older MessagingProvider messages in 20-message pages (`offset` pagination) and parse wrapped payload shapes (`messages`/`data`/`results`)
- [x] Add regression coverage for cursor pagination continuity after sparse history recovery
- [x] Fix inbox silent-refresh cursor desync so sparse threads can continue loading older history after realtime refresh
- [x] Add dashboard regression test for sparse-history realtime refresh + older-page cursor continuity
- [x] Harden workflow-engine webhook parsing so inbound messages persist when provider message ids use `_serialized` payload shape
- [x] Recover sparse cursor pages in dashboard inbox route so older history can continue loading beyond the first page
- [x] Publish inbox realtime events from workflow-engine sync writes so sidebar/open thread refresh immediately after sync inserts and delivery-state updates
- [x] Harden workflow-engine messaging base-url resolution so bound cluster MessagingProvider URLs win over self-referential proxy env values for sync/send/session reads
- [x] Fix `/api/v1/api-keys/me` implicit binding bootstrap so scoped API key generation still works when proxy env points at the engine but a valid MessagingProvider cluster exists
- [x] Recover `/api/v1/api-keys/me` from live MessagingProvider session metadata when bootstrap fails with `Tenant not found` but the live session still exists remotely
- [x] Fallback `/api/v1/messages/send` to live-session direct MessagingProvider send when an active binding exists but its cluster row is missing
- [x] Add dashboard-only Shop plugin controls for Shopify and WooCommerce
- [x] Add per-provider plan-gated activation/deactivation for Shop integrations
- [x] Extend dashboard credential persistence to mirror Shop providers into `DataSourceModel`
- [x] Integrate workflow-engine `search_store` tool with live Shopify and WooCommerce data sources via `DataSourceModel` resolution.
- [x] Implement normalized product adapters for Shopify (Admin API) and WooCommerce (REST API).
- [x] Fix `AuthSession validation failed: tenantId: Cast to ObjectId failed` bug when logging in as a Platform Owner without tenant context.
- [x] Fix `Failed to recover WhatsApp session` bug and racing QR code generation for new sessions.
- [x] **Stabilize workspace test suites (Root `pnpm test` now green):**
  - [x] Fix `@noxivo/workflow-engine` test instability (Redis mocking, Env var isolation, Schema validation).
  - [x] Fix `@noxivo/dashboard` test regressions (Passive GET vs Auto-bootstrap).
  - [x] Fix `@noxivo/database` test failures (Missing Model.init() for unique indexes).
  - [x] Fix `@noxivo/dashboard-admin` test failure (Missing test files).
- [x] Fix `/product/canva` 404 by adding `basePath` to `service-catalog-canvas` and adding sidebar link.

## Multi-Dashboard Architecture (Completed Earlier)

- [x] Dashboard docker-compose (`docker-compose.dashboard.yml`) - separate deployment with own MongoDB/Redis
- [x] DashboardConfig model (`packages/database/src/models/dashboard-config.ts`)
- [x] Dashboard Registry Service (`apps/workflow-engine/src/modules/dashboard-registry/`)
- [x] Dashboard Registry Routes (`POST /v1/internal/dashboard/register`, `GET /v1/internal/dashboard/agencies`)
- [x] URL Agency Context Setter (`apps/dashboard/components/url-agency-context-setter.tsx`)
- [x] Swagger security schemes (apiKey + PSK)
- [x] Multi-dashboard architecture documentation

## Next Action
- Correct production MessagingProvider env wiring so it points at MessagingProvider, not the workflow-engine itself, then validate inbox infinite-scroll behavior in a real MessagingProvider-connected environment (`@lid` and `@c.us` contacts).
- Run a code-level gap audit of `apps/workflow-engine` against Voicetree context summaries (compiler/executor/worker/server boundaries).
- Implement `get_product_details` tool to allow the AI Sales Agent to fetch specific product data (descriptions, specific variants) after finding candidates via `search_store`.

## Commands Still Relevant

- `rg -n "messaging_integration\\.md|messaging/noxivo-saas|apps_workflow_engine_context_1776393302834\\.md" voicetree-14-4` ✅ (returns no matches)
- `rg -n 'MESSAGING_WEBHOOK_SECRET|MessagingRouteService|explicitly \`sendText\`' voicetree-14-4/workflow-engine/*.md voicetree-14-4/workflowenginecontextanalysis20260417.md voicetree-14-4/ctx-nodes/workflowenginecontextanalysis20260417_context_1776566400045.md voicetree-14-4/ctx-nodes/workflowenginecontextanalysis20260417_context_1776568437318.md` ✅ (returns no matches)
- `pnpm --filter @noxivo/dashboard exec vitest run test/team-inbox-routes.test.ts` ✅
- `pnpm --filter @noxivo/dashboard exec vitest run test/inbox-pagination-realtime.test.tsx` ✅
- `pnpm --filter @noxivo/dashboard exec vitest run test/team-inbox-routes.test.ts -t "loads older pages from direct MessagingProvider history"` ✅
- `pnpm --filter @noxivo/workflow-engine exec vitest run test/messaging-inbox-routes-pagination.test.ts` ✅
- `pnpm --filter @noxivo/workflow-engine exec vitest run test/messaging-inbox-sync.service.test.ts` ✅
- `pnpm --filter @noxivo/workflow-engine exec vitest run test/messaging-webhook-enterprise.test.ts` ✅
- `pnpm --filter @noxivo/workflow-engine exec vitest run test/internal-inbox-route.test.ts test/messaging-inbox-sync.service.test.ts test/messaging-session.service.test.ts` ✅
- `pnpm --filter @noxivo/workflow-engine exec vitest run test/api-keys-routes.test.ts` ✅
- `pnpm --filter @noxivo/workflow-engine exec vitest run test/api-keys-routes.test.ts` ✅ (covers bootstrap + missing-tenant + live-session recovery)
- `pnpm --filter @noxivo/workflow-engine exec vitest run test/messages-route.test.ts` ✅ (covers no-binding + missing-cluster fallback)
- `pnpm --filter @noxivo/dashboard exec vitest run test/inbox-events-route.test.ts test/inbox-pagination-realtime.test.tsx` ✅
- `pnpm --filter @noxivo/dashboard exec vitest run test/settings-credentials-route.test.ts` ✅
- `pnpm --filter @noxivo/dashboard exec vitest run test/settings-shop-route.test.ts` ✅
- `pnpm --filter @noxivo/workflow-engine lint` ✅
- `pnpm --filter @noxivo/dashboard build` ✅
- `pnpm --filter @noxivo/dashboard lint` ✅
- `pnpm --filter @noxivo/workflow-engine build` ✅
- Swagger spec: `https://api-workflow-engine.khelifi-salmen.com/json`
