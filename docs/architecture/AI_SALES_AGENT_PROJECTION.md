# AI Sales Agent Projection (Phases 0-3)

## 1) Purpose and Scope

This document is the implementation blueprint for the Noxivo **AI Sales Agent** plugin. It defines:

- The exact end-to-end data flow from inbound WhatsApp message to AI reply/handoff.
- The isolated Mongoose schemas required for plugin state, persona, and data source configuration.
- API route contracts for Dashboard (3000) and Workflow Engine (4000).
- A modular, future-proof tool/module registry model that supports WordPress/GHL-style extensions without rewriting DAG core.

This document intentionally stops at architecture + projection. No application runtime code is described as already implemented.

---

## 2) Current System Constraints We Must Respect

1. **DAG runtime already supports plugin execution** via `plugin` nodes in:
   - `packages/contracts/src/workflow-editor.ts`
   - `apps/workflow-engine/src/modules/agents/dag-compiler.ts`
   - `apps/workflow-engine/src/modules/agents/dag-executor.ts`

2. **Tenant plugin enablement already exists** via:
   - `packages/database/src/models/plugin-installation.ts`
   - `apps/workflow-engine/src/modules/plugins/registry.service.ts`

3. **Human takeover / automation pause already exists** via conversation statuses + routes:
   - `assigned` / `handoff` gating in `apps/workflow-engine/src/modules/conversations/ingest.service.ts`
   - assign/unhandoff routes + service in:
     - `apps/workflow-engine/src/routes/v1/handoff.routes.ts`
     - `apps/workflow-engine/src/modules/conversations/handoff.service.ts`

4. **Dashboard Inbox already has pause/return affordances** in:
   - `apps/dashboard/components/team-inbox/chat-input-action-bar.tsx`

5. **Strict TS/Zod patterns and model conventions** are mandatory across monorepo.

---

## 3) Architecture Decision (Phase 0)

### 3.1 Decision

For v1, we implement AI Sales Agent with a dedicated DAG node type **`agentic_ai`** while still reusing the existing plugin-style registry patterns internally.

- Editor/runtime adds node type `agentic_ai` in contracts + compiler + executor.
- Internally, the `agentic_ai` executor path uses the same modular registry semantics used by plugin infrastructure (validation, tenant scoping, versioned behavior).
- DAG still emits standard MessagingProvider send operations (`messaging.sendText`) for final response.

### 3.2 Why This Is the Correct Fit Now

- Reuses existing compiler + executor patterns and plugin enablement discipline where possible.
- Keeps auditability and execution event behavior consistent.
- Minimizes migration risk while leaving room for future custom node types if required.

### 3.3 Compatibility With Future WordPress/GHL Module Vision

Inside the AI Sales Agent plugin, we introduce a **Tool Module Registry** abstraction:

- `ToolRegistry` (registration + discovery)
- `ToolExecutor` (validation + policy + execution)
- `DataSourceAdapter` (Shopify/WooCommerce/provider-specific search implementation)

This makes tool execution extensible by module hooks without changing DAG core.

---

## 4) End-to-End Data Flow

## 4.1 Automated path (normal)

1. MessagingProvider inbound message arrives and is persisted into inbox models.
2. `ConversationIngestService` checks conversation status.
   - If `assigned` or `handoff`, workflow is skipped.
3. Active workflow run starts (`workflow.start`).
4. DAG reaches node `type: "agentic_ai"`.
5. AI Sales Agent plugin:
   - Loads persona + plugin/data-source state.
   - Builds LLM input from conversation history + memory context.
   - Presents available tool(s), currently `search_store`.
   - Executes tool via ToolRegistry/ToolExecutor.
   - Produces final assistant reply text OR handoff recommendation.
6. If reply:
   - Plugin returns payload consumed by downstream `action` node.
   - `action` creates `messaging.sendText` operation.
   - `WorkflowActionService` dispatches MessagingProvider message and persists assistant message.
7. If handoff required:
   - Workflow branch routes to handoff path.
   - Conversation is put into paused human state through existing handoff mechanism.

## 4.2 Human takeover path

