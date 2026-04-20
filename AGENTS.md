# Noxivo AGENTS.md

## Essential Commands

**Workspace-wide** (run from repo root):
- `pnpm install` - Install dependencies
- `pnpm dev` - Start dashboard + workflow-engine in parallel
- `pnpm build` - Build packages → workflow-engine → dashboard
- `pnpm test` - Run all tests
- `pnpm lint` - TypeScript check (workspace tsc --noEmit)
- `pnpm db:seed` - Seed development database
- `pnpm dev:auto` - Ephemeral MongoDB + seed flow

**Filtered commands** (replace `@noxivo/<package>`):
- `pnpm --filter @noxivo/dashboard test` - Dashboard tests only
- `pnpm --filter @noxivo/workflow-engine lint` - Workflow-engine type check
- `pnpm --filter @noxivo/database build` - Database package build
- Single test: `pnpm --filter @noxivo/dashboard test -- test/file.test.ts`

## Workspace Structure

**Fixed boundaries** (do not deviate):
- `apps/dashboard/` - Next.js 15 App Router (agency/tenant management)
- `apps/workflow-engine/` - Fastify service (DAG execution & messaging state)
- `packages/contracts/` - Shared Zod schemas & CompiledDag validation
- `packages/database/` - Mongoose models & atomic persistence
- `packages/messaging-client/` - Dynamic MessagingProvider cluster allocation

**Strict prohibitions**:
- Never reintroduce `apps/api`, `apps/web`, or `apps/integrations`
- Never use per-tenant MessagingProvider containers (shared clusters only)
- Always use pnpm (no npm/yarn)

## Type Safety

- TypeScript strict mode: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` enabled
- **Zero tolerance**: No `any`, `@ts-ignore`, `@ts-expect-error`, or placeholder logic
- Keep Zod schemas at boundary contracts only
- Lint fails on type errors - fix them, don't suppress

## UI/Lumina Standard (Dashboard)

**Non-negotiables**:
- All styling references `apps/dashboard/app/tokens.css` (single source of truth)
- Never use raw hex (`#ffffff`) or non-semantic Tailwind (`bg-blue-500`) for brand/surface
- Use semantic surface tokens: `--surface-base` → `--surface-section` → `--surface-card`
- Lumina-First: Prioritize glassmorphism, Neural Glows, premium depth over flat designs
- Mobile: Touch targets ≥44px, use `backdrop-blur-md` for overlays
- Icons: `lucide-react` only, 2px stroke width
- States: Ship explicit hover/active/focus plus loading/empty for every component

## Testing Quirks

- Vitest is test runner for both apps
- Model/service tests often use `mongodb-memory-server`; focused tests may require explicit `MONGODB_URI`
- **Dashboard Vitest**: `fileParallelism: false` - do not assume safe to parallelize
- Default local Mongo URI: `mongodb://localhost:27017/noxivo` (fallback in DB code & seed script)
- `pnpm dev:auto` uses hardcoded `/opt/homebrew/bin/pnpm` - adjust if path differs

## Session Hygiene (MANDATORY)

**Start of session** (once per chat):
1. Run `docs/handoff/RESUME_PROMPT.md` bootstrap
2. Verify execution state from `TODO.md` + `SESSION_HANDOFF.md`

**End of session** (if you changed code/docs/repo instructions):
- Update `TODO.md`:
  - What you finished
  - What is next (single clear action)
  - What commands still need to run
- Update `SESSION_HANDOFF.md`:
  - Concrete changes and file list
  - New assumptions/environment variables
  - New risks/regressions
- If "why/architecture" changed: update `docs/handoff/CHAT_CONTEXT.md`

**Keep handoff notes concrete**:
- What changed
- What is in progress
- Exact next step
- Exact verification commands
- Blockers/assumptions
- Files changed

## Multi-Dashboard Architecture

This repo supports multiple independent dashboards connecting to one Workflow Engine:
- Dashboard Docker Compose: `docker-compose.dashboard.yml` (separate Mongo/Redis)
- DashboardConfig model: `packages/database/src/models/dashboard-config.ts`
- Dashboard Registry Service: `apps/workflow-engine/src/modules/dashboard-registry/`
- Dashboard Registry Routes: `POST /v1/internal/dashboard/register`, `GET /v1/internal/dashboard/agencies`
- URL Context Setter: `apps/dashboard/components/url-agency-context-setter.tsx` (reads agencyId from URL)

**Verification**:
- Workflow-engine TS: `pnpm --filter @noxivo/workflow-engine lint && pnpm --filter @noxivo/workflow-engine build`
- Swagger spec (prod): `curl https://api-workflow-engine.noxivo.app/json | jq '.paths | length'` (expect 20+ V1 routes)

## When in Doubt

1. Read `README.md` → `PLAN.md` → `DESIGN_SYSTEM.md` (for frontend) → `TODO.md` → `SESSION_HANDOFF.md`
2. For MessagingProvider tasks: also read `messaging-openapi.json` + `messaging-dashboard.md`
3. Treat `TODO.md` and `SESSION_HANDOFF.md` as current execution state when conflicting with `PLAN.md`
4. Preserve repo boundaries and type safety above all