# Noxivo User Flows

## Scope

This document separates current implemented flows from architecture-backed target flows where the backend/runtime exists but the final dashboard surface may still be incomplete depending on branch/worktree state.

## Persona 1: Platform Admin (Super Admin)

### Responsibility

Operate the Noxivo platform itself: agencies, fleet posture, and platform-level governance.

### Current implemented flow

1. Sign in as `platform_admin`.
2. Land in the dashboard shell with platform-admin navigation.
3. Open Agencies to view all agencies in the system.
4. Create/update agencies through the dashboard-owned agency APIs.
5. Review aggregated platform counts through dashboard queries and stats routes.

### Platform operations flow

1. Review agency footprint and identify risk by plan, tenant count, and session volume.
2. Operate shared MessagingProvider fleet capacity using the allocator and cluster records.
3. Maintain the global built-in plugin catalog at the workflow-engine layer.

Implementation note:
- MessagingProvider cluster management and global plugin management are primarily backend-operated capabilities unless dedicated dashboard CRUD pages exist in the current worktree.

Key touchpoints:
- `apps/dashboard/app/dashboard/agencies/page.tsx`
- `apps/dashboard/lib/dashboard/queries.ts`
- `apps/dashboard/lib/auth/authorization.ts`
- `packages/messaging-client/src/cluster-allocator.ts`
- `apps/workflow-engine/src/modules/plugins/registry.service.ts`

## Persona 2: Agency Owner

### Responsibility

Stand up a branded agency workspace, onboard client tenants, govern the team, and control billing posture.

### End-to-end flow

1. Agency onboarding
   - agency created by platform admin
   - default tenant created as initial operational environment (if enabled by policy)
   - owner invited or created as the controlling agency user
2. Agency baseline review
   - owner signs in and lands on the agency workspace
   - reviews plan, status, domain posture, tenant count, and activity
3. White-label setup
   - configure support email, primary color, logo, custom domain, branding posture
4. Team setup
   - invite operators and agency admins
   - set tenant access scope
5. Tenant provisioning
   - create tenant workspace
   - choose billing mode (`agency_pays` or `tenant_pays`)
   - assign region and branding overrides
6. Commercial review
   - inspect plan status and derived feature flags
   - use tenant/session growth as expansion signal

Key touchpoints:
- `apps/dashboard/app/dashboard/agency/page.tsx`
- `apps/dashboard/app/dashboard/team/page.tsx`
- `apps/dashboard/app/dashboard/tenants/page.tsx`
- `apps/dashboard/app/api/agencies/*`
- `packages/database/src/models/agency.ts`
- `packages/database/src/models/tenant.ts`

## Persona 3: Tenant Operator

### Responsibility

Connect the WhatsApp session, manage daily conversations, and run tenant-scoped automation.

### Current implemented flow

1. Pair WhatsApp session
   - open Settings
   - QR route resolves or provisions binding + MessagingProvider session, then returns QR data
2. Run live inbox operations
   - open Conversations
   - search/filter/select a conversation
   - read and send messages
   - assign/unassign conversations (handoff semantics may apply)
   - observe realtime updates through the inbox event stream
3. Manage tenant plugin posture
   - read plugin installations for the tenant
   - enable/update tenant-scoped plugin configuration

### Architecture-backed target flow

1. Design or update a workflow graph for the tenant.
2. Compile the editor graph into a validated DAG.
3. Activate the workflow definition.
4. Allow inbound messages and runtime events to trigger workflow execution.
5. Let plugin nodes, delay nodes, handoff states, and outbound MessagingProvider actions run against tenant context.

Implementation note:
- The workflow runtime and persistence model are implemented; the workflow editor UI maturity must be verified in the current dashboard.

Key touchpoints:
- `apps/dashboard/app/api/settings/qr/route.ts`
- `apps/dashboard/app/dashboard/settings/page.tsx`
- `apps/dashboard/app/dashboard/conversations/page.tsx`
- `apps/dashboard/app/api/team-inbox/*`
- `apps/workflow-engine/src/modules/webhooks/messaging.route.ts`
- `apps/workflow-engine/src/modules/inbox/inbox.service.ts`
- `apps/workflow-engine/src/modules/agents/dag-compiler.ts`
- `apps/workflow-engine/src/modules/agents/dag-executor.ts`

## System Flow Summary

### Inbound message to automation

1. MessagingProvider emits a webhook.
2. Webhook resolves to tenant via session binding.
3. Inbox persistence creates/updates conversation and message.
4. Realtime events publish for UI refresh.
5. Eligible workflow logic can execute against conversation context.
6. Outbound MessagingProvider actions and plugin executions contribute to usage metering.

### Human handoff

1. Operator claims the conversation.
2. Conversation enters handoff posture.
3. Active workflow runs may be cancelled or prevented from resuming.
4. Operator continues conversation manually.

## Open Questions

1. Super-admin cluster management may not be a dedicated dashboard workflow yet.
2. Tenant workflow-builder UI may lag behind the runtime maturity.
3. Tenant onboarding assumes a session binding exists or can be provisioned; self-serve session UX must be validated in the current product surface.
