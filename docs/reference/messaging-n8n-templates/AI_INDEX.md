# AI Reference Index

This file is a compact map of the repository and the public website for this project.

Canonical sources:

- Website: https://messaging-n8n-templates.devlike.pro/
- GitHub repo: https://github.com/devlikeapro/messaging-n8n-templates

Scope:

- n8n workflow templates built for MessagingProvider
- supporting README docs, JSON workflow exports, and preview images
- site configuration files used by GitHub Pages

## Repository Overview

Root files:

- `README.md` - main project landing page and template catalog
- `MessagingProvider+n8n.png` - hero image used by the root README and website
- `_config.yml` - GitHub Pages/Jekyll configuration
- `CNAME` - custom domain configuration
- `favicon.ico` - site icon
- `.github/gh-team-labels.yml` - GitHub automation metadata for the repo

Template folders:

- `chatting-template/`
- `whatsapp-typebot/`
- `chatwoot/`
- `send-qr-code-to-email/`
- `send-bulk-messages/`
- `forward-all-text-messages-to-email/`
- `fetch-image-rotate-and-send-it-back/`
- `send-custom-http-request-to-messaging/`
- `restart-server-at-midnight/`
- `messaging-trigger-explanation/`

## Website Summary

The public website is a GitHub Pages mirror of the repo landing page.

It presents:

- the MessagingProvider + n8n integration overview
- how to import templates into n8n
- a catalog of the available workflows
- links back to GitHub and the MessagingProvider docs

Use the website for quick browsing and the repo files for the actual workflow JSON and setup details.

## Template Index

| Template | Folder | Main Files | Purpose |
| --- | --- | --- | --- |
| WhatsApp Bot | `chatting-template/` | `README.md`, `template.json`, `workflow.png` | Simple bot that replies `pong` to `ping` and returns an image for `image`. |
| WhatsApp Typebot Integration | `whatsapp-typebot/` | `README.md`, `typebot.json`, `template.json`, `typebot.png`, `workflow.png` | Connects Typebot, MessagingProvider, Postgres, and n8n to run a WhatsApp chatbot flow. |
| WhatsApp Chatwoot Integration | `chatwoot/` | `README.md`, multiple `.json` files, screenshots | Bidirectional integration between Chatwoot and WhatsApp via MessagingProvider and n8n. |
| Send WhatsApp QR code for authorization to Email | `send-qr-code-to-email/` | `README.md`, `template.json`, `workflow.png` | Sends the MessagingProvider QR code to email when the session enters `SCAN_QR_CODE`. |
| Send Bulk Messages API | `send-bulk-messages/` | `README.md`, `template.json`, `workflow.png` | Sends bulk WhatsApp messages and finishes with an email notification. |
| Forward WhatsApp text messages to email | `forward-all-text-messages-to-email/` | `README.md`, `template.json`, `workflow.png` | Forwards incoming text messages from WhatsApp to email. |
| Fetch image, Rotate and Send it back | `fetch-image-rotate-and-send-it-back/` | `README.md`, `template.json`, `workflow.png` | Fetches an incoming image, rotates it 180 degrees, and sends it back. |
| Send custom HTTP request to MessagingProvider API | `send-custom-http-request-to-messaging/` | `README.md`, `template.json`, `workflow.png` | Example workflow that sends a custom MessagingProvider API request, including a video reply to `video`. |
| Restart server at midnight | `restart-server-at-midnight/` | `README.md`, `template.json`, `workflow.png` | Calls the MessagingProvider server stop endpoint at midnight to restart the container. |
| MessagingProvider Trigger Explanation | `messaging-trigger-explanation/` | `README.md`, `template.json`, `workflow.png` | Explains what is hidden behind the MessagingProvider Trigger node. |

## Per-Template Notes

### `chatting-template/`

- Minimal chatbot example.
- Imports directly into n8n as `template.json`.
- Behavior:
  - `ping` -> `pong`
  - `image` -> send an image

### `whatsapp-typebot/`

- Two workflow artifacts:
  - `typebot.json` for Typebot
  - `template.json` for n8n
- Requires:
  - MessagingProvider API credentials
  - Typebot node configuration
  - Postgres credentials
  - running the migration block
- Supports buttons and file input patterns described in the README.

### `chatwoot/`

- Multi-workflow integration package.
- Files in the folder correspond to different Chatwoot/MessagingProvider sync workflows and migrations.
- Useful for bidirectional message handling and contact synchronization.

### `send-qr-code-to-email/`

- Focused on session provisioning.
- Sends the QR code when MessagingProvider is waiting for authentication.

### `send-bulk-messages/`

- Starts from a MessagingProvider Trigger and dispatches bulk sends.
- Ends by sending an email summary.

### `forward-all-text-messages-to-email/`

- Straightforward forwarding pipeline.
- Configures MessagingProvider plus SMTP/email nodes.

### `fetch-image-rotate-and-send-it-back/`

- Image-processing example.
- Demonstrates reading the incoming media, transforming it, and replying.

### `send-custom-http-request-to-messaging/`

- Shows a custom HTTP request pattern against the MessagingProvider API.
- Example behavior: reply with a video when the incoming message text is `video`.

### `restart-server-at-midnight/`

- Uses a time trigger to stop/restart the MessagingProvider container at midnight.
- Requires the workflow to be active.

### `messaging-trigger-explanation/`

- Documentation-only style template.
- Useful when inspecting how the trigger node behaves.

## Working Rules For Future AI Changes

- Prefer editing the template `README.md` alongside any `template.json` changes.
- Keep file names and folder names stable unless there is a strong reason to rename.
- Preserve the website mirror behavior in `README.md` and `_config.yml`.
- When adding a new template, update:
  - root `README.md`
  - this `AI_INDEX.md`
  - the template folder README
  - any site navigation or landing-page references

## Quick Start For AI

If you need to understand a template quickly:

1. Read the root `README.md` for the catalog entry.
2. Open the template folder `README.md`.
3. Inspect the `template.json` workflow export.
4. Use the PNG preview for the visual workflow layout.
5. If the template is `whatsapp-typebot/` or `chatwoot/`, check the extra JSON files in that folder too.
