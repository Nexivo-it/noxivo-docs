# noxivo SaaS Migration Implementation Plan
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Upgrade the current WhatsApp SaaS migration into a white-label, multi-tier B2B platform with agency hierarchy, shared MessagingProvider clusters, a validated plugin engine, React Flow backed DAG execution, and full usage-based billing.

**Architecture:** Keep the split between `apps/dashboard` and `apps/workflow-engine`, but replace the old per-tenant MessagingProvider assumption with shared MessagingProvider Plus clusters. Store editor JSON and compiled DAGs separately, execute only compiled DAGs, and capture billable usage through Redis counters that are flushed into MongoDB and Stripe-facing billing records.

**Tech Stack:** pnpm workspaces, Next.js App Router, Tailwind CSS 4, shadcn/ui, Fastify, Mongoose, BullMQ, ioredis, Zod, Stripe API.

**Locked Decisions:** shared MessagingProvider clusters for v1, full billing stack in v1, React Flow JSON compiled into an execution DAG, strict Zod boundaries, no `any`, no mocked production logic.

**Mandatory UI Rulebook:** all dashboard and frontend work must follow [`DESIGN_SYSTEM.md`](/Users/salmenkhelifi/Developer/messaging%20/noxivo-saas/DESIGN_SYSTEM.md).

## Baseline Adaptation From `plate-forme-leads`

