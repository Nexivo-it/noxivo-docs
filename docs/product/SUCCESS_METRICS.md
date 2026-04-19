# Noxivo Success Metrics

## Measurement Principle

Noxivo is a multi-tenant automation platform sold to agencies and operationalized through tenant workspaces. Success should be measured at three layers:

1. Commercial health at the agency account level.
2. Activation and retention at the tenant workspace level.
3. Operational reliability across MessagingProvider, inbox, workflow, and billing pipelines.

## North Star Metric

### Recommended North Star

Activated Tenant Workspaces per Month

A tenant workspace counts as activated when it meets all conditions within the measurement window:

1. Has an active or pending MessagingProvider session binding.
2. Has at least one real conversation or message event.
3. Has at least one active workflow definition or meaningful automation activity.

This fits the architecture because value is realized when an agency stands up tenants that are both connected and operational.

## Commercial KPIs

| KPI | Why it matters | Repo signal |
| --- | --- | --- |
| MRR | Primary commercial health | Agency plan posture + Stripe IDs |
| Agency churn | Top-level customer is the agency | `Agency.status`, subscription posture |
| Expansion per agency | Reseller growth inside platform | tenant count, active sessions, usage totals |
| Metered revenue mix | Usage monetization alignment | billing windows + meter events |
| Delinquent agency rate | Collections and entitlement risk | agency billing status, entitlement gates |

## Activation and Product KPIs

| KPI | Definition | Repo grounding |
| --- | --- | --- |
| Agency activation | % agencies that create a tenant and go live | agency + tenant create flows |
| Tenant activation | % tenants with binding + real activity | bindings + conversations + workflows |
| Active tenant ratio | active tenants / total tenants | dashboard queries |
| Session utilization | active sessions vs quota | session bindings + `Agency.usageLimits.activeSessions` |
| Conversation throughput | message and conversation volume | conversation/message persistence |
| Workflow adoption | active definitions + run volume | workflow definition/run models |
| Plugin adoption | enabled plugins per tenant | plugin installation model |
| CRM enrichment adoption | % conversations with enriched context | contact profile + CRM link models |

## Operational KPIs

| KPI | Definition | Repo signal |
| --- | --- | --- |
| Webhook ingestion success | inbound MessagingProvider events persisted | MessagingProvider route + inbox persistence |
| Message delivery success | delivered/read vs failed | delivery status + delivery event audit |
| Workflow completion rate | completed runs / started runs | workflow run status |
| Node failure rate | failed node events / total | execution event status |
| Stripe sync success | synced windows / pending | billing window sync status |
| Aggregation integrity | duplicate-free hourly rollup | idempotency keys + aggregation worker |
| Cluster utilization | active sessions / capacity | cluster model |
| QR/session recovery | time to recover to active | binding status + settings QR flow |

## Target SLAs

| SLA | Target | Reasoning |
| --- | --- | --- |
| Webhook acknowledgement latency | P95 < 2 seconds | MessagingProvider favors fast acknowledgement + async work |
| Cluster availability | >= 99.5% monthly | shared infrastructure dependency |
| Delivery success rate | >= 98% excluding user-caused | explicit delivery states and ACK tracking |
| Workflow completion | >= 99% excluding handoff/cancel | run and execution models exist |
| Billing sync success | >= 99% of non-zero windows synced next cycle | persistent sync status + retry |
| Tenant activation time | <= 7 days | aligns with agency onboarding value |

## Open Questions / Known Cautions

1. MRR is conceptually supported but not computed in-app. Billing identity exists; revenue reporting does not.
2. Analytics routes should not be treated as perfect sources until validated against persistence shape (especially if message records do not duplicate agencyId).
3. Metering capture coverage must be verified end-to-end in runtime startup (workers exist; initialization is environment-dependent).

## Repo Evidence

- `packages/database/src/models/agency.ts`
- `packages/database/src/models/tenant.ts`
- `packages/database/src/models/messaging-cluster.ts`
- `packages/database/src/models/messaging-session-binding.ts`
- `packages/database/src/models/conversation.ts`
- `packages/database/src/models/message.ts`
- `packages/database/src/models/message-delivery-event.ts`
- `packages/database/src/models/workflow-execution.ts`
- `packages/database/src/models/plugin-installation.ts`
- `packages/database/src/models/usage-meter-event.ts`
- `packages/database/src/models/billing-meter-window.ts`
- `packages/database/src/models/stripe-customer.ts`
- `apps/workflow-engine/src/modules/webhooks/messaging.route.ts`
- `apps/workflow-engine/src/modules/metering/aggregation.worker.ts`
- `apps/workflow-engine/src/modules/billing/stripe-sync.worker.ts`