1. Inbox agent clicks **Pause AI & Join Chat**.
2. Dashboard calls `/assign` route.
3. Conversation status becomes human-owned (`assigned` / `handoff` semantics), active runs are cancelled.
4. Next inbound messages do not trigger automation.
5. Agent clicks **Return to AI** -> `/unhandoff`.
6. Conversation reopens to automation.

---

## 5) Isolated Database Model Projection

All new models live in `packages/database/src/models/` and are tenant-scoped. We do **not** pollute `Tenant` core document.

## 5.1 PluginStateModel (runtime policy + state)

Collection: `ai_agent_plugin_states`

Purpose:

- Tracks whether AI Sales Agent is activated for tenant/conversation scope.
- Stores operational mode required by Inbox toggle and workflow gating.

Projected schema fields:

- `agencyId: ObjectId` (index)
- `tenantId: ObjectId` (index)
- `conversationId: ObjectId | null` (index, nullable for tenant default)
- `pluginId: string` (`"ai-sales-agent"`)
- `enabled: boolean` (tenant-level activation)
- `mode: "bot_active" | "human_takeover"`
- `pausedByUserId: ObjectId | null`
- `pausedAt: Date | null`
- `resumeAt: Date | null`
- `metadata: Mixed` (bounded map)
- timestamps

Indexes:

- Unique: `{ agencyId, tenantId, pluginId, conversationId }`
- Query index: `{ tenantId, pluginId, mode }`

## 5.2 AgentPersonaModel (behavior config)

Collection: `ai_agent_personas`

Purpose:

- Stores tenant persona and LLM selection, independent of workflow definitions.

Projected fields:

- `agencyId: ObjectId` (index)
- `tenantId: ObjectId` (index)
- `pluginId: string` (`"ai-sales-agent"`)
- `agentName: string`
- `modelChoice: string` (ex: `gpt-4o`, `claude-3.5-sonnet`)
- `systemPrompt: string`
- `fallbackMessage: string`
- `temperature: number` (optional, bounded)
- `maxTokens: number` (optional, bounded)
- `active: boolean`
- timestamps

Indexes:

- Unique: `{ agencyId, tenantId, pluginId }`

## 5.3 DataSourceModel (provider + encrypted credentials)

Collection: `ai_agent_data_sources`

Purpose:

- Maintains provider config for Shopify/WooCommerce and future module adapters.

Projected fields:

- `agencyId: ObjectId` (index)
- `tenantId: ObjectId` (index)
- `pluginId: string` (`"ai-sales-agent"`)
- `providerType: "mock" | "shopify" | "woocommerce"`
- `displayName: string`
- `enabled: boolean`
- `credentialRef: ObjectId | null` (preferred reference to `TenantCredentialModel`)
- `encryptedSecret: string | null` (optional, when not using ref)
- `config: Mixed` (store URL, API version, scopes, etc.)
- `lastSyncedAt: Date | null`
- `healthStatus: "healthy" | "error" | "disabled"`
- timestamps

Indexes:

- Unique: `{ agencyId, tenantId, pluginId, providerType, displayName }`
- Query index: `{ tenantId, pluginId, enabled }`

Security notes:

- Prefer `credentialRef` to existing credential vault patterns.
- If secret-in-document is unavoidable, encrypt before persistence and never expose raw values in API responses.

---

## 6) API Contract Projection

All contracts use Zod + strict request/response envelopes.

## 6.1 Dashboard APIs (port 3000)

### `GET /api/plugins/ai-agent`

Response:

```json
{
  "pluginState": {
    "enabled": true,
    "mode": "bot_active"
  },
  "persona": {
    "agentName": "Nexus Sales Assistant",
    "modelChoice": "gpt-4o",
    "systemPrompt": "...",
    "fallbackMessage": "..."
  },
  "dataSources": [
    {
      "id": "...",
      "providerType": "shopify",
      "displayName": "Main Store",
      "enabled": true,
      "healthStatus": "healthy"
    }
  ]
}
```

### `POST /api/plugins/ai-agent`

Upserts plugin enabled/mode + persona.

Request:

```json
{
  "enabled": true,
  "mode": "bot_active",
  "persona": {
    "agentName": "Nexus Sales Assistant",
    "modelChoice": "gpt-4o",
    "systemPrompt": "...",
    "fallbackMessage": "..."
  }
}
```

