# Inbox / WAHA Context Pack

Last updated: 2026-04-20

## Purpose

This file is the reusable context pack for ongoing inbox work in `apps/workflow-engine` and `apps/dashboard`.
It captures:
- confirmed WAHA behavior from official docs/OpenAPI,
- the actual current Noxivo inbound/outbound/contact architecture,
- known production issues already observed,
- and patterns previously used in the older GHL integration project that may still be useful.

---

## 1) Confirmed WAHA behavior (official docs / OpenAPI)

### Real-time inbound delivery
- WAHA supports **webhooks** and **WebSocket events** for inbound message delivery.
- Webhooks are configured on session create/update via `config.webhooks[]`.
- Important inbound event names:
  - `message`
  - `message.any`
  - `message.ack`
  - `message.reaction`
  - `message.edited`
  - `message.revoked`
  - `session.status`
- `message.any` is the safest “all message creations” event if you need both sides; direction must still be determined from payload fields such as `fromMe`.

### History sync / old messages
- WAHA docs prefer event-driven ingestion for new traffic, but history can still be pulled via chats/messages APIs.
- For NOWEB, history/contacts/chats require store support:
  - `config.noweb.store.enabled=true`
  - optional `config.noweb.store.fullSync=true|false`
- Without store enabled, history-style inbox backfills may appear incomplete or unavailable.

### Contacts / IDs / LIDs
- WAHA treats `@lid` as a first-class chat identifier.
- Relevant ID families:
  - `@c.us`
  - `@lid`
  - `@s.whatsapp.net` (internal-ish; docs indicate converting to `@c.us` for normal API usage)
- LID endpoints:
  - `GET /api/{session}/lids`
  - `GET /api/{session}/lids/{lid}`
  - `GET /api/{session}/lids/pn/{phoneNumber}`
- Mappings can be incomplete depending on visibility/admin/group/contact state.

### Outbound sends
- WAHA send endpoints include `sendText`, `sendImage`, `sendFile`, `sendVoice`, `sendVideo`, etc.
- Docs/OpenAPI allow both `@c.us` and `@lid` chat IDs for sending.
- Practical caveat: some environments still behave more predictably with canonical phone-based `@c.us` when mapping exists.

### Operational pitfalls
- Missing/partial media payloads can occur (`hasMedia=true` but no `media.url`).
- Some group participant / event combinations can duplicate signals.
- `session.status=FAILED` must be treated as a restart/recovery state.
- WAHA docs do **not** guarantee perfect LID → phone reversibility.

### URLs researched
- https://github.com/devlikeapro/waha-docs/blob/main/content//docs/how-to/receive-messages/index.md
- https://github.com/devlikeapro/waha-docs/blob/main/content//docs/how-to/waha-plus/index.md
- https://github.com/devlikeapro/waha-docs/blob/main/content//docs/how-to/contacts/index.md
- https://waha.devlike.pro/swagger/openapi.json

---

## 2) Noxivo workflow-engine inbox architecture (actual current code)

### Inbound webhook path
- Route: `POST /v1/webhooks/messaging`
- File: `apps/workflow-engine/src/server.ts`
- Handler service: `MessagingRouteService.processWebhook(...)`
- File: `apps/workflow-engine/src/modules/webhooks/messaging.route.ts`

### Inbound sync paths
- Public chat list sync trigger:
  - `GET /v1/inbox/chats`
  - file: `apps/workflow-engine/src/routes/messaging-inbox.routes.ts`
- Public conversation history sync trigger:
  - `GET /v1/inbox/conversations/:conversationId/messages`
  - same file
- Internal sync trigger:
  - `POST /v1/internal/inbox/sync`
  - file: `apps/workflow-engine/src/server.ts`

### Sync service
- File: `apps/workflow-engine/src/modules/inbox/messaging-sync.service.ts`
- Main methods:
  - `syncRecentChats(...)`
  - `syncConversationMessages(...)`

### Inbound / outbound persistence primitive
- File: `apps/workflow-engine/src/modules/inbox/inbox.service.ts`
- Main write method: `recordMessage(...)`
- Conversation normalization/merge: `upsertConversationIdentity(...)`

### Contact identity resolution
- File: `apps/workflow-engine/src/modules/inbox/messaging-contact-identity.ts`
- Key functions:
  - `extractPhoneDigits(...)`
  - `buildMessagingAliasCandidates(...)`
  - `resolveMessagingContactIdentity(...)`
- Existing behavior already preserves:
  - `canonicalContactId`
  - `rawContactId`
  - `contactAliases`
  - `messagingChatId`

### Outbound sends
- Public API route:
  - `POST /api/v1/messages/send`
  - file: `apps/workflow-engine/src/routes/v1/messages.routes.ts`
- Internal inbox send route:
  - `POST /v1/internal/inbox/conversations/:conversationId/messages`
  - file: `apps/workflow-engine/src/server.ts`
