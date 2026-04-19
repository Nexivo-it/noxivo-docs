# Webhook Inbox Sources Design

## Overview
Noxivo already has a working inbox core for WhatsApp: webhook ingestion, message persistence, conversation threading, delivery-state tracking, and realtime updates into the dashboard. This design extends that inbox so tenants can configure multiple named webhook sources that behave like first-class inbox channels alongside WhatsApp.

The goal is not to build a second inbox. The goal is to make the existing inbox channel-aware so WhatsApp and webhook conversations can coexist in one operator workflow while staying clearly distinguishable in settings, threading, filters, and message delivery behavior.

## Goals
- Add a settings surface where each tenant can create multiple named webhook inbox sources.
- Let external systems send inbound messages into the inbox through a Noxivo webhook endpoint.
- Let operators send outbound replies from the inbox to a source-specific outbound webhook URL.
- Visually distinguish WhatsApp conversations from webhook conversations in the inbox.
- Show the configured webhook name in the inbox thread and list.
- Thread webhook conversations by contact id, but keep the same contact id separate across different named webhook sources.
- Add local archive behavior so selected contacts leave the main inbox and move into an Archived view.
- Preserve existing inbox guarantees: persistence, realtime updates, idempotent writes, and delivery-state visibility.

## Non-Goals
- Do not build a separate webhook-only inbox UI.
- Do not merge conversations across different webhook sources automatically.
- Do not make archive a remote blocking command against the external chatbot or website.
- Do not require external systems to use WhatsApp-shaped payloads.
- Do not remove or weaken the current WhatsApp inbox behavior.

## Approved Product Decisions
- Tenants can create **multiple named webhook sources**.
- Archived contacts move into a dedicated **Archived** inbox view rather than being deleted or ignored.
- Each webhook source has **separate inbound and outbound URLs/flows**.
- The same `contactId` coming from different webhook sources must create **separate conversations**.

## Architecture

### One Inbox Core, Multiple Channel Types
The inbox remains a single system built on the existing `Conversation` and `Message` persistence model. WhatsApp and webhook traffic both write into that shared core.

To support multiple channels safely, every conversation and message must carry channel identity:
- `channelType`: `whatsapp | webhook`
- `channelInstanceId`: the concrete source instance
  - WhatsApp: session binding or equivalent messaging binding identity
  - Webhook: webhook source configuration id
- `channelDisplayName`: human-readable label shown in the inbox
  - WhatsApp: existing session/account label or a stable default like `WhatsApp`
  - Webhook: configured source name such as `Website Chatbot`

This keeps all inbox behavior unified while letting the UI and routing layer clearly identify which channel owns a thread.

### Threading Principle
Today, the canonical conversation uniqueness is effectively tenant + contact id. That is too narrow for multi-source webhook inboxing.

Thread uniqueness must become source-aware:
- WhatsApp conversation key: tenant + `whatsapp` + binding/session identity + contact id
- Webhook conversation key: tenant + `webhook` + webhook source id + contact id

This means:
- the same contact on WhatsApp and webhook never collide
- the same `contactId` on two webhook sources never collide
- operators always reply back through the same source that originated the thread

### Source-Aware Metadata
Message metadata should continue carrying source information, but the source must become structured enough to support the UI and downstream routing cleanly.

At minimum, message/conversation metadata should expose:
- `channelType`
- `channelInstanceId`
- `channelDisplayName`
- channel-native contact identity fields
  - webhook: external `contactId`, optional `contactName`
  - WhatsApp: current canonical/contact alias metadata

The dashboard already surfaces `messageSource` from message metadata. This design extends that path so the UI can render meaningful channel badges instead of a raw internal source string.

## Webhook Source Configuration

### Settings UX
Add a new settings section for **Webhook Inbox Sources**.

Each source entry should support:
- `name` — required, shown in inbox and filters
- `status` — active or disabled
- inbound secret/auth configuration
- outbound destination configuration
- optional descriptive notes for operators/admins

The UI should follow the existing integrations/settings pattern in the dashboard, but this source type is inbox-native rather than generic credentials-only plumbing.

