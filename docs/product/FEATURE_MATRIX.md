# Noxivo Feature Matrix

## Packaging Basis

The repository defines three plan enums at the agency layer:

- `reseller_basic`
- `reseller_pro`
- `enterprise`

For product-facing documentation, this matrix uses the commercial labels Starter, Pro Reseller, and Enterprise, while preserving the underlying code enums where relevant.

## Core Subscription Matrix

| Module / capability | Starter (`reseller_basic`) | Pro Reseller (`reseller_pro`) | Enterprise (`enterprise`) | Evidence / notes |
| --- | --- | --- | --- | --- |
| Agency administration | Included | Included | Included | Agency overview + agency APIs |
| Tenant workspace management | Included | Included | Included | Tenant create/list flows; quotas differ by plan |
| Team management and invitations | Included | Included | Included | Agency invitation model + team routes |
| Tenant quota envelope | 5 tenants | 20 tenants | 100 tenants | `Agency.usageLimits.tenants` + defaults |
| Active session quota envelope | 25 sessions | 100 sessions | 500 sessions | `Agency.usageLimits.activeSessions` + defaults |
| Shared MessagingProvider session routing | Included | Included | Included | Shared cluster/session binding architecture |
| WhatsApp QR pairing surface | Included | Included | Included | Settings QR route backed by binding + MessagingProvider API calls |
| Omnichannel inbox / team inbox | Included | Included | Included | Conversations, messages, realtime updates, assignment |
| Delivery-state tracking | Included | Included | Included | Message ACK + delivery status + delivery event audit |
| Contact profile and CRM sidebar | Available | Included | Included | Contact profile model + CRM routes/UI surfaces |
| Plugin installation API | Available | Included | Included | Tenant-scoped plugin installation route exists |
| Premium plugin execution | Not entitled | Included | Included | Entitlement service gates premium plugin actions |
| AI-powered actions | Not entitled | Included | Included | Entitlement service gates AI actions |
| Workflow runtime foundation | Included | Included | Included | Compiled DAG contracts + runs + execution events |
| Advanced workflows packaging | Not flagged | Not flagged | Included | Commercially reserved; UI may still be mock |
| Custom branding / white-label polish | Not flagged | Included | Included | Branding contracts/models exist; white-label defaults/overrides |
| Priority support | Not flagged | Not flagged | Included | Commercial flag only; not a code-level feature |
| Usage metering and billing posture visibility | Included | Included | Included | Metering contracts + windows + Stripe sync worker |

## Internal Platform Capabilities

The repo also contains internal capabilities that are not sold as agency-tier features but are essential to operating the product.

| Internal platform capability | Audience | Current repo state |
| --- | --- | --- |
| Platform-admin agency registry | Super Admin | Implemented in dashboard navigation + agencies page |
| Shared MessagingProvider cluster allocation | Internal ops | Implemented in `packages/messaging-client/src/cluster-allocator.ts` |
| Built-in plugin catalog registration | Internal ops | Implemented in workflow-engine plugin registry |

## Capability Notes by Module

### Omnichannel Inbox

- Conversation threading, unread state, assignment, handoff, outbound send, delivery acks, and CRM sidebar surfaces are represented in the repo.
- Realtime inbox updates exist through a tenant-scoped event stream.

### Visual DAG Bot Builder

- The runtime model is real: editor graph contracts, DAG compilation, workflow definitions, workflow runs, and execution events are implemented.
- The dashboard workflows page may be mock/demo UI depending on branch/worktree state; avoid overclaiming a full visual editor unless verified in the current UI.

### Plugin Registry

- Tenant-scoped plugin installations exist.
- Built-in proof point: `calendar-booking`.
- Premium plugin execution is plan-gated.
- Tenants cannot upload arbitrary code plugins.

### Super-Admin Observability

- Platform-admin navigation and agency-list administration exist.
- Shared MessagingProvider clusters and plugin registration are primarily backend-operated capabilities unless surfaced by dedicated dashboard CRUD pages.

## Open Questions

1. CRM commercialization is clearer than CRM UI gating. Ensure entitlement and UI behavior match.
2. Workflow packaging needs careful wording. Runtime support exists; UI editor maturity varies.
3. Cluster operations are implemented at the service layer; super-admin UI may lag behind.

## Repo Evidence

- `apps/dashboard/app/dashboard/agencies/page.tsx`
- `apps/dashboard/lib/dashboard/navigation.ts`
- `apps/dashboard/lib/dashboard/queries.ts`
- `apps/dashboard/app/api/settings/qr/route.ts`
- `apps/dashboard/app/dashboard/conversations/page.tsx`
- `apps/dashboard/app/api/team-inbox/plugins/route.ts`
- `apps/dashboard/app/api/team-inbox/billing/route.ts`
- `apps/workflow-engine/src/modules/access/entitlement.service.ts`
- `apps/workflow-engine/src/modules/plugins/registry.service.ts`
- `apps/workflow-engine/src/modules/plugins/builtin/calendar-booking.plugin.ts`
- `apps/workflow-engine/src/modules/agents/dag-compiler.ts`
- `apps/workflow-engine/src/modules/agents/dag-executor.ts`
- `packages/messaging-client/src/cluster-allocator.ts`
