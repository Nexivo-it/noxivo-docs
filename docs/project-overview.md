# Project Overview: Noxivo MessagingProvider Enterprise SaaS

## What is this project?
Noxivo is a B2B Software-as-a-Service platform designed for agencies to offer WhatsApp-based CRM, automation, and team inbox capabilities to their clients (tenants). It acts as an advanced, multi-tenant layer on top of MessagingProvider (WhatsApp HTTP API), allowing agencies to white-label the dashboard and manage multiple WhatsApp numbers and workflows centrally.

## Target Audience
1. **Platform Admins:** Manage agencies and platform-wide configurations.
2. **Agency Owners/Admins:** Resellers who manage their own clients (tenants), customize branding, and monitor billing.
3. **Tenant Users (Agents):** End-users who log in to manage their specific business's WhatsApp conversations, configure automation workflows, and view CRM data.

## Core Features (Implemented)
- **Multi-tier Tenancy:** Platform -> Agency -> Tenant hierarchy with white-labeling overrides.
- **Shared MessagingProvider Clusters:** Intelligent allocation of WhatsApp sessions across a pool of MessagingProvider instances, rather than requiring 1 MessagingProvider container per tenant.
- **Team Inbox:** Real-time chat interface mimicking WhatsApp Web, supporting text and media messages, assignment, CRM sidebars, and AI-assisted reply generation.
- **Workflow Engine:** A React Flow JSON to executed-DAG compiler. Workflows handle triggers, conditions, delays (via BullMQ), and plugin actions.
- **Dynamic Plugin Registry:** Extensible system for integrations (e.g., calendar booking) with strict Zod schema validation.
- **Usage Metering & Billing:** Redis-backed counters aggregating usage (messages, AI tokens) flushed to MongoDB and synced with Stripe.
- **Lumina Design System:** A premium, depth-focused UI applying glassmorphism and semantic color tokens across the Next.js dashboard.

## Missing or Pending Features
- While the backend supports a robust DAG, full UI integration of the React Flow visual editor in the dashboard may need further refinement.
- Ongoing UI polish and edge-case handling for the newly implemented Lumina Design System.
- Extensive end-to-end production deployment configurations (Docker Swarm/K8s manifests for the shared cluster setup) are not fully detailed in the current local-dev-heavy workspace.