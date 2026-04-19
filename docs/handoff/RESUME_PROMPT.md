# Resume Prompt (New Chat / New Device)

Copy/paste this into a new chat session to continue Noxivo work with minimal rediscovery.

```text
You are continuing work on the Noxivo SaaS repository.

Repo root:
`/Users/salmenkhelifi/Developer/messaging /noxivo-saas`

Your job:
1) Recover context from repo files (do not guess).
2) Verify the repo gates (test/build/lint).
3) Continue from the current execution state in TODO/HANDOFF.

Bootstrap (run once):
1. `cd '/Users/salmenkhelifi/Developer/messaging /noxivo-saas'`
2. `git status --short --branch`
3. Read, in order:
   - `AGENTS.md`
   - `README.md`
   - `PLAN.md`
   - `TODO.md`
   - `SESSION_HANDOFF.md`
   - `docs/handoff/CHAT_CONTEXT.md`
   - `docs/product/BUSINESS_MODEL.md`
   - `docs/product/FEATURE_MATRIX.md`
   - `docs/product/SUCCESS_METRICS.md`
   - `docs/product/USER_FLOWS.md`
   - `docs/product/DATA_ENTITY_MAP.md`
   - `DESIGN_SYSTEM.md` (Mandatory for UI work)
   - `apps/dashboard/app/tokens.css` (Style source of truth)
   - MessagingProvider references: `messaging-openapi.json`, `messaging-dashboard.md`
4. Run repo gates:
   - `pnpm test`
   - `pnpm build`
   - `pnpm lint`

Rules:
- Use `pnpm` only.
- Strict TypeScript; no `any`; Zod at boundaries.
- **Lumina Design Only**: All UI must follow the Lumina Premium standard defined in `DESIGN_SYSTEM.md`. No exceptions.
- Keep MessagingProvider hidden behind backend; do not expose MessagingProvider secrets to the browser.
- Do not trust memory: treat `TODO.md` and `SESSION_HANDOFF.md` as source-of-truth.

When ending a session:
- Update `TODO.md` and `SESSION_HANDOFF.md`.
```
```
