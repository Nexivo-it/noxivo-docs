# UI Screen Inventory

The `apps/dashboard` is a Next.js App Router application utilizing a custom "Lumina" design system defined in `tokens.css`.

## Public / Auth Screens
- `/[agencySlug]/auth/login` - Branded login page.
- `/[agencySlug]/auth/signup` - Branded signup page, handles agency invitations.

## Dashboard App (`/dashboard/...`)
- `/dashboard` - Overview statistics.
- `/dashboard/settings` - Tenant settings, specifically the WhatsApp connection state. Shows "Provisioning", the QR Code, or a rich connected Profile Card based on the MessagingProvider session status.
- `/dashboard/conversations` - The Team Inbox.
  - Left pane: Conversation list.
  - Middle pane: Message thread (outbound bubbles colored by brand token, delivery tick marks). Bottom message composer pill (input + attachments).
  - Right pane (collapsible): CRM Profile sidebar (tags, owner, timeline, notes).
- `/dashboard/agencies` - Platform Admin view listing all agencies.
- `/dashboard/agency` - Agency Admin view for agency settings/branding.
- `/dashboard/team` - Team member management and invitations.
- `/dashboard/tenants` - Management of client tenants under an agency.
- `/dashboard/workflows` - (In progress) Visual editor for DAG workflows.

## Key UI Components
- `DashboardShell`: The main layout wrapper with a sidebar and top header. Handles responsive padding and mobile layouts.
- `ThemeToggle`: Manages light/dark mode.
- `TeamInboxCrmPanel`: The right-side collapsible CRM panel in the inbox.