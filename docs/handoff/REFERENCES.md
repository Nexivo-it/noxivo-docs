# Reference Repos and Re-clone Commands

This repo is intended to be self-contained. The following repositories were used as references during the chat and can be re-cloned at any time.

## MessagingProvider Documentation

- Repo: `https://github.com/devlikeapro/messaging-docs`
- Why: authoritative reference for MessagingProvider dashboard, sessions, events, webhooks, and security posture.
- Local copies already included in this repo:
  - `messaging-openapi.json`
  - `messaging-dashboard.md`

Re-clone:

```bash
git clone https://github.com/devlikeapro/messaging-docs.git
```

## MessagingProvider n8n Templates (Legacy Reference)

- Repo: `https://github.com/devlikeapro/messaging-n8n-templates`
- Why: legacy n8n workflows that informed the “replace n8n with backend” migration.
- Local copy included:
  - `docs/reference/messaging-n8n-templates/AI_INDEX.md`

Re-clone:

```bash
git clone https://github.com/devlikeapro/messaging-n8n-templates.git
```

## Source Baseline (Reference Only)

- Repo: `https://github.com/salmenkhelifi1/plate-forme-leads`
- Why: prior system baseline. Used only as reference, not migrated in place.
- Local audit included:
  - `SOURCE_REPO_AUDIT.md`

Re-clone:

```bash
git clone https://github.com/salmenkhelifi1/plate-forme-leads.git
```

## Other Legacy Logic References (Mentioned)

These were referenced in the original requirements but are not required to build/run Noxivo:

- `https://github.com/madani-whatsapp/Whatsapp-GHL-Integration.git`
- `https://github.com/DigitrendsSARL/USST.git`

Re-clone:

```bash
git clone https://github.com/madani-whatsapp/Whatsapp-GHL-Integration.git
git clone https://github.com/DigitrendsSARL/USST.git
```

## Local Workspace Note

The project was developed in a parent folder named `messaging ` (note the trailing space in the directory name on this machine).

The intention is that only `noxivo-saas/` needs to be moved to a new environment; any other repos can be re-cloned using the commands above.

Workspace cleanup performed on this machine:
- The extra repos were archived to: `/Users/salmenkhelifi/Developer/_archive_messaging_workspace_2026-04-12/`
- The parent `messaging ` folder now contains only `noxivo-saas/`.
