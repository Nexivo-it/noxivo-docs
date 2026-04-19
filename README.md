# Nexivo: Enterprise WhatsApp SaaS

High-availability, multi-tenant WhatsApp automation platform with headless DAG orchestration, RAG-enabled AI Personas, and Lumina-tier visual building.

## Workspace Architecture

This repository uses a `pnpm` workspace to maintain strict boundaries between customer-facing apps, backend internal logic, and infrastructure utilities.

```text
apps/
  dashboard/          # Next.js 15: Unified Agency & Tenant management
  workflow-engine/    # Fastify: Headless DAG execution & messaging state
packages/
  contracts/          # Shared Zod schemas & CompiledDag validation
  database/           # Mongoose models & atomic persistence
  messaging-client/        # Infrastructure: Dynamic MessagingProvider cluster allocation
```

- **Infrastructure**: Remote MessagingProvider + Dockerized Backend (Engine, Mongo, Redis).
- **Hosting**: Netlify (Dashboard, Admin, Landing).

### Common Commands
- `pnpm dev` - Start local development stack.
- `docker compose up -d` - Start production backend locally.
- `pnpm build` - Full workspace build.

## Immediate Next Step

If you are starting on a new machine:

1. Run `pnpm install` in the repo root.
2. Read, in order:
   - [`AGENTS.md`](/Users/salmenkhelifi/Developer/messaging%20/noxivo-saas/AGENTS.md)
   - [`TODO.md`](/Users/salmenkhelifi/Developer/messaging%20/noxivo-saas/TODO.md)
   - [`SESSION_HANDOFF.md`](/Users/salmenkhelifi/Developer/messaging%20/noxivo-saas/SESSION_HANDOFF.md)
3. Verify repo gates:
   - `pnpm test`
   - `pnpm build`
   - `pnpm lint`
4. Continue from the “Current Focus / Next Step” section in `SESSION_HANDOFF.md`.
