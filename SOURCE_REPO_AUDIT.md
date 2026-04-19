# Source Repo Audit

## Source

- Repository: [salmenkhelifi1/plate-forme-leads](https://github.com/salmenkhelifi1/plate-forme-leads)
- Local clone: `/Users/salmenkhelifi/Developer/messaging /plate-forme-leads`

## Baseline Shape

The source repository is a pnpm monorepo with these major units:

- `apps/api`
  - Express server
  - many broad routes: auth, crm, builder, messaging, workflows, settings, admin
  - old workflow node engine under `server/workflow-nodes`
- `apps/web`
  - Next.js dashboard
  - many unrelated verticals: website builder, booking, quotations, calendar, campaigns, documentation
- `apps/integrations`
  - separate integration-focused app
- `packages/database`
  - large Mongoose model set
- `packages/shared`
  - cross-cutting utilities
- `packages/ui`
  - shared UI components
- root noise
  - `.mongo-data`
  - document archives
  - duplicated plans
  - generated outputs
  - historical audit files

## Keep / Drop Decision

### Keep As Reference

- domain naming around:
  - agencies
  - conversations
  - workflows
  - workflow executions
  - roles and users
- MessagingProvider OpenAPI document:
  - `/Users/salmenkhelifi/Developer/messaging /plate-forme-leads/messaging-openapi.json`
- useful UX ideas from:
  - `apps/web/app/dashboard/agencies`
  - `apps/web/app/dashboard/inbox`
  - `apps/web/app/dashboard/workflows`

### Do Not Carry Forward

- `apps/api` as code
  - wrong backend framework for the target plan
  - too much legacy scope
- `apps/integrations`
  - superseded by plugin registry design
- `apps/web` as-is
  - too much unrelated product surface
- root-level archives and generated artifacts
- local `.mongo-data`
- duplicated planning documents from old sessions

## Structural Mapping

| Source | Target |
| --- | --- |
| `apps/api` | replaced by `apps/workflow-engine` |
| `apps/web` | selectively reimagined into `apps/dashboard` |
| `apps/integrations` | replaced by plugin engine inside workflow engine |
| `packages/database` | partially rebuilt around enterprise tenancy and MessagingProvider runtime |
| `packages/shared` | replace with explicit `packages/contracts` and focused utilities |
| `messaging-openapi.json` | kept directly in the new repo |

## Migration Principle

This is a controlled extraction, not an in-place refactor.

The new repo keeps only:

- the architecture plan
- the resumable handoff
- the new workspace scaffold
- the MessagingProvider OpenAPI reference

All application code is rebuilt against the new architecture instead of being transplanted from the source monolith.