### Configuration Shape
Each webhook source needs these core fields:
- `id`
- `agencyId`
- `tenantId`
- `name`
- `status` (`active | disabled`)
- generated inbound endpoint identity (`inboundPath` or equivalent source-bound route key)
- `inboundSecret` or equivalent auth material
- `outboundUrl`
- optional outbound auth headers/token
- audit timestamps (`createdAt`, `updatedAt`, optional `disabledAt`)

The config storage can reuse existing settings patterns, but it needs a first-class runtime identity because the inbox must thread and render against it. A dedicated model is the cleanest option if the current generic credential/config models become awkward for channel-specific indexing and lookup.

### Inbound Endpoint Shape
Each webhook source should map to a Noxivo-managed inbound endpoint, for example a route that resolves the source by id/secret and accepts an inbound message payload.

Required inbound payload fields:
- `contactId`
- `text` or other message content representation

Recommended inbound payload fields:
- `contactName`
- `externalMessageId`
- `timestamp`
- `metadata`

Noxivo should own the ingress contract. External systems should not need to mimic MessagingProvider webhook envelopes.

## Inbound Webhook Flow
1. External chatbot / website / remote system sends an HTTP request to the webhook source inbound endpoint.
2. Noxivo authenticates the request using the source configuration.
3. Noxivo resolves the webhook source record and stamps the event with:
   - `channelType = webhook`
   - `channelInstanceId = webhookSourceId`
   - `channelDisplayName = source.name`
4. Noxivo normalizes the webhook contact identity using `contactId`.
5. Noxivo upserts the conversation using the source-aware conversation key.
6. Noxivo persists the inbound message and publishes the same realtime inbox events the dashboard already consumes.
7. The dashboard inbox updates without requiring a separate webhook UI pipeline.

### Inbound Idempotency
Webhook sources should dedupe inbound writes when `externalMessageId` is provided. If no external id is provided, the system can fall back to a weaker bounded dedupe strategy, but the preferred contract is to require or strongly encourage an external message id for integrations that want exactly-once behavior.

## Outbound Reply Flow
1. Operator opens a webhook conversation in the standard inbox.
2. Operator sends a reply from the thread UI.
3. Noxivo persists the outgoing message in the thread first.
4. Noxivo resolves the conversation’s webhook source and sends the outbound payload to that source’s configured outbound URL.
5. Noxivo updates delivery state based on synchronous result and any later webhook-style confirmation flow if supported.

The outbound payload should include enough correlation for the remote system to map the reply back into its own session, for example:
- `sourceId`
- `sourceName`
- `conversationId`
- `contactId`
- `messageId`
- `text`
- `timestamp`

### Delivery Semantics
Webhook outbound delivery should match the operator expectations already established by WhatsApp:
- successful sends appear as delivered/sent according to the synchronous contract
- failed sends remain visible in the thread with a failed state
- retry logic can be added later without changing the thread model

## Inbox UI Design

### Visual Differentiation
The inbox must visibly distinguish channel origin.

Conversation list treatment:
- WhatsApp conversations show a `WhatsApp` source badge
- Webhook conversations show `Webhook · {sourceName}`

Thread/header/sidebar treatment:
- show source badge
- show webhook display name for webhook threads
- show external `contactId` for webhook conversations
- preserve current WhatsApp contact treatment for WhatsApp threads

This should be implemented with Lumina-standard semantic tokens and clear but lightweight source badges rather than introducing a second navigation area.

### Filters
Add source and archive-aware filters:
- `All`
- `WhatsApp`
- `Webhook`
- `Archived`

The filter behavior should remain local to the dashboard inbox query layer and not require separate endpoints unless query performance or route complexity demands it.

## Archive Behavior

### Product Meaning
Archive is a **local inbox visibility control**. It does not tell the external chatbot or remote system to stop accepting or sending messages.

### Required Behavior
- Archived contacts do not appear in the main inbox list.
- Archived contacts appear in an `Archived` view/filter.
- New inbound messages for archived contacts are still saved.
- New inbound messages for archived contacts stay inside the archived bucket rather than reappearing in the main inbox automatically.

