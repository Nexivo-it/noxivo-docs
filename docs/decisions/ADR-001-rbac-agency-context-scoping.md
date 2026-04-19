# ADR-001: RBAC Navigation and Agency Context Scoping

**Date:** 2026-04-14
**Status:** Accepted
**Context:** Global RBAC enforcing and Platform Admin capabilities

## Context & Problem Statement

Noxivo SaaS requires a multi-tenant hierarchy with `platform_admin` users (who manage the entire platform) and agency-specific users (`agency_owner`, `agency_admin`, `agency_member`, etc.). 

1. **Navigation Constraints:** Certain navigation items (e.g., Billing) must be explicitly restricted to agency owners and admins, avoiding unauthorized access by platform members or basic members.
2. **Context Switching:** A `platform_admin` inherently has access to all agencies but needs a way to view the dashboard *as* a specific agency to evaluate UI, settings, and workflows effectively.

## Decision

We are implementing a pure frontend context-scoping mechanism for Phase 1. 

### 1. Unified Navigation Filtering

All role-based navigation logic has been unified into a single `navigation.filter()` pass in `navigation.ts`:
- **Settings:** Restricted strictly to `platform_admin`, `agency_owner`, and `agency_admin`.
- **Billing:** Restricted strictly to `agency_owner` and `agency_admin`. Explicitly denied for `platform_admin` as billing happens per tenant/agency, not at the platform level in this context.

### 2. Dashboard Shell Agency Switcher

For `platform_admin` users, the `DashboardShellData` now securely fetches `allAgencies` and forwards it via `layout.tsx` into the `DashboardShell`. 

The `DashboardShell` features a dynamic interactive Dropdown replacing the static Workspace Card for admins:
- Enables the admin to search and swap their active context in the UI.
- Stores the selected agency ID in `localStorage` under the key `nf_admin_agency_ctx`.
- Hydrates the visual state (Headers, Workspace Card plan status) immediately upon selection.

## Consequences

- **Positive:** Platform admins can seamlessly switch visual workspace context with zero latency as the UI gracefully falls back to the hydrated selection.
- **Positive:** Centralized RBAC definitions prevent navigation leaks for multi-tenant users.
- **Next Steps (Phase 2):** Implement a global Axios/Fetch interceptor that reads `nf_admin_agency_ctx` from local storage and injects an `X-Agency-Context` header so that backend API requests correctly scope to the intercepted agency ID.
