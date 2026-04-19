# Noxivo AGENTS.md

## Read This First

- Repo root: `/Users/salmenkhelifi/Developer/messaging/noxivo-saas`
- If you are resuming on a new machine OR starting a brand-new chat, run the bootstrap once:
  - `docs/handoff/RESUME_PROMPT.md`
- Read in this order before changing code:
  1. `README.md`
  2. `PLAN.md`
  3. `DESIGN_SYSTEM.md` for any dashboard/frontend work
  4. `TODO.md`
  5. `SESSION_HANDOFF.md`
  6. `docs/handoff/CHAT_CONTEXT.md`
  7. `docs/handoff/RAW_USER_HANDOFF_CONTEXT.md` (verbatim user handoff notes)
  8. `docs/product/BUSINESS_MODEL.md`
  9. `docs/product/FEATURE_MATRIX.md`
  10. `docs/product/SUCCESS_METRICS.md`
  11. `docs/product/USER_FLOWS.md`
  12. `docs/product/DATA_ENTITY_MAP.md`
  13. `SOURCE_REPO_AUDIT.md` only when old `plate-forme-leads` structure matters
- Read MessagingProvider local references when the task touches MessagingProvider behavior, dashboard proxying, sessions, or operator messaging:
  - `messaging-openapi.json`
  - `messaging-dashboard.md`
- Read MessagingProvider+n8n legacy template index only when mapping old n8n workflows to new backend workflows:
  - `docs/reference/messaging-n8n-templates/AI_INDEX.md`
- Quick reference documentation when starting fresh:
  - `HANDOFF.md` - Immediate state snapshot and how to resume
  - `docs/project-overview.md` - Product summary and feature status
  - `docs/system-architecture.md` - Apps, packages, and infrastructure
  - `docs/user-flows.md` - Step-by-step guides for key user journeys
  - `docs/data-map.md` - Database models and Zod contracts
- Treat `TODO.md` and `SESSION_HANDOFF.md` as the current execution state when they conflict with older plan text in `PLAN.md`.

## Non-Negotiable Repo Rules

- Use `pnpm` only.
- Keep the workspace split exactly as:
  - `apps/dashboard`
  - `apps/workflow-engine`
  - `packages/contracts`
  - `packages/database`
  - `packages/messaging-client`
- Do not reintroduce `apps/api`, `apps/web`, or `apps/integrations` from `plate-forme-leads`.
- Shared MessagingProvider clusters are the intended architecture. Do not regress to per-tenant MessagingProvider containers.
- TypeScript stays strict (`tsconfig.base.json` enables `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`).
- No `any`, `@ts-ignore`, placeholder production logic, or debug `console.log` in product code.
- Keep Zod schemas at boundary contracts.

## Real Workspace Shape

- Root workspace config is `pnpm-workspace.yaml` with only `apps/*` and `packages/*`.
- Root scripts live in `package.json`:
  - `pnpm dev` -> `pnpm -r dev`
  - `pnpm build` -> builds packages first, then `workflow-engine`, then `dashboard`
  - `pnpm test` -> `pnpm -r test`
  - `pnpm lint` -> `pnpm -r lint`
  - `pnpm db:seed` -> `tsx packages/database/scripts/seed-dev.ts`
  - `pnpm dev:auto` -> runs an ephemeral MongoDB + seed flow via `scripts/dev-launcher.ts`
- `pnpm lint` is a workspace TypeScript check, not ESLint. Package/app `lint` scripts run `tsc --noEmit`.

## Package and App Boundaries

- `apps/dashboard` is a Next.js 15 App Router app.
- `apps/workflow-engine` is a Fastify service started from `src/index.ts`; `/health` is defined in `src/server.ts`.
- Cross-app API surface from workflow-engine is intentionally tiny: `apps/workflow-engine/src/public-api.ts`.
- `packages/contracts`, `packages/database`, and `packages/messaging-client` build to `dist/` and expose package-root exports. Prefer package imports over reaching into package internals.
- One deliberate exception exists in dashboard dev/test wiring: dashboard aliases `@noxivo/workflow-engine` to `../workflow-engine/src/public-api.ts` in both `tsconfig.json` and `vitest.config.ts`.

## Commands You Will Actually Need

### Whole repo

```bash
pnpm install
pnpm test
pnpm build
pnpm lint
```

### Focused verification