This matches the user goal of hiding unwanted contacts from the active operator workflow without losing history.

### Scope of Archive State
Archive state should be source-aware, not just contact-aware.

That means:
- archiving a webhook conversation for `contactId=123` in `Website Chatbot` does not archive `contactId=123` in `Support Widget`
- archiving a webhook conversation does not archive the matching WhatsApp conversation

The cleanest semantic location is conversation-level archive state, because the inbox is already conversation-centric and the threading key is now source-aware.

## Data Model Implications

### Conversation
Conversation persistence must gain channel identity and archive-aware fields.

Required additions:
- `channelType`
- `channelInstanceId`
- `channelDisplayName`
- archive state (`isArchived` or status expansion with equivalent semantics)

Uniqueness/indexing should be updated so conversations are unique by tenant + source identity + contact identity rather than tenant + contact id only.

### Message
Message persistence should gain or normalize:
- `channelType`
- `channelInstanceId`
- `channelDisplayName`
- source-specific metadata for webhook outbound/inbound correlation

The dashboard-facing message DTO should expose enough data for rendering source badges without another round-trip.

### Webhook Source Configuration
Add a source configuration persistence model or equivalent first-class storage abstraction with tenant scoping and fast lookup by source id / auth material.

## Routes and Services

### Workflow Engine
Add a channel-specific inbound route/service for webhook inbox messages rather than forcing webhook traffic through the MessagingProvider route.

Responsibilities:
- authenticate inbound request
- resolve webhook source config
- normalize payload
- persist message and conversation
- publish realtime events

Add an outbound delivery service that sends operator replies to the configured outbound URL.

### Dashboard
Settings routes/pages must allow create, list, update, disable, and secret rotation for webhook sources.

Inbox routes must:
- include channel metadata in list and thread payloads
- support archive-aware filtering
- preserve current WhatsApp behavior unchanged

## Error Handling
- Disabled webhook sources reject new inbound traffic with a clear non-success response.
- Unknown or invalid secrets do not leak tenant/source information.
- Outbound delivery failures do not remove the operator’s message from the thread.
- Missing webhook source configuration should fail fast and be observable.
- Archive status must not be lost during realtime refresh or sync operations.

## Testing Strategy

### Backend
- creating/updating/listing webhook source settings
- inbound webhook message persistence for a named source
- source-aware conversation separation when two webhook sources share the same `contactId`
- outbound webhook reply dispatch to the configured outbound URL
- inbound idempotency using `externalMessageId`
- disabled source rejection
- archive-aware conversation filtering

### Dashboard
- conversation list shows WhatsApp vs `Webhook · {sourceName}` distinctly
- thread header/sidebar shows webhook source name and external contact id
- filters switch between all / WhatsApp / webhook / archived
- archived conversations leave the main inbox and appear in Archived
- inbound archived messages remain archived after realtime updates

### Regression Coverage
- existing WhatsApp inbox tests continue to pass unchanged
- existing realtime event flow continues to work for both channel types
- existing send path remains correct for WhatsApp threads

## Risks and Mitigations
- **Risk:** the current conversation uniqueness model is too narrow.
  - **Mitigation:** migrate to source-aware uniqueness before wiring webhook traffic.
- **Risk:** reusing generic config storage may make runtime source lookup awkward.
  - **Mitigation:** prefer a dedicated webhook source model if generic credentials/data-source abstractions fight the inbox use case.
- **Risk:** archive state could get overridden by sync/reload code paths that assume WhatsApp-only behavior.
  - **Mitigation:** make archive state local canonical conversation state and cover it with dashboard + engine regression tests.

## Recommended Implementation Direction
Use the existing inbox core and extend it with channel-aware conversation identity, a dedicated webhook source configuration model/surface, a new workflow-engine inbound/outbound webhook service, and archive-aware inbox filtering.

This is the smallest architecture change that fully supports the requested behavior without creating a second inbox system or weakening the current WhatsApp implementation.