- Main service:
  - `InternalInboxMessageService.sendOperatorMessage(...)`
  - file: `apps/workflow-engine/src/modules/inbox/internal-message.service.ts`

### Event publishing
- File: `apps/workflow-engine/src/modules/inbox/inbox-events.publisher.ts`
- Main methods:
  - `publishMessageCreated(...)`
  - `publishDeliveryUpdated(...)`
  - `publishConversationUpdated(...)`

---

## 3) Best first tests / verification commands

Run from repo root:

```bash
pnpm --filter @noxivo/workflow-engine exec vitest run test/messaging-webhook-route.test.ts
pnpm --filter @noxivo/workflow-engine exec vitest run test/messaging-webhook-enterprise.test.ts
pnpm --filter @noxivo/workflow-engine exec vitest run test/messaging-inbox-sync.service.test.ts
pnpm --filter @noxivo/workflow-engine exec vitest run test/messaging-inbox-routes-pagination.test.ts
pnpm --filter @noxivo/workflow-engine exec vitest run test/internal-inbox-route.test.ts
pnpm --filter @noxivo/workflow-engine exec vitest run test/messages-route.test.ts
pnpm --filter @noxivo/workflow-engine exec vitest run test/inbox.service.test.ts
```

High-signal grouped runs:

```bash
pnpm --filter @noxivo/workflow-engine exec vitest run test/messaging-webhook-route.test.ts test/messaging-inbox-sync.service.test.ts
pnpm --filter @noxivo/workflow-engine exec vitest run test/internal-inbox-route.test.ts test/messages-route.test.ts
```

---

## 4) Known production issue: stale dashboard webhooks path

### Symptom
- Browser request:
  - `GET https://noxivo.app/api/v1/agency/webhooks`
- Actual live result:
  - **Next.js 404 page** from `noxivo.app`

### Root cause
- Caller found in dashboard:
  - `apps/dashboard/app/dashboard/settings/settings-client.tsx`
  - `fetch('/api/v1/agency/webhooks')`
  - also POST/PUT/DELETE to the same same-origin path
- But dashboard does **not** expose a matching Next API route.
- There is also no rewrite/proxy for `/api/v1/agency/webhooks` in `apps/dashboard/next.config.ts`.

### Important nuance
- The route **does exist** in workflow-engine:
  - file: `apps/workflow-engine/src/routes/v1/spa.routes.ts`
  - endpoints:
    - `GET /api/v1/agency/webhooks`
    - `POST /api/v1/agency/webhooks`
    - `PUT /api/v1/agency/webhooks/:webhookId`
    - `DELETE /api/v1/agency/webhooks/:webhookId`
- Those engine routes are SPA-auth oriented, not magically available from the SaaS app origin.

### Practical conclusion
- Current dashboard settings screen is calling the wrong origin/path shape.
- This is a **dashboard integration bug**, not a missing engine feature.

---

## 5) Current QR code flow (dashboard → engine)

### Dashboard UI entrypoint
- File: `apps/dashboard/app/dashboard/settings/settings-client.tsx`
- Main client calls:
  - `GET /api/settings/qr`
  - `POST /api/settings/qr`
  - `DELETE /api/settings/qr`
- QR polling behavior:
  - if `qrState.status === 'provisioning'` → poll every 3s
  - if `qrState.status === 'available'` → poll every 5s

### Dashboard API route
- File: `apps/dashboard/app/api/settings/qr/route.ts`
- Engine-first path:
  - uses `resolveDashboardMessagingSession(...)`
  - file: `apps/dashboard/lib/api/messaging-session.ts`
- Legacy fallback path:
  - calls `GET /v1/messaging/session/qr` on the workflow-engine internal route when legacy envs are configured.

### Engine-side QR/status/profile routes
- `GET /api/v1/sessions/:id/qr`
  - file: `apps/workflow-engine/src/routes/v1/pairing.routes.ts`
- `GET /api/v1/sessions/:id/status`
  - file: `apps/workflow-engine/src/routes/v1/sessions.routes.ts`
- `GET /v1/messaging/session/qr`
  - file: `apps/workflow-engine/src/routes/messaging-session.routes.ts`

### Snapshot logic that drives UI state
- File: `apps/dashboard/lib/api/messaging-session.ts`
- `resolveDashboardMessagingSession(...)` computes UI state from:
  - `getSessionStatus(...)`
  - `getSessionQr(...)`
  - `getSessionProfile(...)`
- Status mapping:
  - `connected` if profile/me/raw status imply working
  - `available` if QR exists or raw status is `SCAN_QR_CODE`
  - `unavailable` if raw status is `STOPPED`/`OFFLINE`
  - else `provisioning`