### `GET /api/plugins/ai-agent/data-sources`

Returns redacted list of data sources.

### `POST /api/plugins/ai-agent/data-sources`

Creates/updates a source config.

Request:

```json
{
  "providerType": "woocommerce",
  "displayName": "Store EU",
  "enabled": true,
  "credentialRef": "...",
  "config": {
    "baseUrl": "https://example.com",
    "apiVersion": "v3"
  }
}
```

### `POST /api/team-inbox/:conversationId/ai-mode`

Explicit bot/human mode toggle that can wrap current assign/unhandoff internals.

Request:

```json
{ "mode": "human_takeover" }
```

Behavior:

- `human_takeover`: calls assign/handoff path + updates PluginState.
- `bot_active`: calls unhandoff path + updates PluginState.

## 6.2 Workflow Engine APIs (port 4000)

### `POST /api/v1/ai-sales-agent/execute-tool` (internal)

Optional engine-side internal endpoint if tool execution is extracted from plugin runtime.

Request:

```json
{
  "agencyId": "...",
  "tenantId": "...",
  "conversationId": "...",
  "toolName": "search_store",
  "args": { "query": "iphone 15" }
}
```

Response:

```json
{
  "success": true,
  "result": {
    "items": [
      { "title": "iPhone 15 128GB", "price": 999, "currency": "USD" }
    ]
  }
}
```

### Existing routes reused (no breaking contract)

- `/api/v1/ai/inbox-context` for prompt context assembly.
- `/api/v1/conversations/:conversationId/assign` and `/unhandoff` for human safety control.

---

## 7) Tool/Function Calling Registry Projection (WordPress/GHL-Style)

## 7.1 Core abstractions

### `AgentToolDefinition`

- `name: string` (ex: `search_store`)
- `description: string`
- `inputSchema: zod`
- `outputSchema: zod`
- `risk: "read" | "write"`
- `handler(context, args) => result`

### `ToolRegistry`

- `register(tool)`
- `resolve(toolName)`
- `listAvailable(context)`

### `ToolExecutor`

- Validates args against schema
- Applies policy checks (enabled plugin, mode, tenant scope)
- Emits audit events and bounded execution logs
- Enforces timeout + safe failures

### `DataSourceAdapter`

- `searchProducts(query, options)`
- implementations:
  - `MockStoreAdapter` (v1)
  - `ShopifyAdapter` (phase extension)
  - `WooCommerceAdapter` (phase extension)

## 7.2 Hook points for future custom modules

Add optional pipeline hooks:

- `beforeToolValidation`
- `beforeToolExecution`
- `afterToolExecution`
- `beforeResponseRender`

Each hook receives immutable context and returns transformed payload (filter style) or side effects (action style), mirroring WordPress extensibility semantics while staying type-safe.

## 7.3 v1 tool implementation

`search_store(query)` returns deterministic mock catalog data (iPhone 15 examples) through `MockStoreAdapter`.

---

## 8) Agentic AI Execution Behavior (v1)

1. Build context from:
   - recent conversation messages
   - memory facts (`MemoryService`)
   - persona config
2. Provide tool spec to selected model.
3. If model calls `search_store`, execute through ToolExecutor.
4. Feed tool result back to model for final natural language draft.
5. Return plugin output with:
   - `decision: "reply" | "handoff" | "noop"`
   - `replyText`
   - `toolTrace` (sanitized)
6. Downstream DAG branch:
   - `reply` -> `action sendText`
   - `handoff` -> `handoff` branch

---

## 9) Error Handling + Safety Projection

- If persona/model config missing: return `fallbackMessage` and mark execution event.
- If tool execution fails: retry once with safe message + fallback; never crash entire worker.
- If mode is `human_takeover`: short-circuit plugin execution and return `noop`.
- Never leak credentials/secrets in logs, tool traces, or dashboard payloads.

---

## 10) Phase-by-Phase Execution Plan (Exact File Projection)

## Phase 1 — Isolated Database Layer

### Create

- `packages/database/src/models/plugin-state.ts`
- `packages/database/src/models/agent-persona.ts`
- `packages/database/src/models/data-source.ts`

### Modify

