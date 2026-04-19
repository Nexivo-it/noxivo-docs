# Noxivo noxivo Enterprise SaaS - Handoff

## Current Project State

Noxivo SaaS is a white-label, multi-tier B2B platform managing WhatsApp automation and team inboxes. It utilizes a shared MessagingProvider (WhatsApp HTTP API) cluster architecture.

The project has recently completed a massive overhaul and architectural shift from a previous monolithic structure to a monorepo containing a Next.js dashboard and a Fastify workflow engine.

**Status:** Major implementation tasks (1-13 from `PLAN.md`) are functionally complete in the local environment. This includes agency/tenant management, authentication, Team Inbox real-time sync, MessagingProvider session management, React Flow DAG compilation, and the Lumina Design System application.

**Immediate Next Step:**
The codebase has uncommitted changes (specifically `apps/dashboard/app/dashboard/conversations/page.tsx` and potentially others related to the recent auth/agency-management edits).

1. The developer needs to start the local services using `pnpm run dev:auto`.
2. Perform manual browser QA across `/dashboard/agencies`, `/dashboard/agency`, `/dashboard/team`, `/dashboard/tenants`, `/dashboard/settings`, and `/dashboard/conversations`.
3. Carefully review the `git diff` and split the uncommitted working tree into logical commits.

## Project Structure

- `apps/dashboard/`: Next.js 15 App Router (UI).
- `apps/workflow-engine/`: Fastify service (Webhooks, DAG execution, Background workers).
- `packages/contracts/`: Zod schemas (Shared types).
- `packages/database/`: Mongoose models (Data layer).
- `packages/messaging-client/`: WhatsApp API integration.

## Key Technologies

- **Monorepo:** pnpm workspaces
- **Frontend:** Next.js, Tailwind CSS v4, shadcn/ui, Lumina Design System
- **Backend:** Node.js, Fastify, BullMQ, Redis (ioredis)
- **Database:** MongoDB (Mongoose)

## How to Resume Work

1. Run `pnpm install`
2. Start the dev environment: `pnpm run dev:auto`
3. Check `git status` and review unstaged changes.
4. Refer to `SESSION_HANDOFF.md` for the exact granular history of the last coding session.
