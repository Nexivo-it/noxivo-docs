# Noxivo Business Model

## Product Thesis

Noxivo is a B2B platform-as-a-product for agencies that operate or resell WhatsApp automation to multiple downstream client workspaces. The repository implements a two-level operating model - `Agency -> Tenant` - with shared MessagingProvider infrastructure, tenant-scoped automation, and agency-level billing and governance.

The commercial design is not a pure seat-based SaaS. It is a hybrid model:

1. Platform subscription revenue at the agency tier.
2. Usage-based revenue from automation and messaging activity.
3. White-label operating value that lets an agency package Noxivo as its own client-facing service.

## B2B PaaP Strategy

### Reseller / Agency value proposition

Agencies are the commercial customer and the operating control point.

- Provision multiple tenant workspaces beneath one agency account.
- Manage agency team members separately from tenant/client workspaces.
- Apply agency-wide branding defaults and domain posture.
- Control whether billing remains agency-funded or is pushed down to a tenant workspace.
- Operate multiple WhatsApp sessions across a shared MessagingProvider cluster fleet instead of isolated per-tenant containers.

### End-user / Tenant value proposition

Tenants are the operational delivery unit.

- Run a branded workspace under an agency umbrella.
- Pair a WhatsApp session and manage live conversations.
- Use inbox, CRM-linked contact context, and workflow automation.
- Enable tenant-specific plugins and workflow definitions.
- Inherit agency governance while preserving tenant-level routing and branding overrides.

## Commercial Structure

### Subscription tiers

The codebase defines three agency plans:

| Commercial label | Code enum | Default tenant quota | Default active session quota |
| --- | --- | ---: | ---: |
| Starter | `reseller_basic` | 5 | 25 |
| Pro Reseller | `reseller_pro` | 20 | 100 |
| Enterprise | `enterprise` | 100 | 500 |

These quotas are encoded in the agency administration layer, not only in presentation copy.

### Billing ownership model

Noxivo supports two billing postures at the tenant layer:

- `agency_pays`
- `tenant_pays`

This makes the product commercially flexible for both true resellers and centralized operators running multiple internal brands or business units.

### Usage-based metering strategy

The metering model is present in contracts and persistence. The product tracks billable operational events by hour bucket and syncs aggregated usage windows to Stripe-compatible meter events.

Current metric families:

- `inbound_message`
- `outbound_message`
- `plugin_execution`
- `ai_token_usage`
- `session_active_hour`
- `media_download`

This supports a pricing strategy of:

1. Base platform fee per agency plan.
2. Metered overage or consumption pricing for automation and communication volume.
3. Premium feature access gated by plan and billing posture.

## Pricing Strategy

### Recommended packaging

| Revenue stream | Description | Repo grounding |
| --- | --- | --- |
| Platform fee | Monthly agency subscription tied to plan and quota envelope | Agency `plan`, `usageLimits`, and agency admin quota enforcement |
| Messaging usage | Charge for inbound/outbound message activity where commercial policy requires it | Metering contracts and capture services |
| Automation usage | Charge for plugin executions and AI token consumption | `plugin_execution` and `ai_token_usage` metrics |
| Infrastructure usage | Charge for sustained WhatsApp footprint and media transfer | `session_active_hour` and `media_download` metrics |

### Feature gating posture

The product distinguishes between baseline and premium capability:

- Premium plugin and AI entitlements require a premium agency plan.
- Dashboard billing features expose derived flags for CRM integration, advanced workflows, custom branding, and priority support.
- Delinquent or suspended agencies can remain eligible for webhook ingestion while premium automation is blocked.

## Billing System Architecture

### System of record

- MongoDB is the source of truth for tenancy, workflows, message history, plugin installations, and aggregated billing windows.
- Stripe is the intended system of record for subscription state and external meter events.
- Counter storage is used as the hot-path aggregation layer before persisted billing windows are produced.

### Billing flow

1. Runtime events increment hourly usage counters.
2. The aggregation worker drains a window and persists `UsageMeterEvent` plus `BillingMeterWindow` records.
3. The Stripe sync worker posts one meter event per `(agencyId, metric, windowStart)`.
4. Billing windows move through `pending -> synced|failed` states.
5. Entitlement checks use plan and billing state to allow or block premium features.

## Why the Model Fits This Product

This architecture matches the operational cost structure of WhatsApp automation better than a flat-seat SaaS model.

- MessagingProvider session capacity is infrastructure-bound.
- Message throughput and automation volume are variable.
- Agencies need margin room between their client contracts and their platform cost base.
- White-label controls increase reseller willingness to adopt the platform as client-facing operating software.

## Open Questions

1. Price points are not encoded in the repo. The implementation supports tiering and metering, but not final commercial amounts.
2. `StripeCustomerModel` exists but is not always the system-of-record in runtime paths; some flows read Stripe IDs directly from `AgencyModel`.
3. Metering bootstrap wiring must be verified end-to-end in the deployed runtime (workers exist; initialization is environment-dependent).
4. Active session quota storage is present, but enforcement must be audited in the session provisioning / binding path.

## Repo Evidence

- `packages/database/src/models/agency.ts`
- `packages/database/src/models/tenant.ts`
- `packages/contracts/src/agency-management.ts`
- `packages/contracts/src/metering.ts`
- `apps/dashboard/lib/dashboard/agency-admin.ts`
- `apps/workflow-engine/src/modules/metering/aggregation.worker.ts`
- `apps/workflow-engine/src/modules/billing/stripe-sync.worker.ts`
- `apps/workflow-engine/src/modules/access/entitlement.service.ts`
- `PLAN.md`
