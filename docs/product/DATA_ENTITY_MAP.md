# Data Entity Map (Source of Truth)

Last updated: 2026-04-12 (Asia/Ho_Chi_Minh)

This document maps the *actual* MongoDB entities in this repo to the product surface and service boundaries (Dashboard vs Workflow Engine). Use it to reason about ownership, scoping, indexes, and what data is considered canonical.

Repo root: `/Users/salmenkhelifi/Developer/messaging /noxivo-saas`

## Legend

- **Model file**: Mongoose schema in `packages/database/src/models/*`
- **Owner service**:
  - **Dashboard**: Next.js route handlers under `apps/dashboard/app/api/*`
  - **Workflow Engine**: Fastify routes/services under `apps/workflow-engine/src/modules/*`
- **Scope**: the tenancy boundary that must be enforced at query time

## High-Level Relationships

```text
Agency ──┬───────────────┬──────────────┬───────────────────────────┐
         │               │              │                           │
       Tenant          User       StripeCustomer             CustomDomainReservation
         │               │
         │               └── AuthSession
         │
         ├── Conversation ── Message ── MessageDeliveryEvent
         │          │
         │          └── ContactProfile
         │
         ├── WorkflowDefinition ── WorkflowRun ── WorkflowExecutionEvent
         │
         ├── PluginInstallation
         │
         └── MessagingSessionBinding ── MessagingCluster
```

## Identity and Access

### User

- **Model file**: `packages/database/src/models/user.ts`
- **Owner service**: Dashboard
- **Scope**: `agencyId`
- **Purpose**: primary identity for operators/admins; holds role + tenant membership.
- **Key fields**:
  - `agencyId`, `defaultTenantId`, `tenantIds[]`
  - `email` (unique), `fullName`, `passwordHash`
  - `role`: `platform_admin | agency_owner | agency_admin | agency_member | viewer`
  - `status`: `active | suspended`
- **Indexes / constraints**:
  - `email` unique
  - compound index `{ agencyId, email }` for tenant/agency scoped lookups

### AuthSession

- **Model file**: `packages/database/src/models/auth-session.ts`
- **Owner service**: Dashboard
- **Scope**: `agencyId`, `tenantId`, `userId`
- **Purpose**: cookie-backed session issuance and validation.
- **Key fields**:
  - `userId`, `agencyId`, `tenantId`
  - `sessionTokenHash` (unique)
  - `expiresAt` (TTL index), `lastSeenAt`
- **Indexes / constraints**:
  - TTL index on `expiresAt` (`expireAfterSeconds: 0`)

### AgencyInvitation

- **Model file**: `packages/database/src/models/agency-invitation.ts`
- **Owner service**: Dashboard
- **Scope**: `agencyId`
- **Purpose**: invite-by-email join flow into an existing agency.
- **Key fields**:
  - `email`, `role`, `tenantIds[]`, `invitedByUserId`
  - `tokenHash` (unique), `expiresAt`
  - `status`: `pending | accepted | expired | revoked`
- **Indexes / constraints**:
  - Partial unique index: one pending invite per `{ agencyId, email }`

## Tenancy and Branding

### Agency

- **Model file**: `packages/database/src/models/agency.ts`
- **Owner service**: Dashboard (platform admin create/manage; agency owners manage their agency)
- **Scope**: agency root
- **Purpose**: commercial account; owns white-label defaults and billing ownership.
- **Key fields**:
  - `name`, `slug` (unique)
  - `plan`: `reseller_basic | reseller_pro | enterprise`
  - `billingStripeCustomerId`, `billingStripeSubscriptionId`, `billingOwnerUserId`
  - `whiteLabelDefaults` (Zod-validated `WhiteLabelConfig`)
  - `usageLimits` (tenants, activeSessions)
  - `status`: `trial | active | suspended | cancelled`

### Tenant

- **Model file**: `packages/database/src/models/tenant.ts`
- **Owner service**: Dashboard (agency admin creates/updates), Workflow Engine (reads for routing/runtime)
- **Scope**: `agencyId` + `tenantId`
- **Purpose**: operational workspace under an agency; holds region and branding overrides.
- **Key fields**:
  - `agencyId`, `slug` (unique), `name`
  - `region`: `eu-west-1 | me-central-1 | us-east-1`
  - `billingMode`: `agency_pays | tenant_pays`
  - `whiteLabelOverrides` (Zod-validated)
  - `effectiveBrandingCache` (Zod-validated)