- `packages/database/src/models/index.ts` (export new models)
- `packages/database/src/index.ts` (re-export new models)

### Tests (projected)

- `packages/database/test/ai-agent-models.test.ts`

## Phase 2 — Agentic AI DAG Runtime (Workflow Engine / port 4000)

### Create

- `apps/workflow-engine/src/modules/plugins/builtin/ai-sales-agent.plugin.ts`
- `apps/workflow-engine/src/modules/agents/tools/tool-registry.ts`
- `apps/workflow-engine/src/modules/agents/tools/tool-executor.ts`
- `apps/workflow-engine/src/modules/agents/tools/search-store.tool.ts`
- `apps/workflow-engine/src/modules/agents/tools/data-sources/mock-store.adapter.ts`
- `apps/workflow-engine/src/modules/agents/tools/data-sources/types.ts`

### Modify

- `packages/contracts/src/workflow-editor.ts` (add `agentic_ai` node type)
- `packages/contracts/src/workflow.ts` (add compiled input contract for `agentic_ai`)
- `apps/workflow-engine/src/modules/agents/dag-compiler.ts` (compile `agentic_ai` node input)
- `apps/workflow-engine/src/modules/plugins/registry.service.ts` (register built-in AI Sales Agent plugin)
- `apps/workflow-engine/src/modules/agents/dag-executor.ts` (add `agentic_ai` execution path + reply/handoff output handling)
- `apps/workflow-engine/src/modules/agents/agent.worker.ts` (enforce mode gating integration if needed)
- `apps/workflow-engine/src/modules/conversations/handoff.service.ts` (ensure consistent status semantics)
- `apps/workflow-engine/src/routes/v1/ai.routes.ts` (optional AI Sales Agent context/execute wiring)
- `apps/workflow-engine/src/server.ts` (route/module registration if adding new route)

### Tests (projected)

- `apps/workflow-engine/test/ai-sales-agent.plugin.test.ts`
- `apps/workflow-engine/test/dag-executor.test.ts` (extend with AI Sales Agent plugin path)
- `apps/workflow-engine/test/plugin-registry.test.ts` (enable/version checks for new plugin)

## Phase 3 — Dashboard UI + Inbox Wiring (port 3000)

### Create

- `apps/dashboard/app/dashboard/plugins/ai-agent/page.tsx`
- `apps/dashboard/app/dashboard/plugins/ai-agent/ai-agent-client.tsx`
- `apps/dashboard/app/api/plugins/ai-agent/route.ts`
- `apps/dashboard/app/api/plugins/ai-agent/data-sources/route.ts`
- `apps/dashboard/app/api/team-inbox/[conversationId]/ai-mode/route.ts`

### Modify

- `apps/dashboard/components/team-inbox/chat-input-action-bar.tsx` (high-visibility "Bot Active" vs "Human Takeover" switch)
- `apps/dashboard/app/dashboard/inbox/page.tsx` (toggle state + API wiring)
- `apps/dashboard/components/team-inbox/types.ts` (add mode metadata to summary shape)
- `apps/dashboard/lib/api/engine-client.ts` (AI agent settings/toggle client helpers)
- `apps/dashboard/app/api/team-inbox/[conversationId]/assign/route.ts` (optional shared path)
- `apps/dashboard/app/api/team-inbox/[conversationId]/unhandoff/route.ts` (optional shared path)

### Tests (projected)

- `apps/dashboard/test/ai-agent-routes.test.ts`
- `apps/dashboard/test/team-inbox-routes.test.ts` (toggle behavior)
- `apps/dashboard/test/team-inbox-crm-ui.test.tsx` (toggle UX/state)

---

## 11) Explicit Non-Goals for This Cycle

- No direct Shopify/Woo live synchronization yet (mock adapter only).
- No marketplace/external module loading runtime yet.
- No per-tenant MessagingProvider deployment changes.
- No rewrite of existing DAG contract or workflow editor node taxonomy in this phase.

---

## 12) Approval Gate

Upon approval of this projection, implementation begins in order:

1. Phase 1 data layer
2. Phase 2 engine plugin + tool execution
3. Phase 3 dashboard config/toggle wiring

No application code should be shipped before this projection is explicitly accepted.
