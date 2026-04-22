# Core Architecture & Modules

The Noxivo Workflow Engine is a high-performance, modular system built with **Fastify**, **MongoDB**, **Redis**, and **BullMQ**.

## System Overview

The engine acts as the central intelligence hub for WhatsApp automation. It handles:
1.  **Messaging Lifecycle**: Ingesting messages, tracking delivery, and managing contact identities.
2.  **Workflow Execution**: Running complex DAG-based automations via BullMQ workers.
3.  **Agentic Memory**: Managing "Contact Facts" and hyper-contextual AI prompts.
4.  **Multi-Tenant Isolation**: Ensuring data security across different agencies and tenants.

---

## Core Technologies

### 1. Fastify (Web Framework)
We use Fastify for its extremely low overhead and powerful plugin system.
-   **Schema Validation**: Every route uses Zod or JSON Schema for strict I/O validation.
-   **Hooks**: Global hooks handle authentication, session validation, and logging.
-   **Plugins**: Modular logic is encapsulated in plugins (e.g., `api-auth`, `swagger`).

### 2. BullMQ & Redis (Queue System)
Asynchronous tasks and workflow steps are managed via BullMQ.
-   **Concurrency**: Workers scale horizontally to handle thousands of concurrent workflows.
-   **Durability**: Redis ensures that no message or workflow step is lost during system reboots.
-   **Affinity**: Session affinity ensures that specific WhatsApp sessions are pinned to the correct cluster nodes.

### 3. MongoDB (Database)
The source of truth for all persistent data.
-   **Mongoose**: We use Mongoose for structured modeling and validation.
-   **Shared Library**: The `@noxivo/database` package is shared across the entire monorepo.

---

## Module Structure

The engine code is organized into feature-based modules inside `src/modules/`:

| Module | Responsibility |
| :--- | :--- |
| `inbox` | Message ingestion, synchronization, and delivery tracking. |
| `agents` | Workflow execution, BullMQ workers, and AI action handlers. |
| `crm` | Contact profile management and "Agentic Memory" (facts). |
| `scaling` | Cluster management and session affinity logic. |
| `storage` | Media handling and S3 integration. |
| `catalog` | E-commerce integration and WhatsApp catalog sync. |

---

## Directory Map

-   `src/lib/`: Shared utility classes (e.g., `MessagingSessionService`, `Redis`).
-   `src/routes/`: Global API route definitions (organized by version).
-   `src/plugins/`: Fastify plugins for cross-cutting concerns.
-   `src/modules/`: Feature-specific logic, controllers, and services.