- **Indexes / constraints**:
  - unique `{ agencyId, slug }`
  - `slug` is also globally unique (schema has `unique: true`)

### CustomDomainReservation

- **Model file**: `packages/database/src/models/custom-domain.ts`
- **Owner service**: Dashboard
- **Scope**: global uniqueness with `ownerType + ownerId`
- **Purpose**: ensures `customDomain` is unique across agencies and tenants.
- **Key fields**:
  - `domain` (normalized)
  - `ownerType`: `agency | tenant`
  - `ownerId`
- **Indexes / constraints**:
  - unique `domain`

## MessagingProvider Infrastructure (Shared Cluster Model)

### MessagingCluster

- **Model file**: `packages/database/src/models/messaging-cluster.ts`
- **Owner service**: Dashboard (admin UX) + Workflow Engine (allocator reads)
- **Scope**: region-level selection (no tenant data in cluster rows)
- **Purpose**: registry of shared MessagingProvider Plus clusters.
- **Key fields**:
  - `region`, `baseUrl`, `dashboardUrl`, `swaggerUrl`
  - `capacity`, `activeSessionCount`
  - `status`: `active | maintenance | offline`
  - `secretRefs.webhookSecretVersion`

### MessagingSessionBinding

- **Model file**: `packages/database/src/models/messaging-session-binding.ts`
- **Owner service**: Dashboard (provision QR, manage bindings), Workflow Engine (webhook routing)
- **Scope**: `agencyId` + `tenantId`
- **Purpose**: binds a tenant to a MessagingProvider cluster + MessagingProvider session identity and routing metadata.
- **Key fields**:
  - `agencyId`, `tenantId`, `clusterId`
  - `sessionName` (friendly), `messagingSessionName` (unique)
  - `routingMetadata` (includes `agencyId/tenantId/clusterId/sessionBindingId`)
  - `status`: `pending | active | failed | stopped`

### Allocator + Session Payload

- **Code**:
  - `packages/messaging-client/src/cluster-allocator.ts`
  - `packages/messaging-client/src/session-config.ts`
- **Notes**:
  - allocator increments `activeSessionCount` atomically for capacity management
  - session payload includes `config.metadata` for tenant-safe webhook routing

## Inbox, Conversations, and Delivery

### Conversation

- **Model file**: `packages/database/src/models/conversation.ts`
- **Owner service**: Workflow Engine (canonical write), Dashboard (read + authorized mutations like assign/read)
- **Scope**: `agencyId` + `tenantId`
- **Purpose**: inbox thread header and routing anchor (one per contact).
- **Key fields**:
  - `contactId`, `contactName`, `contactPhone`
  - `status`: `open | assigned | handoff | resolved | closed | deleted`
  - `assignedTo` (user id)
  - `lastMessageAt`, `unreadCount`
- **Indexes / constraints**:
  - unique `{ tenantId, contactId }`

### Message

- **Model file**: `packages/database/src/models/message.ts`
- **Owner service**: Workflow Engine (canonical write), Dashboard (reads)
- **Scope**: via `conversationId` lookup which is tenant-scoped
- **Purpose**: message history, attachments, delivery status, provider ids.
- **Key fields**:
  - `role`: `user | assistant | system`
  - `content` (required if no attachments)
  - provider metadata: `messagingMessageId`, `providerMessageId`, `providerAck`, `providerAckName`
  - `deliveryStatus`: `queued | sent | delivered | read | failed`
  - `attachments[]`: `{ kind, url, mimeType, fileName, caption, sizeBytes }`

### MessageDeliveryEvent

- **Model file**: `packages/database/src/models/message-delivery-event.ts`
- **Owner service**: Workflow Engine
- **Scope**: `agencyId` + `tenantId`
- **Purpose**: append-only delivery lifecycle ledger driven by send paths + MessagingProvider ACK webhooks.
- **Key fields**:
  - `messageId`, `providerMessageId`
  - `deliveryStatus`, `providerAck`, `providerAckName`
  - `source`: `message_create | webhook_message | webhook_ack | retry_worker | manual_resend`
  - `occurredAt`, `metadata`