This repository is the successor to [`salmenkhelifi1/plate-forme-leads`](https://github.com/salmenkhelifi1/plate-forme-leads), but it is not being migrated in place.

The source repository is used only as a baseline and reference source:

- keep as reference:
  - MessagingProvider OpenAPI
  - agency and conversation domain vocabulary
  - dashboard UX ideas for agency, inbox, and workflow screens
- do not carry forward as runtime code:
  - `apps/api` Express server
  - `apps/integrations`
  - the broad `apps/web` product surface
  - root planning/archive noise

Target mapping:

- `plate-forme-leads/apps/api` -> replaced by `apps/workflow-engine`
- `plate-forme-leads/apps/web` -> selectively reimagined into `apps/dashboard`
- `plate-forme-leads/packages/database` -> rebuilt around agency tenancy, MessagingProvider clusters, workflow runs, and billing
- `plate-forme-leads/packages/shared` -> replaced by explicit contracts and focused utilities

Reference audit:

- [`SOURCE_REPO_AUDIT.md`](/Users/salmenkhelifi/Developer/messaging%20/noxivo-saas/SOURCE_REPO_AUDIT.md)

---

## Summary

This replaces the earlier plan in four important ways:

1. The tenancy model becomes `Agency -> Tenant`, with white-label defaults at the agency level and tenant overrides merged at runtime.
2. MessagingProvider moves from isolated per-tenant instances to capacity-managed shared clusters, with routing based on MessagingProvider session metadata and cluster registry records.
3. The workflow system is no longer a simple linear automation runner; it becomes a compiler plus executor model:
   - editor source: React Flow JSON
   - compiled source: validated DAG with topological order, branch rules, and typed node contracts
4. Billing is no longer “Stripe-ready metering later”; it includes usage capture, aggregation, Stripe customer/subscription state, meter event sync, entitlement enforcement, and delinquency guards.

The draft you pasted had the right direction, but it was incomplete in five places that are now fixed in this replacement plan:

- `PluginManifestSchema` used `z.any`, which violates the strict type-safety rule.
- The sample DAG executor was linear traversal, not DAG execution.
- Shared MessagingProvider clustering was described in recommendations but not modeled in code.
- Usage metering and billing entities were missing from the actual task list.
- White-labeling was scoped only to tenant fields, but agency-level defaults are required for reseller mode.

---

## UI Design System Requirements

All UI implementation in this project must follow `DESIGN_SYSTEM.md`.

That requirement is part of the architecture, not a visual afterthought.

### Required UI Foundations

- semantic color tokens instead of raw hex values in components
- a fixed typography scale with explicit heading, body, and label sizing
- a 4px spacing system and 12-column layout grid
- one icon system only: `lucide-react`
- a shared motion system with fixed durations and easing
- explicit component states:
  - default
  - hover
  - active
  - disabled
  - focus
  - loading when relevant
  - empty state when relevant

### UI Implementation Rule

When Task 7 and later dashboard/frontend tasks are implemented, they must:

- establish semantic design tokens in the frontend theme layer first
- apply those tokens through Tailwind and component variants
- avoid raw color literals in dashboard component implementations
- align shadcn/ui customization to the design system
- ship all touched UI with responsive layout behavior and defined interaction states

---

## Important Interfaces

```ts
// packages/contracts/src/branding.ts
export const WhiteLabelConfigSchema = z.object({
  customDomain: z.string().min(1).nullable().default(null),
  logoUrl: z.string().url().nullable().default(null),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().default(null),
  supportEmail: z.string().email().nullable().default(null),
  hidePlatformBranding: z.boolean().default(false)
}).strict();
```

```ts
// packages/contracts/src/plugin.ts
export const PluginManifestSchema = z.object({
  id: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  displayName: z.string().min(1),
  configSchema: z.record(z.string(), z.unknown()),
  actionSchema: z.record(z.string(), z.unknown()),
  category: z.enum(['crm', 'booking', 'payments', 'messaging', 'custom'])
}).strict();
```

```ts
// packages/contracts/src/workflow.ts
export const CompiledDagNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['trigger', 'condition', 'action', 'plugin', 'delay', 'handoff']),
  next: z.array(z.string()),
  input: z.record(z.string(), z.unknown()),
  onTrue: z.string().nullable().optional(),
  onFalse: z.string().nullable().optional()
}).strict();
```

```ts
// packages/contracts/src/metering.ts
export const UsageMeterEventSchema = z.object({
  agencyId: z.string().min(1),
  tenantId: z.string().min(1),
  metric: z.enum([
    'messages.inbound',
    'messages.outbound',
    'ai.tokens.input',
    'ai.tokens.output',
    'plugins.executions',
    'messaging.sessions.active_hours',
    'media.downloads'
  ]),
  quantity: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
  idempotencyKey: z.string().min(1)
}).strict();
```

---

## Implementation Changes

### Task 1: Agency hierarchy, tenant overrides, and billing ownership

**Files**

- Create: `packages/database/src/models/agency.ts`
- Modify: `packages/database/src/models/tenant.ts`
- Create: `packages/database/src/models/stripe-customer.ts`
- Create: `apps/workflow-engine/test/agency-tenant.model.test.ts`

**RED**

- Write `apps/workflow-engine/test/agency-tenant.model.test.ts` to assert:
  - `TenantModel` requires `agencyId`
  - `AgencyModel` requires `plan`, `billingOwnerUserId`, and `whiteLabelDefaults`
  - tenant `whiteLabelOverrides` validates and does not replace agency defaults directly
  - `customDomain` is unique across agencies and tenants

**GREEN**

- Add `AgencyModel` with fields:
  - `name`, `slug`, `plan`, `billingStripeCustomerId`, `billingStripeSubscriptionId`, `billingOwnerUserId`
  - `whiteLabelDefaults`
  - `usageLimits`
  - `status`
- Modify `TenantModel` to include:
  - `agencyId`
  - `whiteLabelOverrides`
  - `effectiveBrandingCache`
  - `billingMode` with values `agency_pays` or `tenant_pays`
- Add `StripeCustomerModel` to map agency billing state, subscription item ids, and delinquency flags

**VERIFY**

- Run: `pnpm --filter @noxivo/workflow-engine test -- test/agency-tenant.model.test.ts`
- Expected: PASS

**COMMIT**

- Run: `git add packages/database/src/models apps/workflow-engine/test/agency-tenant.model.test.ts && git commit -m "feat: add agency hierarchy and white-label billing ownership"`

### Task 2: Shared MessagingProvider cluster registry and session allocator

**Files**

- Create: `packages/database/src/models/messaging-cluster.ts`
- Create: `packages/database/src/models/messaging-session-binding.ts`
- Create: `packages/messaging-client/src/cluster-allocator.ts`
- Modify: `packages/messaging-client/src/session-config.ts`
- Create: `apps/workflow-engine/test/messaging-cluster-allocation.test.ts`

**RED**

- Write `apps/workflow-engine/test/messaging-cluster-allocation.test.ts` to assert:
  - allocator selects an `active` cluster matching agency region
  - cluster hard-cap and soft-cap rules are enforced
  - MessagingProvider session payload metadata includes `agencyId`, `tenantId`, `clusterId`, `sessionBindingId`
  - webhook path is cluster-aware and idempotency-safe

**GREEN**

- Add `MessagingClusterModel` with fields:
  - `name`, `region`, `baseUrl`, `dashboardUrl`, `swaggerUrl`, `capacity`, `activeSessionCount`, `status`, `secretRefs`
- Add `MessagingSessionBindingModel` with fields:
  - `agencyId`, `tenantId`, `clusterId`, `sessionName`, `messagingSessionName`, `routingMetadata`, `status`
- Replace old per-tenant MessagingProvider payload builder with cluster-aware builder that writes MessagingProvider `metadata` for routing
- Use a single cluster-level webhook HMAC secret in v1, but keep secret references per cluster for rotation support

**VERIFY**

- Run: `pnpm --filter @noxivo/workflow-engine test -- test/messaging-cluster-allocation.test.ts`
- Expected: PASS

**COMMIT**

- Run: `git add packages/database/src/models packages/messaging-client/src apps/workflow-engine/test/messaging-cluster-allocation.test.ts && git commit -m "feat: add shared MessagingProvider cluster registry and allocator"`

### Task 3: Dynamic plugin registry with strict manifests and tenant enablement

**Files**

- Create: `packages/contracts/src/plugin.ts`
- Create: `packages/database/src/models/plugin-installation.ts`
- Create: `apps/workflow-engine/src/modules/plugins/registry.service.ts`
- Create: `apps/workflow-engine/src/modules/plugins/builtin/calendar-booking.plugin.ts`
- Create: `apps/workflow-engine/test/plugin-registry.test.ts`

**RED**

- Write `apps/workflow-engine/test/plugin-registry.test.ts` to assert:
  - duplicate plugin ids are rejected
  - manifest validation rejects unknown categories and invalid semantic versions
  - tenant configuration is validated against the plugin config schema before execution
  - disabled plugins cannot execute for a tenant

**GREEN**

- Define `PluginManifestSchema` and `PluginExecutionResultSchema` without `any`
- Add `PluginInstallationModel` keyed by `agencyId`, `tenantId`, `pluginId`
- Build `PluginRegistry` with methods:
  - `register(plugin)`
  - `resolve(pluginId)`
  - `validateConfig(pluginId, config)`
  - `execute(pluginId, payload, config)`
- Register a real built-in `calendar-booking` plugin to prove the contract shape

**VERIFY**

- Run: `pnpm --filter @noxivo/workflow-engine test -- test/plugin-registry.test.ts`
- Expected: PASS

**COMMIT**

- Run: `git add packages/contracts/src/plugin.ts packages/database/src/models/plugin-installation.ts apps/workflow-engine/src/modules/plugins apps/workflow-engine/test/plugin-registry.test.ts && git commit -m "feat: implement strict plugin registry and tenant enablement"`

### Task 4: React Flow source model and DAG compiler

**Files**

- Create: `packages/contracts/src/workflow-editor.ts`
- Create: `packages/contracts/src/workflow.ts`
- Create: `packages/database/src/models/workflow-definition.ts`
- Create: `apps/workflow-engine/src/modules/agents/dag-compiler.ts`
- Create: `apps/workflow-engine/test/dag-compiler.test.ts`

**RED**

- Write `apps/workflow-engine/test/dag-compiler.test.ts` to assert:
  - React Flow nodes and edges compile into a normalized DAG
  - cycles are rejected
  - disconnected action nodes are rejected
  - missing target nodes are rejected
  - topological order is stable and deterministic

**GREEN**

- Store both:
  - `editorGraph` as React Flow source JSON
  - `compiledDag` as execution model
- Add `workflow-definition.ts` fields:
  - `agencyId`, `tenantId`, `key`, `version`, `channel`, `editorGraph`, `compiledDag`, `isActive`
- Build compiler rules:
  - one trigger node only
  - branch nodes use `onTrue` and `onFalse`
  - delay nodes compile into BullMQ resumption steps
  - plugin nodes must reference enabled plugins only

**VERIFY**

- Run: `pnpm --filter @noxivo/workflow-engine test -- test/dag-compiler.test.ts`
- Expected: PASS

**COMMIT**

- Run: `git add packages/contracts/src/workflow-editor.ts packages/contracts/src/workflow.ts packages/database/src/models/workflow-definition.ts apps/workflow-engine/src/modules/agents/dag-compiler.ts apps/workflow-engine/test/dag-compiler.test.ts && git commit -m "feat: add React Flow compiler for validated DAG workflows"`

### Task 5: DAG executor, branch evaluation, and resumable runtime

**Files**

- Create: `apps/workflow-engine/src/modules/agents/dag-executor.ts`
- Create: `apps/workflow-engine/src/modules/agents/runtime-context.ts`
- Modify: `apps/workflow-engine/src/modules/agents/agent.worker.ts`
- Create: `apps/workflow-engine/test/dag-executor.test.ts`

**RED**

- Write `apps/workflow-engine/test/dag-executor.test.ts` to assert:
  - condition nodes choose the correct branch
  - plugin nodes call `PluginRegistry.execute`
  - action nodes emit concrete MessagingProvider send operations
  - delay nodes enqueue a BullMQ continuation job
  - failed nodes produce deterministic execution records and stop descendant execution

**GREEN**

- Replace the draft linear traversal with:
  - compiled node lookup map
  - execution guard against repeated nodes
  - explicit branch resolution
  - resumable execution state keyed by `conversationId` and `workflowRunId`
- Store execution events in MongoDB with:
  - `workflowRunId`, `nodeId`, `startedAt`, `finishedAt`, `status`, `output`
- Keep runtime context immutable between nodes except for explicit `contextPatch`

**VERIFY**

- Run: `pnpm --filter @noxivo/workflow-engine test -- test/dag-executor.test.ts`
- Expected: PASS

**COMMIT**

- Run: `git add apps/workflow-engine/src/modules/agents apps/workflow-engine/test/dag-executor.test.ts && git commit -m "feat: add resumable DAG executor for workflow runtime"`

### Task 6: Usage metering pipeline and Stripe billing sync

**Files**

- Create: `packages/contracts/src/metering.ts`
- Create: `packages/database/src/models/usage-meter-event.ts`
- Create: `packages/database/src/models/billing-meter-window.ts`
- Create: `apps/workflow-engine/src/modules/metering/counter.service.ts`
- Create: `apps/workflow-engine/src/modules/metering/aggregation.worker.ts`
- Create: `apps/workflow-engine/src/modules/billing/stripe-sync.worker.ts`
- Create: `apps/workflow-engine/test/metering-aggregation.test.ts`

**RED**

- Write `apps/workflow-engine/test/metering-aggregation.test.ts` to assert:
  - multiple Redis increments roll up into one persisted billing window
  - `idempotencyKey` prevents duplicate event insertion
  - Stripe sync sends one meter event per `(agencyId, metric, windowStart)`
  - delinquent agencies fail entitlement checks for premium features but not webhook ingestion

**GREEN**

- Capture usage at these points:
  - inbound MessagingProvider message ingest
  - outbound MessagingProvider send
  - plugin execution
  - AI token usage
  - session active-hour reconciliation
  - media downloads
- Use Redis keys:
  - `meter:{agencyId}:{metric}:{yyyyMMddHH}`
- Flush hourly via BullMQ aggregation worker into MongoDB `billingMeterWindow`
- Sync aggregated usage to Stripe:
  - customer lookup from `AgencyModel`
  - meter event posting from `stripe-sync.worker.ts`
  - store `lastSyncedAt`, `stripeMeterEventId`, `syncStatus`
- Add entitlement middleware for premium features based on agency plan and billing state

**VERIFY**

- Run: `pnpm --filter @noxivo/workflow-engine test -- test/metering-aggregation.test.ts`
- Expected: PASS

**COMMIT**

- Run: `git add packages/contracts/src/metering.ts packages/database/src/models apps/workflow-engine/src/modules/metering apps/workflow-engine/src/modules/billing apps/workflow-engine/test/metering-aggregation.test.ts && git commit -m "feat: add usage metering and Stripe billing sync"`

### Task 7: White-label dashboard shell and agency-aware proxying

**Files**

- Modify: `apps/dashboard/app/(protected)/tenants/[tenantId]/instances/[instanceId]/page.tsx`
- Create: `apps/dashboard/app/[agencySlug]/layout.tsx`
- Modify: `apps/dashboard/app/api/messaging-proxy/[instanceId]/[...path]/route.ts`
- Create: `apps/dashboard/test/white-label-shell.test.ts`

**RED**

- Write `apps/dashboard/test/white-label-shell.test.ts` to assert:
  - agency branding defaults are applied to the layout
  - tenant overrides win over agency defaults for supported fields
  - MessagingProvider proxy rejects cross-agency and cross-tenant access
  - proxied dashboard and swagger requests inject server-side auth only

**GREEN**

- Add `app/[agencySlug]/layout.tsx` to derive effective branding from agency defaults plus tenant overrides
- Keep MessagingProvider proxy server-side only; do not expose MessagingProvider basic auth to browser code
- Add branded navigation, favicon/logo hooks, support email links, and hidden platform chrome when `hidePlatformBranding = true`
- Use agency slug routing as the primary white-label entry path in v1; custom domains map to the same route after reverse-proxy configuration

**VERIFY**

- Run: `pnpm --filter @noxivo/dashboard test -- test/white-label-shell.test.ts`
- Expected: PASS

**COMMIT**

- Run: `git add apps/dashboard/app apps/dashboard/test/white-label-shell.test.ts && git commit -m "feat: add agency white-label dashboard shell"`

### Task 8: Webhook routing, billing enforcement, and omnichannel end-to-end updates

**Files**

- Modify: `apps/workflow-engine/src/modules/webhooks/messaging.route.ts`
- Modify: `apps/workflow-engine/src/modules/conversations/ingest.service.ts`
- Create: `apps/workflow-engine/src/modules/access/entitlement.service.ts`
- Create: `apps/workflow-engine/test/messaging-webhook-enterprise.test.ts`

**RED**

- Write `apps/workflow-engine/test/messaging-webhook-enterprise.test.ts` to assert:
  - webhook resolution uses `agencyId`, `tenantId`, `clusterId`, `sessionBindingId` from MessagingProvider metadata
  - webhook requests with mismatched metadata are rejected
  - successful inbound processing increments usage counters
  - premium plugin or AI actions are denied when the agency subscription is delinquent
  - conversation ingest still persists inbound messages even when outbound automation is blocked

**GREEN**

- Update webhook route resolution precedence:
  1. `instanceId` path
  2. `sessionBindingId` from metadata
  3. `tenantId` and `agencyId` from metadata
  4. stored `messagingSessionBinding`
- Add billing-aware action gating:
  - inbound persistence always allowed
  - outbound premium automations blocked by entitlement service
- Increment usage counters in the same processing path that persists messages and schedules workflow runs

**VERIFY**

- Run: `pnpm --filter @noxivo/workflow-engine test -- test/messaging-webhook-enterprise.test.ts`
- Expected: PASS

**COMMIT**

- Run: `git add apps/workflow-engine/src/modules/webhooks/messaging.route.ts apps/workflow-engine/src/modules/conversations/ingest.service.ts apps/workflow-engine/src/modules/access apps/workflow-engine/test/messaging-webhook-enterprise.test.ts && git commit -m "feat: enforce agency-aware routing and billing entitlements"`

---

## Test Plan

- Model validation:
  - `agency-tenant.model.test.ts`
  - custom domain uniqueness
  - billing ownership rules
- MessagingProvider infrastructure:
  - cluster allocator chooses valid cluster by region and capacity
  - session metadata is complete and stable
- Plugin engine:
  - duplicate registration rejection
  - strict config validation
  - tenant enable/disable behavior
- Workflow compiler and runtime:
  - cycle detection
  - disconnected node rejection
  - branch correctness
  - resumable delay execution
- Billing:
  - Redis counter aggregation
  - Stripe sync idempotency
  - delinquency entitlement checks
- White-label:
  - agency branding merge rules
  - secure server-side MessagingProvider proxy
- End-to-end:
  - inbound webhook -> persist -> meter -> workflow -> outbound MessagingProvider action
  - inbound webhook on delinquent agency -> persist + meter, but premium automation blocked

---

## Assumptions

- Agency is the primary commercial entity; tenants are operational subspaces under an agency.
- Shared MessagingProvider clusters are mandatory in v1. Dedicated MessagingProvider is a later enterprise override, not the default architecture.
- React Flow editor state is not executable. Only compiled DAGs can run.
- Plugin code is code-registered at startup in v1. Tenant-level plugin installation controls configuration and enablement, not arbitrary code upload.
- Stripe is the billing system of record for subscriptions and meter events.
- MongoDB remains the source of truth for tenancy, workflows, message history, plugin installations, and billing windows.
- Redis is the hot-path meter counter and queue coordination layer, not a long-term ledger.

---

## Enterprise PaaP Upgrades: Concurrency, Suspension & Memory

### Objectives

Implement distributed locking to prevent WhatsApp webhook race conditions, a Suspend/Resume Task Token architecture for asynchronous DAG nodes, and a standardized LLM Context Window for the AI runtime.

### Tech Stack

- Backend: TypeScript, Fastify, Mongoose, BullMQ, Redis (ioredis), Redlock for distributed mutual exclusion.
- Testing: Vitest.

### Operational Constraints

- Zero placeholders. No `TODO`, `console.log` debugging, or mocked logic in production files.
- Strict TDD: RED-GREEN-REFACTOR.
- Atomic operations: locking mechanisms include strict TTLs and safe release patterns.

### Task 9: Implement Redis Distributed Locking for DAG Execution

**Files**

- Create: `apps/workflow-engine/src/modules/concurrency/lock.service.ts`
- Create: `apps/workflow-engine/test/lock.service.test.ts`

**RED**

- Write `apps/workflow-engine/test/lock.service.test.ts` to assert:
  - a conversation-scoped lock can be acquired once
  - concurrent acquisition on the same resource is rejected
  - release is ownership-safe and the lock can be reacquired

**GREEN**

- Add `LockService` with:
  - `acquire(resourceId, ttlMs)`
  - `release(resourceId, token)`
- Use Redis `SET key value NX PX ttl`
- Use a Lua compare-and-delete release script

**VERIFY**

- Run: `pnpm --filter @noxivo/workflow-engine test -- test/lock.service.test.ts`
- Expected: PASS

**COMMIT**

- Run: `git add apps/workflow-engine/src/modules/concurrency apps/workflow-engine/test/lock.service.test.ts && git commit -m "feat: implement redis distributed locking for concurrent webhook safety"`

### Task 10: Implement DAG Suspend/Resume (Task Token Pattern)

**Files**

- Create: `packages/database/src/models/workflow-run.ts`
- Create: `apps/workflow-engine/src/modules/agents/suspension.service.ts`
- Create: `apps/workflow-engine/test/suspension.service.test.ts`

**RED**

- Write `apps/workflow-engine/test/suspension.service.test.ts` to assert:
  - suspension generates a task token
  - the run is marked `suspended` with the expected event
  - resume validates the token and event type before waking the run

**GREEN**

- Add `WorkflowRunModel` with:
  - `tenantId`, `workflowId`, `conversationId`, `status`, `currentNodeId`, `state`, `suspension`
- Add `SuspensionService` with:
  - `suspend(runId, expectedEvent)`
  - `resume(token, eventType, payload)`

**VERIFY**

- Run: `pnpm --filter @noxivo/workflow-engine test -- test/suspension.service.test.ts`
- Expected: PASS

**COMMIT**

- Run: `git add packages/database/src/models/workflow-run.ts apps/workflow-engine/src/modules/agents/suspension.service.ts apps/workflow-engine/test/suspension.service.test.ts && git commit -m "feat: implement task token architecture for async DAG suspension"`

### Task 11: Standardize LLM Prompt Context Resolution

**Files**

- Create: `apps/workflow-engine/src/modules/agents/llm-context.service.ts`
- Create: `apps/workflow-engine/test/llm-context.service.test.ts`

**RED**

- Write `apps/workflow-engine/test/llm-context.service.test.ts` to assert:
  - recent messages are converted into a strict prompt array
  - tenant business context and workflow state are embedded in the system prompt
  - inbound history maps to `user` and outbound history maps to `assistant`

**GREEN**

- Add `buildLlmContext(input, fetchHistory)` that:
  - fetches recent messages
  - produces a deterministic system message
  - appends role-mapped message history

**VERIFY**

- Run: `pnpm --filter @noxivo/workflow-engine test -- test/llm-context.service.test.ts`
- Expected: PASS

**COMMIT**

- Run: `git add apps/workflow-engine/src/modules/agents/llm-context.service.ts apps/workflow-engine/test/llm-context.service.test.ts && git commit -m "feat: implement standardized LLM context window builder"`

### Task 12: Team Inbox foundation and authenticated dashboard access

**Files**

- Create: `packages/contracts/src/inbox.ts`
- Create: `packages/contracts/src/auth.ts`
- Create: `packages/database/src/models/conversation.ts`
- Create: `packages/database/src/models/message.ts`
- Create: `packages/database/src/models/user.ts`
- Create: `packages/database/src/models/auth-session.ts`
- Create: `apps/workflow-engine/src/modules/inbox/inbox.service.ts`
- Create: `apps/dashboard/app/api/team-inbox/route.ts`
- Create: `apps/dashboard/app/api/auth/*`
- Modify: `apps/dashboard/app/auth/*`
- Modify: `apps/dashboard/app/dashboard/*`

**RED**

- Write dashboard and database tests to assert:
  - conversations/messages persist with agency + tenant scoping
  - signup creates agency owner, initial tenant, and session cookie
  - login and logout issue and invalidate DB-backed sessions
  - dashboard shell and overview data resolve from authenticated context instead of mocks
  - `/api/team-inbox` rejects unauthenticated access and derives scope from the session instead of query/header shortcuts

**GREEN**

- Add Team Inbox contracts and persistence primitives:
  - `ConversationModel`
  - `MessageModel`
- Add dashboard auth/session primitives:
  - `UserModel`
  - `AuthSessionModel`
  - opaque cookie-backed session issuance and validation
- Create authenticated dashboard routes and reads:
  - `POST /api/auth/signup`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/session`
  - `GET /api/team-inbox`
- Replace mock dashboard shell, agency page, and overview reads with DB-backed authenticated queries
- Protect `/dashboard` and tenant-scoped routes with authenticated session checks

**VERIFY**

- Run: `pnpm --filter @noxivo/dashboard test`
- Run: `pnpm --filter @noxivo/dashboard lint`
- Run: `pnpm --filter @noxivo/dashboard build`
- Run: `pnpm test`
- Run: `pnpm build`
- Run: `pnpm lint`
- Manual QA:
  - signup returns a real `Set-Cookie` session header
  - `/api/auth/session` resolves the authenticated actor from that cookie
  - `/api/team-inbox` returns the authenticated tenant scope
  - `/auth/login` redirects to `/dashboard` when the session cookie is valid
  - logout invalidates the session and subsequent `/api/auth/session` requests return `401`

**FOLLOW-UP (out of scope for Task 12 completion)**

- assignment actions
- reply/send flow
- realtime updates
- contact enrichment
- AI auto-reply integration

**COMMIT**

- Run: `git add packages/contracts/src packages/database/src/models apps/workflow-engine/src/modules/inbox apps/dashboard/app apps/dashboard/lib apps/dashboard/components apps/dashboard/test && git commit -m "feat: add authenticated dashboard and team inbox foundation"`

### Task 12A: Team Inbox remediation - internal operator send

**Goal**

- Start Task 12A from the now-verified green baseline by moving operator reply sends out of the dashboard route and into a workflow-engine-owned internal send path.

**Files**

- Create: `packages/contracts/src/internal-inbox.ts`
- Create: `apps/workflow-engine/src/lib/mongodb.ts`
- Create: `apps/workflow-engine/src/modules/inbox/internal-message.service.ts`
- Create: `apps/workflow-engine/test/internal-inbox-route.test.ts`
- Modify: `apps/workflow-engine/src/server.ts`
- Modify: `apps/dashboard/app/api/team-inbox/[conversationId]/messages/route.ts`
- Modify: `apps/dashboard/test/team-inbox-routes.test.ts`

**RED**

- Write workflow-engine and dashboard tests to assert:
  - missing internal PSK is rejected
  - missing `Idempotency-Key` is rejected
  - workflow-engine persists a single outbound message for duplicate keys
  - dashboard send-message delegates to workflow-engine instead of writing `MessageModel` rows locally

**GREEN**

- Add a workflow-engine internal send contract and route for text-only operator sends
- Require internal PSK auth and `Idempotency-Key`
- Reserve each `(conversationId, idempotencyKey)` send atomically before calling MessagingProvider so concurrent duplicates cannot double-send
- Resolve the active MessagingProvider session binding and cluster, call MessagingProvider `/api/sendText`, then persist the outbound assistant message through `InboxService`
- Keep duplicate requests idempotent by returning the first persisted outbound message
- Keep dashboard SSE publication in place, but only after the delegated workflow-engine send succeeds

**VERIFY**

- Run: `pnpm --filter @noxivo/workflow-engine test -- test/internal-inbox-route.test.ts`
- Run: `pnpm --filter @noxivo/dashboard test -- test/team-inbox-routes.test.ts`
- Run: `pnpm test`
- Run: `pnpm build`
- Run: `pnpm lint`

**FOLLOW-UP (completed in Task 12B)**

- human handoff state and workflow interruption
- delivery/media model expansion
- Redis-backed SSE fan-out

### Task 18: Engine Extraction & White-Labeling (Standalone Node)

**Goal**

- Decouple the workflow-engine into a standalone, headless service capable of independent deployment and white-labeled integration.

**Delivered**

- Clean `/api/v1/` REST interface for external messaging and chat management.
- Static `X-API-Key` authentication middleware (`api-auth.plugin.ts`) for all public engine routes.
- Swagger/OpenAPI documentation portal at `/docs`.
- Embedded mini-dashboard at `/admin/` for node health and connectivity diagnostics.
- Standalone `docker-compose.engine.yml` orchestration for backend-only stacks.
- Security hardening for multi-agency switching and tenant-scoped workflow management.

**VERIFY**

- Run: `pnpm --filter @noxivo/workflow-engine test`
- Run: `docker compose -f docker-compose.engine.yml up -d`
- Expected: All services healthy, API accessible via key.

### Task 19: Multi-Instance Engine Scaling & Load Balancing

**Goal**

- Transition the engine from a single-node setup to a horizontally scalable cluster with session affinity and global state synchronization.

**Files**

- Create: `apps/workflow-engine/src/modules/scaling/cluster-manager.ts`
- Create: `apps/workflow-engine/src/modules/scaling/session-affinity.ts`
- Modify: `docker-compose.engine.yml` (scale policy)

**Plan**

- **Global Session Registry**: Use Redis to track which engine instance owns which MessagingProvider session.
- **Webhook Affinity**: Implement logic to route inbound MessagingProvider webhooks to the specific engine instance holding the socket/polling connection.
- **Shared Job Queue**: Ensure BullMQ workers are distributed across instances without duplicate execution.
- **Health Check Expansion**: Update `/health` to report instance ID and cluster membership status.
- **Dynamic Port Allocation**: Support dynamic port binding for multiple engine replicas in the same network.

**VERIFY**

- Spin up 3 replicas of `workflow-engine`.
- Assert message processing is distributed.
- Assert BullMQ jobs are handled by available workers.
- Assert WebSocket/SSE updates propagate globally via Redis backplane.
