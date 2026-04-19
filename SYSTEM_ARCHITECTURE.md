# Noxivo SaaS System Architecture

This document serves as the absolute source of truth for the decoupled Noxivo system after "The Great Divide" (Phases 1-4).

## 1. Project Structure

```text
.
├── apps/
│   ├── dashboard/          # SaaS Platform (Next.js, Port 3000)
│   ├── dashboard-admin/    # Multi-tenant Admin UI (Vite)
│   ├── workflow-engine/    # Noxivo Engine (Fastify, Port 4000)
│   └── landing/            # Marketing Landing Page
├── packages/
│   ├── contracts/          # Shared Zod schemas & TypeScript types
│   ├── database/           # Shared Mongoose models & migrations
│   └── messaging-client/        # Type-safe client for MessagingProvider Proxy
└── docker-compose.yml      # Infrastructure (MongoDB, Redis, MessagingProvider)
```

## 2. Service Boundaries

### SaaS Platform (apps/dashboard)
- **Role**: Primary user interface, business logic, and tenant management.
- **Port**: 3000
- **Technology**: Next.js (App Router), TailwindCSS.
- **Data Responsibility**: User accounts, Agency/Tenant settings, local conversation projections.
- **Boundary Constraint**: Strictly decoupled from Engine code. Interacts via `EngineClient` using `ENGINE_API_URL` and `ENGINE_API_KEY`.

### Noxivo Engine (apps/workflow-engine)
- **Role**: Workflow automation, real-time message processing, and MessagingProvider orchestration.
- **Port**: 4000
- **Technology**: Fastify, BullMQ.
- **Data Responsibility**: Workflow definitions, execution runs, contact memories, metering.
- **Components**:
  - **DAG Executor**: Orchestrates workflow node execution.
  - **Memory Service**: Manages "Agentic Intelligence" contact facts.
  - **MessagingProvider Webhook Handler**: Ingests real-time events from WhatsApp.

## 3. Data Flow

### Inbound Message Flow (MessagingProvider -> SaaS)
1. **WhatsApp**: User sends a message.
2. **MessagingProvider**: Receives message and fires a webhook.
3. **Engine (Webhook Handler)**: Ingests payload, resolves Agency/Tenant context.
4. **Engine (DAG Executor)**: Checks for active workflows. If found, executes logic (AI prompts, CRM sync, etc.).
5. **Engine (SSE/Webhook)**: Publishes events to Redis.
6. **Dashboard (SSE Handler)**: Receives real-time update via backplane and refreshes UI.

### Outbound Message Flow (Dashboard -> Engine -> MessagingProvider)
1. **Dashboard (UI)**: Operator clicks "Send" or "Assign".
2. **Dashboard (API)**: Calls `/api/v1/messages/send` or `/assign` on the **Engine**.
3. **Engine (Internal Routes)**: Validates request, checks entitlements.
4. **Engine (MessagingProvider Proxy)**: Forwards request to the appropriate MessagingProvider cluster.

## 4. Agentic Memory Layer

The system features a persistent memory vault for contacts, used to enrich AI interactions.

- **Storage**: `contact_memories` collection in MongoDB.
- **Indexing**: Compound index on `{ agencyId, tenantId, contactId, createdAt }` for sub-millisecond retrieval.
- **Injection Logic**:
  1. Before an AI node executes, the **Engine** calls `MemoryService.getContext()`.
  2. Recent facts (preferences, history, notes) are retrieved.
  3. Facts are formatted and appended to the **System Prompt** as "Known customer facts".
  4. The LLM processes the message with this rich contextual background.

## 5. Security & Isolation

- **API Key Enforcement**: Every request from the SaaS Platform to the Engine must include an `X-API-Key`.
- **Tenant Scoping**: All queries at the database and API level are strictly filtered by `agencyId` and `tenantId`.
- **The Great Divide**: Zero direct imports of engine logic into the dashboard prevents monolithic leakage and allows independent scaling.