### InternalInboxSendReservation

- **Model file**: `packages/database/src/models/internal-inbox-send-reservation.ts`
- **Owner service**: Workflow Engine
- **Scope**: `conversationId` + idempotency key
- **Purpose**: prevents duplicate operator sends under retries and concurrency.

### ContactProfile

- **Model file**: `packages/database/src/models/contact-profile.ts`
- **Owner service**: Workflow Engine (canonical projection), Dashboard (reads)
- **Scope**: `agencyId` + `tenantId` + `contactId`
- **Purpose**: persisted contact intelligence baseline for CRM enrichment.

## Workflow Engine Runtime

### WorkflowDefinition

- **Model file**: `packages/database/src/models/workflow-definition.ts`
- **Owner service**: Dashboard (create/edit), Workflow Engine (execute)
- **Scope**: `agencyId` + `tenantId`
- **Purpose**: stores both editor graph and compiled execution DAG.
- **Key fields**:
  - `key`, `version`, `channel`
  - `editorGraph` (validated by `WorkflowEditorGraphSchema`)
  - `compiledDag` (validated by `CompiledDagSchema`)
  - `isActive`

### WorkflowRun + WorkflowExecutionEvent

- **Model file**: `packages/database/src/models/workflow-execution.ts`
- **Owner service**: Workflow Engine
- **Scope**: `agencyId` + `tenantId` + `conversationId`
- **Purpose**: durable runtime state and event log for DAG execution (including suspend/cancel).
- **Key fields (WorkflowRun)**:
  - `workflowRunId`, `workflowDefinitionId`, `conversationId`
  - `status`: `running | completed | failed | suspended | cancelled`
  - `currentNodeId`, `contextPatch`, `startedAt`, `finishedAt`
- **Key fields (WorkflowExecutionEvent)**:
  - `nodeId`, `status`: `running | completed | failed | skipped`
  - `output`, `error`, timestamps
- **Indexes / constraints**:
  - unique `{ agencyId, tenantId, conversationId, workflowRunId }`

## Plugins

### PluginInstallation

- **Model file**: `packages/database/src/models/plugin-installation.ts`
- **Owner service**: Workflow Engine (read/execute enforcement), Dashboard (enable/disable/config UX)
- **Scope**: `agencyId` + `tenantId`
- **Purpose**: tenant enablement + config storage for code-registered plugins.

## Metering and Billing

### UsageMeterEvent

- **Model file**: `packages/database/src/models/usage-meter-event.ts`
- **Owner service**: Workflow Engine
- **Scope**: `agencyId` + `tenantId`
- **Purpose**: immutable usage events written from hot-path metering flush or idempotent ingest.

### BillingMeterWindow

- **Model file**: `packages/database/src/models/billing-meter-window.ts`
- **Owner service**: Workflow Engine
- **Scope**: `agencyId`
- **Purpose**: hourly aggregation window written from Redis counters.

### StripeCustomer

- **Model file**: `packages/database/src/models/stripe-customer.ts`
- **Owner service**: Workflow Engine (sync worker) + Dashboard (admin display)
- **Scope**: `agencyId`
- **Purpose**: maps agency billing state to Stripe ids and delinquency flags.

## CRM (Team Inbox Sidebar)

These models support the CRM sidebar and enrichment baseline. They are tenant-scoped.

- **Model files**:
  - `packages/database/src/models/crm-connection.ts`
  - `packages/database/src/models/crm-sync-job.ts`
  - `packages/database/src/models/crm-external-record-link.ts`
  - `packages/database/src/models/crm-activity-event.ts`
- **Owner service**: Dashboard (operator UX) + Workflow Engine (future sync workers)
- **Scope**: `agencyId` + `tenantId`

## Known Product Gaps (Reality Check)

This repo is build/lint/test clean, but some capabilities are still “backend-first” and not fully operator-managed.

- Workflow builder UI is not a full production editor: compiled DAG execution exists, but dashboard workflow authoring UX is not yet a Make.com-grade canvas.
- MessagingProvider cluster management is primarily backend-operated: cluster registry exists, but there is no complete operator UI for fleet management.
- Stripe billing flows are present (metering + sync worker + delinquency guard), but production rollout still requires real Stripe product/meter configuration and live environment validation.

