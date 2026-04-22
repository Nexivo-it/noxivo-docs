# Dashboard UI-Only Design

## Overview

The dashboard currently sits in a transitional state. Business APIs for agencies, catalog, workflows, team inbox, and settings have already been moved behind `apps/workflow-engine`, and the dashboard now reaches them through thin Next.js proxy routes. However, the dashboard still owns part of the backend surface, especially auth/session routes, and still exposes an `app/api/**` layer that keeps it from being truly UI-only.

This design completes that separation. `apps/dashboard` should become a frontend-only application that renders UI and talks directly to `apps/workflow-engine` from the browser. `apps/workflow-engine` becomes the single backend API for dashboard auth and all dashboard data operations.

## Goals

- Make `apps/dashboard` a UI-only application.
- Move remaining dashboard-owned backend behavior, including auth/session, into `apps/workflow-engine`.
- Remove dashboard `app/api/**` business/auth routes once direct browser-to-backend integration is complete.
- Keep one backend source of truth for dashboard and future surfaces.
- Create the implementation on a dedicated branch named `dashboard-ui`.

## Non-Goals

- Do not redesign dashboard UI/UX flows in this spec.
- Do not change workflow-engine domain boundaries that were just modularized unless required for auth or public API exposure.
- Do not add a second backend-for-frontend layer.
- Do not keep route proxies as a permanent end state.

## Approved Product Decision

- The dashboard should be **strictly UI-only**.
- The browser should call workflow-engine **directly**.
- Auth must move too. Login, logout, and session lookups should be workflow-engine responsibilities.

## Current State

The following dashboard API domains are already effectively backend-owned by workflow-engine, but still travel through thin Next.js route wrappers:

- `/api/agencies/**`
- `/api/catalog/**`
- `/api/workflows/**`
- `/api/team-inbox/**`
- `/api/settings/**`

The dashboard still owns at least these backend concerns locally:

- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/session`
- session cookie creation/attachment logic in dashboard auth helpers
- route-level proxy layer in `apps/dashboard/app/api/**`

## Architecture

### Final Boundary

After this migration:

- `apps/dashboard` owns:
  - App Router pages/layouts
  - components
  - client/server UI composition
  - frontend hooks
  - typed browser API client helpers
- `apps/workflow-engine` owns:
  - authentication endpoints
  - session lifecycle
  - all business APIs used by dashboard
  - authorization checks
  - CORS/cookie/session behavior needed by browser clients

Dashboard should no longer contain backend business logic or business API routes.

### Browser-to-Backend Contract

The dashboard frontend should call workflow-engine directly using a browser-safe API client layer. That client layer may live in dashboard code, but it must be a pure caller, not a backend façade.

Expected call shape:

- Dashboard browser/client code → workflow-engine public API
- Auth cookie or token sent directly to workflow-engine
- Workflow-engine returns JSON/SSE responses directly to browser

The current proxy helper `apps/dashboard/lib/api/workflow-engine-proxy.ts` is transitional and should be removed once all consumers have been moved off `app/api/**`.

## Auth and Session Design

### Ownership

Workflow-engine must own:

- login
- logout
- current session lookup
- session creation and invalidation
- authorization enforcement for protected APIs

Dashboard must stop generating or attaching backend session cookies itself.

### Cross-Origin Requirements

Because the browser will call workflow-engine directly, workflow-engine must support the dashboard origin explicitly.

Required backend work:

- CORS allowlist for dashboard origin(s)
- credentialed requests enabled where cookie auth is used
- cookie domain/path/secure/samesite settings validated for deployed subdomains
- CSRF protection for cookie-auth mutating routes

### Deployment Assumption

Best-supported deployment shape:

- dashboard on one subdomain
- workflow-engine on another subdomain
- shared parent domain where cookie scope can be configured intentionally

If that deployment shape cannot support secure credentialed browser requests, then a token-based auth contract would be needed. That is not the approved direction here; this design assumes direct browser access can be made safe with correct CORS and cookie policy.

## Migration Plan

### Phase 1: Backend auth parity

Add or finalize workflow-engine endpoints for:

- login
- logout
- current session/me

These endpoints must match the behavior dashboard UI needs today.

### Phase 2: Browser API client layer

Create a typed dashboard-side API client for direct calls to workflow-engine. This replaces calls to dashboard `app/api/**` routes.

This client should:

- read workflow-engine base URL from frontend-safe config
- centralize fetch defaults
- support credentials/SSE behavior as needed
- normalize common error handling for UI consumers

### Phase 3: Auth cutover first

Move dashboard login/session/logout flows first. This reduces ambiguity because every later request depends on the new auth/session path.

Target dashboard cleanup after auth cutover:

- remove `/app/api/auth/login/route.ts`
- remove `/app/api/auth/logout/route.ts`
- remove `/app/api/auth/session/route.ts`
- stop using dashboard session creation helpers for user auth

### Phase 4: Feature API cutover

Move dashboard UI consumers from Next route calls to direct workflow-engine calls for:

- agencies
- catalog
- workflows
- team inbox
- settings

Once all UI consumers are switched, remove the corresponding dashboard `app/api/**` wrappers.

### Phase 5: Delete transitional proxy layer

Remove:

- `apps/dashboard/lib/api/workflow-engine-proxy.ts`
- dashboard business/auth route wrappers under `apps/dashboard/app/api/**`

At this point, dashboard should be UI-only in practice and in code layout.

## File Targets

### Workflow-engine

Likely files/modules to change:

- auth/session route registration and handlers
- cookie/session helpers used by auth endpoints
- CORS configuration
- public route protection/authorization middleware

### Dashboard

Likely files/modules to change:

- auth UI callers and hooks
- data-fetching hooks/services that still target local `app/api/**`
- environment/config helpers for backend base URL
- removal of `apps/dashboard/app/api/**` route files after cutover

## Testing Strategy

### Workflow-engine

Add or expand tests for:

- login/logout/session endpoints
- CORS behavior for dashboard origin
- cookie/session behavior for direct browser use
- protected route access after direct auth migration

### Dashboard

Add or update tests for:

- auth flows using direct workflow-engine calls
- feature hooks/services calling workflow-engine directly
- error/loading handling when backend unavailable
- removal of assumptions about local route wrappers

### End-to-End Verification

Required verification commands:

- `pnpm --filter @noxivo/dashboard test`
- `pnpm --filter @noxivo/dashboard build`
- `pnpm --filter @noxivo/workflow-engine lint`
- `pnpm --filter @noxivo/workflow-engine build`
- `pnpm --filter @noxivo/workflow-engine test`

In addition to automated tests, real environment verification is required for cross-origin cookie/session behavior.

## Risks and Constraints

### Highest Risk: Cross-Origin Auth

The main technical risk is not feature parity. It is browser auth behavior once dashboard stops proxying requests and starts calling workflow-engine directly.

Failure modes include:

- cookies not sent because of domain/samesite configuration
- browser blocking credentialed cross-origin requests
- CSRF gaps on mutating endpoints
- SSE/auth interactions behaving differently from simple JSON requests

### Cleanup Risk

Deleting dashboard `app/api/**` routes too early would break UI consumers silently. Removal must happen only after each UI path has been switched to the direct API client.

## Branch Strategy

Implementation branch:

- `dashboard-ui`

It should branch from current `main`, not from older feature worktrees.

## Expected Outcome

After this design is implemented:

- dashboard will be frontend-only
- workflow-engine will be sole backend API for dashboard
- auth/session will live in workflow-engine
- dashboard `app/api/**` business/auth route layer will be removed
- future surfaces can reuse the same backend without dashboard-specific backend code remaining in `apps/dashboard`