```bash
pnpm --filter @noxivo/dashboard test
pnpm --filter @noxivo/dashboard build
pnpm --filter @noxivo/dashboard lint

pnpm --filter @noxivo/workflow-engine test
pnpm --filter @noxivo/workflow-engine build
pnpm --filter @noxivo/workflow-engine lint

pnpm --filter @noxivo/contracts build
pnpm --filter @noxivo/database build
pnpm --filter @noxivo/messaging-client build
```

### Single-test pattern

```bash
pnpm --filter @noxivo/dashboard test -- test/team-inbox-routes.test.ts
pnpm --filter @noxivo/workflow-engine test -- test/dag-executor.test.ts
```

## Testing and Dev Quirks

- Vitest is the test runner in both apps.
- Most model/service tests use `mongodb-memory-server`; expect focused tests to set `MONGODB_URI` and connect Mongoose explicitly.
- Dashboard Vitest runs with `fileParallelism: false`; do not assume dashboard tests are safe to parallelize.
- Default local Mongo URI falls back to `mongodb://localhost:27017/noxivo` in dashboard DB code and the seed script.
- `pnpm dev:auto` is convenience tooling, not a portable contract: `scripts/dev-launcher.ts` hardcodes `/opt/homebrew/bin/pnpm`. If that path is wrong on the machine, use manual commands instead of assuming the script is broken elsewhere.

## UI-Specific Rules (Lumina Standard)

- **Lumina-First Principle**: Every UI change must aim to "Wow" the user. Prioritize depth, premium glassmorphism, and Neural Glows. Avoid flat, basic designs.
- **Single Source of Truth**: All styling MUST reference `apps/dashboard/app/tokens.css`.
- **No Raw Values**: Never use raw hex codes (e.g., `#ffffff`) or non-semantic Tailwind classes (e.g., `bg-blue-500`) for brand or surface elements.
- **Tonal Stacking**: Use semantic surface tokens (`--surface-base` -> `--surface-section` -> `--surface-card`) to create hierarchy. Do not use heavy borders.
- **Mobile Excellence**: Ensure all touch targets are at least 44px. Use `backdrop-blur-md` for mobile overlays to Maintain premium feel on small screens.
- **Iconography**: Use `lucide-react` sparingly and consistently. Standard stroke width is 2px.
- **States**: Ship explicit interactive states (hover, active, focus) plus loading/empty states for every component.

## Session Hygiene

This repo must stay "handoff-safe". Anyone should be able to continue work after you stop, on another machine, without losing context.

### Start-of-Session (Run Once Per Chat)

- Run the bootstrap steps in `docs/handoff/RESUME_PROMPT.md` once.
- Confirm the current execution state from `TODO.md` + `SESSION_HANDOFF.md` before writing code.

### End-of-Session (Required)

If you changed code, docs, or repo instructions:

- Update `TODO.md`:
  - what you finished
  - what is next (single clear next action)
  - what commands still need to be run
- Update `SESSION_HANDOFF.md`:
  - concrete changes and file list
  - any new assumptions/env vars
  - any new risks or regressions
- If the "why/architecture" changed (not just code), also update:
  - `docs/handoff/CHAT_CONTEXT.md`

Keep handoff notes concrete:

- what changed
- what is in progress
- exact next step
- exact commands to verify
- blockers/assumptions
- files changed

## Multi-Dashboard Architecture

This repo supports multiple independent dashboards connecting to a single Workflow Engine.

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Dashboard Docker Compose | `docker-compose.dashboard.yml` | Separate dashboard deployment with own MongoDB/Redis |
| DashboardConfig Model | `packages/database/src/models/dashboard-config.ts` | Stores dashboard registration info, agency mappings, API keys |
| Dashboard Registry Service | `apps/workflow-engine/src/modules/dashboard-registry/` | Handles registration, agency listing |
| Dashboard Registry Routes | `apps/workflow-engine/src/routes/v1/dashboard-registry.routes.ts` | `POST /v1/internal/dashboard/register`, `GET /v1/internal/dashboard/agencies` |
| URL Context Setter | `apps/dashboard/components/url-agency-context-setter.tsx` | Reads agencyId from URL, validates, switches context |

### Verification Commands

```bash
# Verify workflow-engine TypeScript
pnpm --filter @noxivo/workflow-engine lint
pnpm --filter @noxivo/workflow-engine build

# Check Swagger spec (production)
curl https://api-workflow-engine.khelifi-salmen.com/json | jq '.paths | length'
# Expected: 20+ V1 routes exposed
```
