# Session Handoff - 2026-04-18

## Update - 2026-04-19 (Spa Backend Source-of-Truth API Foundation)

### Summary
Added the first complete backend slice for Spa Tique Nails inside `apps/workflow-engine`. The repo now has dedicated spa-domain auth, catalog, booking, customer projection, admin settings, gallery, media-provider configuration, and AI concierge configuration routes under `/api/v1/spa`, and those records are now linked to `agencyId` instead of being salon-global.

### Completed Changes
- Added new spa-domain contracts in `packages/contracts/src/spa.ts`.
- Added spa-specific Mongoose models for members, sessions, services, service categories, bookings, customer profiles, media storage config, site settings, gallery images, and AI concierge config.
- Added new workflow-engine spa modules for auth/session handling, optional request member resolution, media URL resolution, frontend-compatible serializers, and customer projection updates.
- Added `/api/v1/spa` route coverage for auth (`sign-up`, `sign-in`, `sign-out`, `me`), public catalog services, booking creation, member account bookings/profile, admin customers, admin services, admin media storage config, admin site settings, admin gallery, and admin AI concierge config.
- Bound spa entities and route behavior to `agencyId`:
  - public catalog reads require agency context
  - sign-up/sign-in require `agencyId`
  - guest bookings require `agencyId`
  - member/admin routes inherit agency scope from the signed-in spa member
- Excluded `/api/v1/spa/*` from the global API-key middleware so the new cookie-based spa auth model can work independently of the platform API-key flow.
- Added API docs at `docs/reference/spa-api.md`.

### Files Changed (2026-04-19)
- `apps/workflow-engine/src/routes/v1/spa.routes.ts` (new)
- `apps/workflow-engine/src/modules/spa/auth.service.ts` (new)
- `apps/workflow-engine/src/modules/spa/customer-profile.service.ts` (new)
- `apps/workflow-engine/src/modules/spa/http-auth.ts` (new)
- `apps/workflow-engine/src/modules/spa/media-url.service.ts` (new)
- `apps/workflow-engine/src/modules/spa/serializers.ts` (new)
- `apps/workflow-engine/src/plugins/api-auth.plugin.ts`
- `apps/workflow-engine/src/server.ts`
- `apps/workflow-engine/test/spa-media-url.service.test.ts` (new)
- `apps/workflow-engine/test/spa-auth-routes.test.ts` (new)
- `apps/workflow-engine/test/spa-catalog-routes.test.ts` (new)
- `apps/workflow-engine/test/spa-bookings-routes.test.ts` (new)
- `apps/workflow-engine/test/spa-admin-routes.test.ts` (new)
- `packages/contracts/src/spa.ts` (new)
- `packages/contracts/src/index.ts`
- `packages/database/src/models/spa-member.ts` (new)
- `packages/database/src/models/spa-session.ts` (new)
- `packages/database/src/models/spa-service-category.ts` (new)
- `packages/database/src/models/spa-service.ts` (new)
- `packages/database/src/models/spa-booking.ts` (new)
- `packages/database/src/models/spa-customer-profile.ts` (new)
- `packages/database/src/models/spa-media-storage-config.ts` (new)
- `packages/database/src/models/spa-site-settings.ts` (new)
- `packages/database/src/models/spa-gallery-image.ts` (new)
- `packages/database/src/models/spa-ai-concierge-config.ts` (new)
- `packages/database/src/models/index.ts`
- `docs/reference/spa-api.md` (new)
- `docs/superpowers/specs/2026-04-19-spa-backend-source-of-truth-design.md` (new)
- `docs/superpowers/plans/2026-04-19-spa-backend-source-of-truth-plan.md` (new)
- `TODO.md`
- `SESSION_HANDOFF.md`

## Update - 2026-04-19 (Dashboard inbound recovery across split dashboard/engine data planes)

### Summary
Fixed the dashboard-side inbox recovery gap that left inbound WhatsApp messages invisible when the workflow-engine and dashboard were not reading the same Mongo/Redis plane. Outbound looked healthy because the dashboard writes/broadcasts locally, but inbound could stay stale because the dashboard only did a best-effort sync call and then kept reading its own local DB.

### Completed Changes
- **Dashboard inbox summary reconciliation**
  - Updated `apps/dashboard/app/api/team-inbox/route.ts` to always reconcile remote workflow-engine MessagingProvider chat summaries for the selected tenant when listing the inbox, not only when local conversations are empty.
- **Dense-history inbound recovery**
  - Updated `apps/dashboard/app/api/team-inbox/[conversationId]/messages/route.ts` so the paginated history route backfills from workflow-engine when a conversation summary refreshed from workflow-engine is newer than the newest locally persisted message.
- **Regression coverage**
  - Added dashboard route coverage for stale sidebar refresh and dense history recovery.

## Update - 2026-04-19 (Workflow-Engine Build Fix for inbox sync alias normalization)

### Summary
Fixed the workflow-engine TypeScript build failure by replacing the direct array alias with a single-value wrapper in `MessagingInboxSyncService`.

## Update - 2026-04-19 (Outbound Send Missing-Cluster Fallback Fix)

### Summary
Updated the public send route fallback in `apps/workflow-engine/src/routes/v1/messages.routes.ts` to trigger for both missing session bindings and missing cluster rows.

## Update - 2026-04-19 (API Key Live-Session Recovery Fix)

### Summary
Updated `apps/workflow-engine/src/routes/v1/api-keys.routes.ts` to recreate local `MessagingSessionBinding` from live MessagingProvider metadata when bootstrap fails, allowing scoped API key issuance for existing sessions.

## Update - 2026-04-19 (Production Self-Proxy Hardening + Remote Diagnosis)

### Summary
Centralized MessagingProvider base URL resolution in `apps/workflow-engine/src/lib/messaging-base-url.ts` to prioritize bound cluster URLs over global proxy env values, mitigating self-proxy risks in production.

## Update - 2026-04-19 (Inbox Webhook + Cursor Recovery + Sync Realtime Fixes)

### Summary
Widened webhook message ID parsing, fixed dashboard inbox history recovery for sparse cursor pages, and wired `InboxEventsPublisher` into `MessagingInboxSyncService` for realtime sync event parity.

## Update - 2026-04-19 (Inbox Silent-Refresh Cursor Fix)

### Summary
Updated the dashboard inbox to preserve discovered pagination cursors during silent realtime refreshes, ensuring continuous older-message loading.
