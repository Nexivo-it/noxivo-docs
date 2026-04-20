# Inbox Identity Hardening Design

## Overview

The inbox currently has three tightly coupled concerns: contact identity resolution, inbound message attachment, and outbound reply targeting. The highest-leverage failure mode is identity splitting between `@lid`, `@c.us`, and related aliases, because once one human contact is represented by multiple conversation identities, inbound messages can land in different threads, outbound can target the wrong conversation anchor, and the UI appears inconsistent even when transport is functioning.

This design hardens the inbox by making contact identity a first-class, canonical model. The system should preserve the raw upstream identifiers for traceability, but it must resolve them into one stable conversation identity whenever the evidence supports that merge. The implementation should start with contact/LID hardening, then verify inbound behavior on top of that, and finally verify outbound behavior against the corrected identity model.

## Goals

- Eliminate duplicate conversations caused by `@lid` / `@c.us` / alias splits for the same person when the available evidence supports a merge.
- Preserve support for truly anonymous LIDs that cannot be reverse-mapped to a phone number.
- Make inbound webhook and sync paths attach to the same conversation identity resolution rules.
- Ensure outbound replies target the canonical conversation/contact identity selected by the same rules.
- Keep the inbox model auditable by storing canonical IDs together with raw upstream IDs and aliases.

## Non-Goals

- Do not redesign the dashboard inbox UI in this spec.
- Do not replace WAHA’s transport/session behavior.
- Do not assume every `@lid` can be converted to `@c.us`.
- Do not merge identities based on weak guesses or display names alone.

## Working Assumption

Because the user did not answer the last prioritization question before continuation, this design assumes the primary success criterion is:

> **Duplicate conversations for the same person caused by `@lid` / `@c.us` identity splits must disappear first.**

Inbound and outbound correctness are treated as downstream validations of that identity fix.

## Confirmed External Constraints (WAHA)

- WAHA supports real-time inbound via webhooks and can also surface history via chat/message APIs.
- `@lid` is a first-class identifier and may be the only stable identifier available for some contacts.
- `@lid` → phone mappings can be incomplete or unavailable depending on visibility/admin/contact state.
- Sending may work with `@lid`, but canonical phone-based `@c.us` remains preferable when a trustworthy mapping exists.
- Anonymous LIDs must remain usable even when they cannot be mapped to a phone.

These constraints mean the system must be able to operate with:
1. canonical phone-backed contacts,
2. canonical LID-backed contacts,
3. alias sets containing both.

## Core Design

### 1. Canonical Identity Model

The inbox should treat every conversation/contact identity as a tuple of:

- `canonicalContactId`
- `rawContactId`
- `messagingChatId`
- `contactAliases[]`

Rules:

- If WAHA and the local contact-resolution pipeline can confidently map a `@lid` to a phone-backed identifier, the canonical identity should prefer the stable phone-backed form.
- If no trustworthy mapping exists, the canonical identity must remain LID-backed.
- Raw IDs and aliases must be preserved even after canonicalization so future reconciliation can merge old and new traffic into the same conversation.

This is already partially present in the current code and should be strengthened rather than replaced.

### 2. Conversation Merge Policy

Conversation merging must happen only when there is strong evidence of sameness:

- exact canonical identity match,
- exact alias match,
- WAHA LID lookup that resolves to the same phone-backed identity,
- local contact-identity resolver returning the same canonical contact.

It must **not** merge on:

- display name alone,
- partial text match,
- non-normalized formatting without identity proof.

When a merge happens, the system should collapse the identity into one conversation and preserve the union of aliases so future inbound/outbound traffic resolves consistently.

### 3. Inbound Path Consistency

Inbound messages arrive through two paths:

- webhook ingestion,
- history/sync ingestion.

Both paths must use the same identity-resolution logic before calling message persistence. No inbound path should write directly to a conversation using only the raw incoming `from` value if a canonical/alias resolution is available.

The expected sequence is:

1. read raw sender/chat id from WAHA payload,
2. resolve canonical identity + aliases,
3. upsert conversation identity,
4. persist message against the resolved conversation,
5. publish inbox events.

### 4. Outbound Path Consistency

