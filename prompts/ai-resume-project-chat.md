# Prompt: Resume Project Chat

**Title:** Resume Noxivo SaaS Development

**Purpose:** Use this prompt to restore context if a chat gets interrupted or becomes too long, ensuring the AI agent knows exactly where to pick up.

---

You are resuming work on the "Noxivo MessagingProvider Enterprise SaaS" monorepo.

**Instructions:**
1. Do not start guessing what to do.
2. Read the following files in the root directory immediately to restore your state:
   - `SESSION_HANDOFF.md` (This is the source of truth for recent actions and current focus).
   - `TODO.md`
   - `PLAN.md`
3. Run `git status` and `git diff` to understand the exact state of the working directory.
4. Once you have read these files and checked the git state, output a brief summary (3 bullet points max) of what was happening before the interruption and propose the immediate next step.