### Important failure points for “QR not showing”
1. Session exists but is still **STARTING / provisioning** upstream.
2. Engine QR endpoint returns no QR yet; dashboard snapshot stays `provisioning`.
3. `getSessionQr(...)` in `apps/dashboard/lib/api/messaging-session.ts` swallows QR fetch errors and returns `null`, which can hide useful upstream distinctions.
4. Historical production report already recorded this failure mode:
   - `docs/handoff/PRODUCTION_API_TEST_REPORT_2026-04-16.md`
   - Pairing QR retrieval on fresh bootstrap returned upstream provider failure while session was still starting.

### Practical conclusion
- The QR issue is likely **not** “frontend forgot to render QR.”
- It is more likely one of:
  - slow bootstrap / session not ready,
  - upstream QR endpoint returning empty/422 during startup,
  - or state translation in dashboard collapsing too many upstream QR failures into `null`.

---

## 6) Old GHL project patterns worth remembering

Source repo used for comparison:
- `madani-whatsapp/Whatsapp-GHL-Integration`

### Relevant files reviewed
- `backend/src/services/identity-reconciliation.service.ts`
- `backend/src/services/contact-sync.service.ts`
- `backend/src/routes/waha-webhook-fix.route.ts`
- `backend/src/routes/contacts.route.ts`

### Useful patterns from that project

#### A) Preserve unresolved LID identities, then retry reconciliation later
- The old project did **not** assume every `@lid` could be resolved immediately.
- It stored unresolved inbound identity events and retried reconciliation in the background.
- This is useful if WAHA visibility/admin/contact state changes over time.

#### B) Safe phone persistence only after validation
- `contact-sync.service.ts` only persisted a normalized phone when it could be safely derived.
- If a contact was still effectively LID-only, it kept the chat keyed by the WAHA chat id.

#### C) Webhook config drift can silently break inbound flow
- `waha-webhook-fix.route.ts` explicitly repaired sessions to include webhook events such as:
  - `message`
  - `message.any`
  - `session.status`
- This is a strong reminder to verify session webhook config whenever inbound delivery appears dead.

### Caution
- Do **not** blindly port old GHL behavior into Noxivo.
- Use it as a reference for resilience patterns, not as a source of truth over current workflow-engine architecture.

---

## 7) Current working hypotheses / next debugging steps

### Inbox functionality work should start with these checks
1. Run the core workflow-engine inbox tests listed above.
2. Verify webhook/session config in the actual WAHA session(s), especially subscribed events.
3. Re-test fresh session QR bootstrap and capture exact upstream QR/status payloads during `STARTING`.
4. Fix stale dashboard `/api/v1/agency/webhooks` path before using settings UI as a truth source.
5. If LID duplication persists, inspect whether the issue is in:
   - `resolveMessagingContactIdentity(...)`
   - `InboxService.upsertConversationIdentity(...)`
   - or incomplete upstream WAHA mapping data.

### Do not assume
- Do not assume `@lid` can always become `@c.us`.
- Do not assume missing QR means no session exists.
- Do not assume dashboard 404 means engine route is missing.

---

## 8) Useful file index

### Dashboard
- `apps/dashboard/app/dashboard/settings/settings-client.tsx`
- `apps/dashboard/app/api/settings/qr/route.ts`
- `apps/dashboard/app/api/settings/whatsapp-check/route.ts`
- `apps/dashboard/lib/api/messaging-session.ts`
- `apps/dashboard/lib/api/engine-client.ts`

### Workflow-engine
- `apps/workflow-engine/src/server.ts`
- `apps/workflow-engine/src/modules/webhooks/messaging.route.ts`
- `apps/workflow-engine/src/modules/inbox/messaging-sync.service.ts`
- `apps/workflow-engine/src/modules/inbox/inbox.service.ts`
- `apps/workflow-engine/src/modules/inbox/messaging-contact-identity.ts`
- `apps/workflow-engine/src/modules/inbox/internal-message.service.ts`
- `apps/workflow-engine/src/routes/messaging-inbox.routes.ts`
- `apps/workflow-engine/src/routes/messaging-session.routes.ts`
- `apps/workflow-engine/src/routes/v1/messages.routes.ts`
- `apps/workflow-engine/src/routes/v1/pairing.routes.ts`
- `apps/workflow-engine/src/routes/v1/spa.routes.ts`

### Tests
- `apps/workflow-engine/test/messaging-webhook-route.test.ts`
- `apps/workflow-engine/test/messaging-webhook-enterprise.test.ts`
- `apps/workflow-engine/test/messaging-inbox-sync.service.test.ts`
- `apps/workflow-engine/test/messaging-inbox-routes-pagination.test.ts`
- `apps/workflow-engine/test/internal-inbox-route.test.ts`
- `apps/workflow-engine/test/messages-route.test.ts`
- `apps/workflow-engine/test/inbox.service.test.ts`
