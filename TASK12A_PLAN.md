# Noxivo Task 12A Plan — Inbox Remediation and Stabilization

## Summary

The next move is not a new broad feature track. It is a **Task 12 remediation milestone** that fixes the gap between the saved docs and the actual code.

Current repo reality:
- `pnpm build` passes
- `pnpm lint` passes
- `pnpm test` does **not** pass from repo root
- Team Inbox exists, but three architectural gaps remain:
  - dashboard reply send still persists locally instead of going through a secure workflow-engine internal send path
  - SSE fan-out is still in-memory only
  - human handoff is not a first-class cancellation path for active bot runs
- Media support is still shallow and not modeled as a real inbox delivery primitive

Chosen defaults:
- **Block first on restoring root `pnpm test`**
- remediation includes **full-duplex media scope**
- this becomes the official next milestone after Task 12, not an ad hoc patch

## Implementation Changes

### 1. Stabilize the repo before new behavior

Start by restoring a truthful baseline:
- fix the current workflow-engine test failures before adding new remediation code
- treat these as P0 blockers because the saved handoff currently overstates repo health
- first concrete fixes:
  - repair workflow-engine test/module resolution around `@noxivo/database/models`
  - fix or harden MongoMemoryServer startup behavior in workflow-engine tests so root `pnpm test` is deterministic again
- update `TODO.md` and `SESSION_HANDOFF.md` after stabilization so they reflect actual quality-gate status

### 2. Add hard human handoff as a workflow interruption protocol

Introduce a real handoff service in workflow-engine:
- add `apps/workflow-engine/src/modules/conversations/handoff.service.ts`
- when a human claims or escalates a conversation, transition the conversation to `handoff`
- cancel all active or suspended workflow runs tied to that conversation
- prevent new bot-triggered runs from starting while the conversation remains in handoff
- integrate this with assignment behavior so “human owns thread” and “bot must stop” are one consistent state transition

This should operate against the existing workflow run persistence, not create a second parallel runtime model.

### 3. Replace dashboard-local message send with a secure internal send path

Move operator send execution out of the dashboard route:
- add a typed internal contract in `packages/contracts/src/internal-inbox.ts`
- add workflow-engine route:
  - `POST /v1/internal/inbox/conversations/:conversationId/messages`
- secure it with an internal PSK header
- require `Idempotency-Key` on each request
- dashboard message route becomes:
  - authenticate operator
  - authorize agency/tenant scope
  - call workflow-engine internal inbox send route
  - return the persisted outbound message result

The workflow-engine send path owns:
- conversation lookup
- tenant/cluster/session binding resolution
- MessagingProvider send execution
- outbound message persistence
- provider id capture
- duplicate request suppression via idempotency key

### 4. Upgrade inbox message contracts for real delivery and full media support

Extend inbox and internal contracts so outbound and inbound messages are first-class:
- add structured outbound delivery states:
  - `queued`
  - `sent`
  - `delivered`
  - `failed`
- persist provider identifiers and delivery metadata
- support full-duplex media fields:
  - media URL
  - media type
  - file name
  - caption/text where applicable
- keep text-only and media-only sends valid, but reject empty payloads
- align dashboard and workflow-engine on one shared message shape

This replaces the current “assistant content only” assumption in the dashboard send route.

### 5. Replace in-memory SSE fan-out with a Redis Pub/Sub backplane

Keep SSE transport, but make it horizontally safe:
- add a dashboard Redis backplane service for tenant-scoped publish/subscribe
- local SSE connections stay in-process, but event distribution moves through Redis Pub/Sub
- tenant channel fan-out must support multiple dashboard instances without missing events
- keep event names explicit and stable:
  - `conversation.updated`
  - `message.created`
  - `message.delivery_updated`
  - `assignment.updated`
- publish only after persistence succeeds

Do not use `console.error` in production code; use the existing server logging pattern or explicit controlled failure handling.

### 6. Reconcile Team Inbox state model with bot runtime ownership

Task 12A must close the operator/bot race conditions:
- assignment to a human should trigger the handoff protocol
- inbound user messages during handoff should persist normally
- AI suggestion can remain available if desired, but automated workflow execution must not resume until handoff is explicitly cleared
- if a conversation exits handoff later, workflow restart should happen only through an explicit state transition, not implicitly

### 7. Normalize project docs after the remediation lands

After implementation:
- update `PLAN.md` to formalize this as **Task 12A** or equivalent remediation follow-up
- update `TODO.md` and `SESSION_HANDOFF.md` to remove the current false claim that post-plan completion is finished
- record that Task 12 foundation exists, but Task 12A is what makes inbox production-safe

## Important Interface Changes

- Add `packages/contracts/src/internal-inbox.ts` for internal operator-send payloads
- Extend `packages/contracts/src/inbox.ts` with:
  - delivery status enum
  - media fields
  - richer event payloads for SSE
- Add workflow-engine internal route:
  - `POST /v1/internal/inbox/conversations/:conversationId/messages`
- Add workflow-engine handoff service used by assignment/escalation flows
- Add dashboard Redis SSE backplane service used by `GET /api/team-inbox/events`

## Test Plan

### Quality-gate recovery

- root `pnpm test` must pass before remediation is considered started
- preserve green `pnpm build` and `pnpm lint`

### New remediation coverage

- handoff tests:
  - assignment to human cancels active workflow runs
  - conversation state changes to `handoff`
  - new bot execution is blocked while in handoff
- internal send route tests:
  - missing PSK rejected
  - missing idempotency key rejected
  - duplicate idempotency key acknowledged without duplicate send
  - media payloads accepted when valid
- inbox service tests:
  - outbound send persists provider metadata and delivery state
  - inbound and outbound media messages are stored with correct fields
- SSE tests:
  - Redis backplane publishes tenant-scoped events to local clients
  - events are not broadcast cross-tenant
- acceptance scenarios:
  - human claims a conversation while a bot run exists -> bot stops, conversation enters handoff
  - operator sends text reply -> workflow-engine sends through MessagingProvider and persists outbound message
  - operator sends media reply -> message persists with media metadata and emits live update
  - two identical internal send attempts with same idempotency key -> only one outbound action is executed
  - multiple dashboard instances subscribed to the same tenant still receive the same event stream through Redis Pub/Sub

## Assumptions

- The current Task 12 implementation is a partial foundation, not a production-complete inbox.
- Existing suspension and workflow-run persistence should be reused, not duplicated.
- SSE remains the v1 realtime transport; only the backplane changes.
- Media support in this milestone is real operator send/receive support, not just contract scaffolding.
- Root `pnpm test` being red is a blocker and must be fixed before new remediation work is counted as complete.
