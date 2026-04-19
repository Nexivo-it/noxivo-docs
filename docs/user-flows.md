# User Flows

## 1. Authentication & Onboarding
1. User navigates to a branded URL (e.g., `acme.noxivo.com/auth/signup`).
2. The UI retrieves the agency's white-label settings (logo, colors) based on the domain/slug.
3. User signs up or accepts an invitation.
4. A secure session cookie is created.
5. User is redirected to `/dashboard`. Navigation options are tailored to their role (Platform Admin vs. Agency Member).

## 2. Connecting WhatsApp (Tenant)
1. Tenant user navigates to `/dashboard/settings`.
2. The dashboard checks for an active MessagingProvider session via the backend.
3. **If none exists:** The backend lazily allocates capacity on a shared MessagingProvider cluster and provisions a pending session. The UI shows "Provisioning".
4. Once ready, the dashboard fetches the QR code.
5. User scans the QR code with their WhatsApp mobile app.
6. The MessagingProvider cluster connects and fires a `session.status` webhook.
7. The `workflow-engine` updates the session status to `WORKING`.
8. The dashboard settings page polls/refreshes and replaces the QR code with the connected WhatsApp profile card.

## 3. Handling Inbound Messages (Team Inbox)
1. A customer sends a WhatsApp message to the connected number.
2. MessagingProvider cluster sends a webhook to `workflow-engine` (`/v1/webhooks/messaging`).
3. `messaging.route.ts` validates the metadata to find the correct Agency and Tenant.
4. Distributed lock is acquired to prevent race conditions.
5. Message is persisted to MongoDB (`InboxService`).
6. A `message.created` event is published to Redis.
7. The dashboard, listening to the SSE endpoint (`/api/team-inbox/events`), receives the event and instantly updates the UI in `/dashboard/conversations`.

## 4. Sending Outbound Messages
1. Agent types a message in `/dashboard/conversations` and clicks Send.
2. Dashboard `POST`s to `/api/team-inbox/[conversationId]/messages`.
3. Dashboard API delegates the request internally to `workflow-engine` (`/v1/internal/inbox/conversations/...`).
4. `workflow-engine` enforces an `Idempotency-Key` and acquires a lock.
5. `workflow-engine` calls the MessagingProvider API to send the text/media.
6. Upon success, the outbound message is persisted in MongoDB.
7. MessagingProvider later sends an ACK webhook, which updates the message delivery status in the database and broadcasts an SSE update to show blue ticks in the UI.