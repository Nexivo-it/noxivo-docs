# System Data Flow

## Database Schema (MongoDB)

The data model is heavily partitioned by `agencyId` and `tenantId`.

- **Platform Layer:**
  - `Agency`: Commercial entity (Billing info, White-label defaults, Limits).
  - `User`: Global identities.
  - `AuthSession`: Cookie-backed session tokens.
- **Tenant Layer:**
  - `Tenant`: Operational subspace under an Agency (White-label overrides).
  - `MessagingCluster`: Registry of available WhatsApp API servers.
  - `MessagingSessionBinding`: Links a Tenant to a specific MessagingProvider Cluster session.
- **Inbox & CRM Layer:**
  - `Conversation`: A WhatsApp chat thread.
  - `Message`: Individual text/media messages within a conversation.
  - `ContactProfile`: Aggregated CRM data (first seen, message counts) derived from messages.
- **Workflow & Execution Layer:**
  - `WorkflowDefinition`: Stores both React Flow JSON (editor) and compiled DAG (runtime).
  - `WorkflowRun`: Tracks active/suspended execution states.
- **Billing Layer:**
  - `UsageMeterEvent`: Raw usage events.
  - `BillingMeterWindow`: Aggregated usage windows synced to Stripe.

## Inter-Process Communication

1. **Dashboard <-> Database:** The Next.js API routes interact directly with Mongoose models for read/write operations relating to UI state (e.g., fetching agencies, updating CRM notes).
2. **Dashboard <-> Workflow Engine (Internal):** For actions that require strict concurrency or external API interaction (like sending a WhatsApp message), the Dashboard API makes HTTP calls to the Workflow Engine's internal routes using a Pre-Shared Key (PSK).
3. **Workflow Engine <-> Redis:** 
   - Uses `ioredis` for Pub/Sub (SSE backplane for the inbox).
   - Uses Redis for fast, atomic usage counters.
   - Uses BullMQ on Redis for delaying workflow execution.
   - Uses Redlock on Redis to ensure webhooks process sequentially per conversation.
4. **Workflow Engine <-> MessagingProvider:** Makes REST HTTP calls to MessagingProvider to trigger sends, fetch QR codes, and read profiles. Receives HTTP Webhooks from MessagingProvider for inbound events.