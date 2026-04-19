# Gemini Skills & MCP Servers Index

This document serves as an index of all available Gemini skills and MCP servers configured for this environment. This makes it easier for future AI agents to discover, trigger, and utilize the full suite of available tools.

## 🛠️ MCP Servers

The following MCP (Model Context Protocol) servers are active and provide groups of tools to the agent:

### 1. Chrome DevTools (`mcp_chrome-devtools_*`)
Tools for browser automation, debugging, performance profiling, and testing.
- **Capabilities:** Navigate pages, evaluate scripts, capture screenshots/snapshots, extract network/console logs, run Lighthouse audits, and trace performance.

### 2. Context7 (`mcp_context7_*`)
Tools for retrieving up-to-date documentation and API references.
- **Capabilities:** Resolve library IDs and query official documentation for frameworks like React, Next.js, Prisma, Express, etc.

### 3. Dart & Flutter (`mcp_dart_*`)
Tools for Dart and Flutter development.
- **Capabilities:** Hot reload, connect to tooling daemon, analyze files, pub.dev search, format code, run tests, and inspect widget trees.

### 4. Firebase (`mcp_firebase_*`)
Tools for managing and deploying Firebase projects.
- **Capabilities:** Authentication, Firestore database operations (query, get, add, update, delete), Realtime Database, Cloud Functions logs, Storage downloads, Hosting, and Remote Config.

### 5. Google Workspace (`mcp_google-workspace_*`)
Tools for interacting with Google Drive, Docs, Sheets, Slides, Calendar, Gmail, and Chat.
- **Capabilities:** Search Drive, create/edit Docs, read/format Sheets, extract text/images from Slides, manage Calendar events, send/read Gmail, and manage Chat spaces/messages.

### 6. Kit Agents (`mcp_kit-agents_*`)
Tools for workflow orchestration, checkpoints, and multi-agent operations.
- **Capabilities:** Create/restore git checkpoints, save learnings, run complex workflows (cook, refactor, review, tdd), index codebase, and manage team sessions.

### 7. Maestro (`mcp_maestro_*`)
Tools for advanced project orchestration and subagent management.
- **Capabilities:** Initialize workspaces, create orchestration sessions, assess task complexity, validate plans, transition phases, and read agent/skill methodologies.

### 8. Stitch (`mcp_stitch_*`)
Tools for UI/UX design generation and design system management.
- **Capabilities:** Create/list projects, generate UI screens from text, apply design systems, and manage visual variants.

---

## 🧠 Gemini Skills

Skills are specialized instruction sets that change the agent's behavior for specific workflows. They can be triggered using the `activate_skill` tool.

### Core & Superpowers
- `using-superpowers`: The foundational skill enforcing skill usage.
- `brainstorming`: Used for exploring ideas before implementation.
- `writing-plans`: Used for creating multi-step implementation specs.
- `test-driven-development`: Used for TDD workflows.
- `systematic-debugging`: Structured approach to resolving bugs.
- `requesting-code-review` / `receiving-code-review`: Quality gates.
- `finishing-a-development-branch`: Merging and PR completion.
- `subagent-driven-development`: Managing independent tasks.

### Frontend, UI & Browser
- `frontend-ui-dark-ts`: Building dark-themed React apps with Tailwind.
- `chrome-devtools` / `chrome-devtools-cli`: Browser automation.
- `a11y-debugging`: Accessibility auditing.
- `debug-optimize-lcp`: Core Web Vitals and LCP optimization.
- `memory-leak-debugging`: JavaScript memory leak analysis.
- `claude-d3js-skill`: D3.js data visualization.

### Backend, Database & DevOps
- `database`: SQL/NoSQL design and migrations.
- `devops-deploy`: Docker, CI/CD, AWS, Terraform.
- `git-hooks-automation`: Husky, lint-staged, commitlint.
- `api-endpoint-builder`: REST API creation.
- `api-documentation`: OpenAPI spec generation.

### Security
- `security-audit`: Application vulnerability scanning.
- `api-security-testing` / `api-fuzzing-bug-bounty`: API hardening.
- `sqlmap-database-pentesting`: DB vulnerability checks.
- `snitch` / `snitch-pro`: Codebase security audits.

### Frameworks & Ecosystems
- **Odoo:** `odoo-module-developer`, `odoo-orm-expert`, `odoo-xml-views-builder`, `odoo-qweb-templates`, `odoo-ecommerce-configurator`, `odoo-accounting-setup`, `odoo-manufacturing-advisor`, etc.
- **Laravel:** `laravel-expert`, `laravel-security-audit`.
- **n8n:** `n8n-workflow-patterns`, `n8n-validation-expert`, `n8n-expression-syntax`, `n8n-code-javascript`.

### Automation & Scraping (Apify)
- `apify-ultimate-scraper`: Universal web scraping.
- `apify-lead-generation`, `apify-market-research`, `apify-ecommerce`.
- `apify-competitor-intelligence`, `apify-brand-reputation-monitoring`.

### Integrations
- `whatsapp-automation` / `whatsapp-cloud-api`: WhatsApp Business API.
- `github-automation` / `github-issue-creator` / `gitlab-automation`.
- `google-docs`, `google-sheets`, `google-slides`, `google-calendar`, `gmail`, `google-chat`.

### AI, ML & Agents
- `ai-ml`, `ai-agent-development`, `agent-orchestrator`.
- `gemini-api-dev` / `gemini-api-integration`.
- `agentic-actions-auditor`.
- `context7-mcp` / `context7-cli` / `find-docs`.

---
*Note for future agents: To use a skill, call `activate_skill(name="<skill-name>")` before beginning your task to load the specialized context.*