# Finalized Decoupled Architecture (Microservices)

## Overview
Noxivo has successfully completed "The Great Divide," transitioning to a full Microservices architecture. The project is split into three primary operational nodes:

1.  **Noxivo Engine (Port 4000)**: The high-performance backend node. It handles WhatsApp session management (via MessagingProvider proxy), automation DAG execution (BullMQ), "Agentic Memory" storage, and serves as the headless API for the entire platform.
2.  **SaaS Platform (Port 3000)**: The main user-facing Next.js application. It handles business logic, tenant management, and the Team Inbox UI. It is strictly decoupled from the Engine's source code.
3.  **Admin Dashboard (Port 5174)**: A standalone Vite + React SPA for platform-level operations (Mission Control).

## Service Boundaries & Communication
- **REST Communication**: The SaaS Platform (3000) communicates with the Engine (4000) exclusively via REST using the `EngineClient`.
- **API Security**: Every cross-service request must include a valid `ENGINE_API_KEY` in the `X-API-Key` header.
- **Zero-Import Rule**: Direct imports from `@noxivo/workflow-engine` into `apps/dashboard` are strictly forbidden and verified via audit.
- **Data Responsibility**:
    - **Engine**: Source of truth for workflows, execution runs, contact memories, and messaging status.
    - **SaaS**: Source of truth for users, agencies, tenants, and local UI state.

## Key Developer Quick Links
- **Engine Swagger**: `http://localhost:4000/` (Internal & Public API docs)
- **Engine Health**: `http://localhost:4000/health` (Service connectivity status)
- **SaaS Dashboard**: `http://localhost:3000/` (Primary UI)
- **Admin Mission Control**: `http://localhost:5174/` (Platform Admin UI)

## "The Great Divide" (Phases 1-4) Status: ✅ COMPLETE
- **Phase 1 (Modularization)**: Completed. `server.ts` is lean; logic extracted to plugins/routes.
- **Phase 2 (Node Parity)**: Completed. DAG Executor supports Buttons and Lists.
- **Phase 3 (Memory Vault)**: Completed. AI context is enriched with contact facts via `MemoryService`.
- **Phase 4 (Purging)**: Completed. All direct code dependencies between SaaS and Engine have been severed.


## Architecture Pivot: Stripe-style Zero-Config APIs (2026-04-18)

### Context
We have transitioned from a "Master Key Only" architecture to a "Scoped Session-Aware" architecture. 

### Key Change
Previously, every API request from an external automation (n8n, custom script) required the developer to manually provide `agencyId` and `tenantId`. This created high friction and exposed internal database identifiers.

### Implementation
The Engine now supports **Scoped API Keys** (`nx_...`). When a request arrives with a scoped key, the `api-auth.plugin.ts` (`onRequest` hook) performs a DB lookup and injects the `agencyId` and `tenantId` directly into the request context and payload before the endpoint logic even starts.

### Result
- **Simplicity**: Users only need to provide the `to` and `text` fields. The Engine "knows" who they are.
- **Security**: Internal IDs are no longer required in external payloads.
- **Unified Branding**: The API is now fully branded as **Noxivo** with a professional Master Guide and n8n Matrix.

### Next Focus
Wiring this robustness back into the **Dashboard Inbox UI** (Port 3000) to ensure the internal operator experience matches the new external developer experience.

## Engine API Normalization (2026-04-18)

### Problem
Inconsistency in `ENGINE_API_URL` (root vs `/api/v1`) led to fragile code and redundant environment variable handling across dashboard routes.

### Solution
- **Centralized EngineClient**: All communication now passes through `lib/api/engine-client.ts` which automatically normalizes the URL.
- **Base vs Origin**: The client distinguishes between `originUrl` (for proxying) and `baseUrl` (for Engine APIs).
- **Refactored Routes**: Direct `fetch` calls in `developer-api/route.ts` and others have been replaced with `engineClient` methods.

### Voicetree Documentation Parity (2026-04-18)
The `voicetree-14-4` spatial IDE documentation vault has been audited and synchronized with the latest codebase reality. All structural wikilinks have been verified and fixed, and visual layout coordinates in `positions.json` have been synchronized to individual markdown frontmatters. The documentation accurately reflects the decoupled Microservices architecture, the `EngineClient` standardizations, and the MessagingProvider multi-node management capabilities.
## Docker Deployment & Monorepo Dependency Resolution (2026-04-18)

### Problem
The `apps/dashboard` Docker build was failing due to `ERR_MODULE_NOT_FOUND` errors at runtime. This was caused by `pnpm` not fully hoisting package dependencies (like `mongoose` and `zod`) to the root `node_modules`. Consequently, when the runner stage only copied the root `node_modules`, the workspace packages like `@noxivo/database` and `@noxivo/contracts` could not find their own dependencies.

### Solution
- **Multi-Stage Node Modules**: The `Dockerfile` now explicitly copies per-package `node_modules` for `contracts` and `database` into the runner stage, alongside the root hoisted `node_modules`.
- **Automated Seeding**: Added a `seed-before-start.js` script to the container startup (`CMD`). This ensures the platform owner account (`owner@example.com` / `StrongPass1!`) and default agency are initialized before the Next.js server starts.
- **Model Exports**: Resolved build-time import errors in the `service-catalog-canvas` app by exporting `ImportSessionModel`, `ImportCandidateModel`, and `AuditLogModel` from the `@noxivo/database` package.
- **Context Optimization**: Refined `.dockerignore` to exclude `node_modules` and build artifacts, preventing build context bloat and improving build speed.

### Status
The dashboard is now fully deployable via Docker Compose and automatically seeds its initial platform data on startup.
