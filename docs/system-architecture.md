# System Architecture

Noxivo uses a modern, separated monorepo architecture managed by `pnpm workspaces`.

## High-Level Components

### 1. Dashboard (`apps/dashboard`)
- **Framework:** Next.js 15 (App Router).
- **Role:** The primary user interface for all roles (Platform Admin, Agency, Tenant).
- **Responsibilities:**
  - Authenticated user sessions.
  - White-label routing (e.g., `/[agencySlug]/...`).
  - Rendering the Team Inbox, Settings, Agency Management, and Workflow editor views.
  - Proxying secure requests to the MessagingProvider cluster.
- **Styling:** Tailwind CSS 4, utilizing the custom `Lumina Design System` via CSS variables (`tokens.css`).

### 2. Workflow Engine (`apps/workflow-engine`)
- **Framework:** Fastify.
- **Role:** The asynchronous processing and integration heart of the system.
- **Responsibilities:**
  - Receiving and verifying MessagingProvider webhooks.
  - Compiling React Flow JSON into executable DAGs.
  - Executing DAGs using a resumable state machine (backed by BullMQ for delays).
  - Aggregating usage metrics (Redis -> MongoDB).
  - Managing internal inbox message sends (handling WhatsApp API interactions safely).

### 3. Packages
- **`@noxivo/contracts`:** The boundary definition layer. Contains Zod schemas for all cross-service communication (auth, webhooks, plugin manifests, workflow nodes).
- **`@noxivo/database`:** The single source of truth for data access. Defines all Mongoose schemas and models.
- **`@noxivo/messaging-client`:** Encapsulates the HTTP logic for interacting with the external MessagingProvider clusters, including session allocation and status checking.

## Infrastructure Dependencies
- **MongoDB:** Primary datastore for relational and document data (Users, Agencies, Conversations, Messages, Workflows).
- **Redis:** Used for high-frequency usage metering counters, distributed locks (Redlock) for webhook concurrency, and Server-Sent Events (SSE) backplane for real-time inbox updates.
- **MessagingProvider (WhatsApp HTTP API):** External service clusters providing the actual connection to the WhatsApp network.
- **Stripe:** External billing provider.