Outbound sends should choose the target identity from the same canonical model:

- prefer the best canonical send target for the conversation,
- preserve the original raw/chat identity on the stored outbound message,
- avoid creating a fresh conversation split just because send-time targeting chose `@c.us` while prior inbound arrived as `@lid`.

If a conversation is canonicalized to a phone-backed identifier, outbound should use that target when safe. If a contact is truly anonymous LID-only, outbound must keep using the LID identity instead of forcing a broken phone conversion.

### 5. True Anonymous LIDs

Anonymous LIDs are a required first-class case.

Behavior:

- they may remain canonical as `@lid`,
- they should still support inbound threading,
- they should still support outbound replies,
- the UI/backend should not treat “no phone mapping” as an error by itself.

This prevents the system from “fixing” duplicates by incorrectly discarding the only valid identity.

## Architecture Boundaries

### Main workflow-engine files

- `apps/workflow-engine/src/modules/inbox/messaging-contact-identity.ts`
  - canonical identity resolution, alias building, LID/phone mapping rules

- `apps/workflow-engine/src/modules/inbox/inbox.service.ts`
  - conversation identity upsert/merge and message persistence

- `apps/workflow-engine/src/modules/inbox/messaging-sync.service.ts`
  - history/sync ingestion path

- `apps/workflow-engine/src/modules/webhooks/messaging.route.ts`
  - realtime webhook ingestion path

- `apps/workflow-engine/src/modules/inbox/internal-message.service.ts`
  - outbound send persistence path

- `apps/workflow-engine/src/routes/v1/messages.routes.ts`
  - outbound API entrypoint

### Tests that should anchor the work

- `apps/workflow-engine/test/messaging-webhook-route.test.ts`
- `apps/workflow-engine/test/messaging-webhook-enterprise.test.ts`
- `apps/workflow-engine/test/messaging-inbox-sync.service.test.ts`
- `apps/workflow-engine/test/inbox.service.test.ts`
- `apps/workflow-engine/test/messages-route.test.ts`
- `apps/workflow-engine/test/internal-inbox-route.test.ts`

## Recommended Implementation Order

### Phase 1: Identity foundation

Strengthen the canonical identity + alias resolution behavior first, especially around:

- `@lid` + `@c.us` equivalence when provable,
- anonymous LID preservation when not provable,
- conversation alias-union updates.

### Phase 2: Inbound verification on top of identity

Once canonical identity behavior is explicit, verify that webhook and sync ingestion both converge to the same conversation identity for mixed `@lid` / `@c.us` traffic.

### Phase 3: Outbound verification on top of identity

After inbound is stable, verify outbound replies:

- reuse the canonical conversation,
- choose the correct send target,
- do not create new conversation splits.

## Test Strategy

### Identity tests

Add or extend tests to cover:

- `@lid` + mapped `@c.us` resolve to one canonical contact,
- alias union is preserved after merge,
- anonymous LID remains canonical as LID,
- weak evidence does not merge two conversations.

### Inbound tests

Add or extend tests to cover:

- webhook inbound on `@lid` followed by sync/history on `@c.us` lands in one conversation,
- sync/history on `@lid` followed by webhook on `@c.us` lands in one conversation,
- inbound event publishing still uses the merged conversation identity.

### Outbound tests

Add or extend tests to cover:

- outbound reply from a merged conversation uses canonical target without splitting the conversation,
- outbound to true anonymous LID remains LID-backed,
- persisted outbound message retains enough raw/canonical identity data for traceability.

## Risks

- Over-aggressive merging could collapse distinct identities incorrectly.
- Over-conservative merging could leave duplicate conversations unresolved.
- WAHA mapping incompleteness means the system must distinguish “unknown yet” from “not the same person.”
- Fixing only the UI or only one ingestion path would create the illusion of improvement while the underlying identity split remains.

## Expected Outcome

After this design is implemented:

- one real person should appear as one conversation whenever the available identity evidence supports that merge,
- anonymous LIDs should remain functional instead of being forced into broken phone-backed identities,
- inbound webhook and sync paths should converge on the same conversation,
- outbound replies should reuse the same canonical conversation identity instead of creating a parallel thread.
