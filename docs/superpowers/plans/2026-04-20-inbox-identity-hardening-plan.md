# Inbox Identity Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate inbox conversation splits caused by `@lid` / `@c.us` identity divergence, then prove inbound and outbound paths both reuse the corrected canonical conversation identity.

**Architecture:** Harden the identity foundation first in `messaging-contact-identity.ts` and `InboxService`, then verify both inbound ingestion paths converge on that canonical identity, and finally prove outbound sends reuse the same identity without creating new threads. Preserve anonymous LIDs as valid canonical identities when no trustworthy phone mapping exists.

**Tech Stack:** Node.js, TypeScript, Fastify, Mongoose, Vitest.

---

## File structure

- Modify: `apps/workflow-engine/src/modules/inbox/messaging-contact-identity.ts`
  - tighten canonical-vs-anonymous identity rules and alias generation.
- Modify: `apps/workflow-engine/src/modules/inbox/inbox.service.ts`
  - ensure conversation alias merging/upsert behavior preserves one canonical conversation.
- Modify: `apps/workflow-engine/src/modules/inbox/messaging-sync.service.ts`
  - ensure sync ingestion uses the hardened identity result consistently.
- Modify: `apps/workflow-engine/src/modules/webhooks/messaging.route.ts`
  - ensure realtime webhook ingestion uses the same identity result consistently.
- Modify: `apps/workflow-engine/src/routes/v1/messages.routes.ts`
  - ensure outbound route targets canonical identity safely and does not create a split.
- Modify if needed: `apps/workflow-engine/src/modules/inbox/internal-message.service.ts`
  - only if outbound persistence needs a tiny identity-aware adjustment.

- Test anchors:
  - `apps/workflow-engine/test/inbox.service.test.ts`
  - `apps/workflow-engine/test/messaging-inbox-sync.service.test.ts`
  - `apps/workflow-engine/test/messaging-webhook-route.test.ts`
  - `apps/workflow-engine/test/messages-route.test.ts`
  - `apps/workflow-engine/test/internal-inbox-route.test.ts`

---

### Task 1: Harden canonical identity resolution for mapped and anonymous LIDs

**Files:**
- Modify: `apps/workflow-engine/src/modules/inbox/messaging-contact-identity.ts`
- Test: `apps/workflow-engine/test/messaging-inbox-sync.service.test.ts`

- [ ] **Step 1: Write the failing tests for mapped and anonymous LID cases**

In `apps/workflow-engine/test/messaging-inbox-sync.service.test.ts`, add two focused cases next to the existing `canonicalizes @lid recent chats onto a single @c.us conversation` test.

First test: mapped LID should prefer `@c.us` canonical identity.

```ts
it('prefers a phone-backed canonical identity when WAHA resolves a lid to pn', async () => {
  const { agencyId, tenantId } = await seedBinding();
  process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'messaging-token';

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.includes('/chats/overview?')) {
      return new Response(JSON.stringify([
        {
          id: '15550009999@lid',
          name: 'Mapped Lid',
          lastMessage: { body: 'hello', timestamp: 1710000000, fromMe: false },
          _chat: { unreadCount: 1 }
        }
      ]), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (url.endsWith('/api/tenant-main/contacts/15550009999%40lid')) {
      return new Response(JSON.stringify({ id: '15550009999@lid', name: 'Mapped Lid' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (url.endsWith('/api/tenant-main/lids/15550009999')) {
      return new Response(JSON.stringify({ lid: '15550009999@lid', pn: '15550009999@c.us' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  const service = new MessagingInboxSyncService();
  await service.syncRecentChats({ agencyId, tenantId, limit: 20 });

  const conversation = await ConversationModel.findOne({ tenantId }).lean().exec();
  expect(conversation?.contactId).toBe('15550009999@c.us');
  expect(conversation?.metadata).toEqual(expect.objectContaining({
    messagingCanonicalContactId: '15550009999@c.us',
    messagingAliases: expect.arrayContaining(['15550009999@lid', '15550009999@c.us'])
  }));
});
```

Second test: anonymous LID should remain LID canonical.

```ts
it('keeps an anonymous lid as canonical when WAHA cannot resolve a phone mapping', async () => {
  const { agencyId, tenantId } = await seedBinding();
  process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN = 'messaging-token';

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.includes('/chats/overview?')) {
      return new Response(JSON.stringify([
        {
          id: '50805738631354@lid',
          name: 'Anonymous',
          lastMessage: { body: 'hello', timestamp: 1710000000, fromMe: false },
          _chat: { unreadCount: 1 }
        }
      ]), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (url.endsWith('/api/tenant-main/contacts/50805738631354%40lid')) {
      return new Response(JSON.stringify({ id: '50805738631354@lid', name: 'Anonymous' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (url.endsWith('/api/tenant-main/lids/50805738631354')) {
      return new Response(JSON.stringify({ lid: '50805738631354@lid', pn: null, phone: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  const service = new MessagingInboxSyncService();
  await service.syncRecentChats({ agencyId, tenantId, limit: 20 });

  const conversation = await ConversationModel.findOne({ tenantId }).lean().exec();
  expect(conversation?.contactId).toBe('50805738631354@lid');
  expect(conversation?.metadata).toEqual(expect.objectContaining({
    messagingCanonicalContactId: '50805738631354@lid',
    messagingAliases: expect.arrayContaining(['50805738631354@lid'])
  }));
});
```

- [ ] **Step 2: Run the focused sync test file to verify the new cases fail first**

Run:

```bash
pnpm --filter @noxivo/workflow-engine exec vitest run test/messaging-inbox-sync.service.test.ts
```

Expected: FAIL until the identity resolver distinguishes mapped-vs-anonymous LID behavior correctly.

- [ ] **Step 3: Implement the minimal canonical identity changes**

In `apps/workflow-engine/src/modules/inbox/messaging-contact-identity.ts`, keep the current alias-building behavior but make the canonical-contact decision explicit.

The key logic should read like this:

```ts
const phoneFromLid = typeof phoneByLid?.pn === 'string'
  ? extractPhoneDigits(phoneByLid.pn)
  : typeof phoneByLid?.phone === 'string'
    ? extractPhoneDigits(phoneByLid.phone)
    : null;

const numberFromPayload = typeof contactPayload?.number === 'string'
  ? extractPhoneDigits(contactPayload.number)
  : null;

const canonicalPhone = numberFromPayload
  ?? phoneFromLid
  ?? (rawContactId.endsWith('@c.us') ? rawDigits : null);

const canonicalContactId = canonicalPhone
  ? `${canonicalPhone}@c.us`
  : rawContactId;
```

Keep alias generation inclusive:

```ts
contactAliases: buildMessagingAliasCandidates([
  rawContactId,
  contactIdFromPayload,
  canonicalContactId,
  lidFromPhone,
  typeof phoneByLid?.pn === 'string' ? phoneByLid.pn : undefined,
  typeof phoneByLid?.phone === 'string' ? phoneByLid.phone : undefined,
  rawDigits
])
```

Do not force `@c.us` when `canonicalPhone` is `null`.

- [ ] **Step 4: Re-run the sync test file and confirm it passes**

Run:

```bash
pnpm --filter @noxivo/workflow-engine exec vitest run test/messaging-inbox-sync.service.test.ts
```

Expected: PASS, with mapped LIDs canonicalizing to `@c.us` and anonymous LIDs staying canonical as `@lid`.

- [ ] **Step 5: Commit if the user explicitly asks for a commit later**

```bash
git add apps/workflow-engine/src/modules/inbox/messaging-contact-identity.ts apps/workflow-engine/test/messaging-inbox-sync.service.test.ts
git commit -m "fix(inbox): preserve canonical lid identity rules"
```

---

### Task 2: Prove inbound webhook and sync both converge on one conversation identity

**Files:**
- Modify: `apps/workflow-engine/src/modules/inbox/inbox.service.ts`
- Modify if needed: `apps/workflow-engine/src/modules/inbox/messaging-sync.service.ts`
- Modify if needed: `apps/workflow-engine/src/modules/webhooks/messaging.route.ts`
- Test: `apps/workflow-engine/test/inbox.service.test.ts`
- Test: `apps/workflow-engine/test/messaging-webhook-route.test.ts`

- [ ] **Step 1: Write failing tests for merge reuse across inbound paths**

In `apps/workflow-engine/test/inbox.service.test.ts`, add a stronger alias-union test for an anonymous-first then mapped-later flow:

```ts
it('reuses the same conversation when a lid-first conversation later resolves to a canonical c.us identity', async () => {
  const agencyId = new mongoose.Types.ObjectId().toString();
  const tenantId = new mongoose.Types.ObjectId().toString();

  const inboxService = new InboxService();

  const firstWrite = await inboxService.recordMessage({
    agencyId,
    tenantId,
    contactId: '15550001111@lid',
    canonicalContactId: '15550001111@lid',
    rawContactId: '15550001111@lid',
    contactAliases: ['15550001111@lid'],
    role: 'user',
    content: 'first lid message'
  });

  const secondWrite = await inboxService.recordMessage({
    agencyId,
    tenantId,
    contactId: '15550001111@c.us',
    canonicalContactId: '15550001111@c.us',
    rawContactId: '15550001111@lid',
    contactAliases: ['15550001111@lid', '15550001111@c.us'],
    role: 'user',
    content: 'later canonicalized message'
  });

  const conversations = await ConversationModel.find({ tenantId }).lean().exec();
  expect(conversations).toHaveLength(1);
  expect(String(secondWrite.conversation._id)).toBe(String(firstWrite.conversation._id));
  expect(conversations[0]?.metadata).toEqual(expect.objectContaining({
    messagingCanonicalContactId: '15550001111@c.us',
    messagingAliases: expect.arrayContaining(['15550001111@lid', '15550001111@c.us'])
  }));
});
```

In `apps/workflow-engine/test/messaging-webhook-route.test.ts`, add a mixed-ingestion regression modeled after the existing webhook canonicalization test:

```ts
it('attaches a webhook inbound message to an existing canonicalized conversation instead of creating a duplicate', async () => {
  const { agencyId, tenantId } = await seedBinding();
  process.env.MESSAGING_PROVIDER_WEBHOOK_SECRET = 'webhook-secret';
  process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
  process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';

  const existingConversation = await ConversationModel.create({
    agencyId,
    tenantId,
    contactId: '15550001111@c.us',
    contactName: 'Alice Smith',
    contactPhone: '15550001111',
    status: 'open',
    unreadCount: 0,
    metadata: {
      messagingCanonicalContactId: '15550001111@c.us',
      messagingAliases: ['15550001111@c.us', '15550001111@lid']
    }
  });

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.endsWith('/api/tenant-main/contacts/15550001111%40lid')) {
      return new Response(JSON.stringify({ id: '15550001111@lid', number: '15550001111', name: 'Alice Smith' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (url.endsWith('/api/tenant-main/lids/15550001111')) {
      return new Response(JSON.stringify({ lid: '15550001111@lid', pn: '15550001111@c.us' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  const server = await buildServer({ logger: false });
  try {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/webhooks/messaging',
      headers: { 'x-messaging-webhook-secret': 'webhook-secret' },
      payload: {
        event: 'message',
        session: 'tenant-main',
        payload: {
          id: 'wamid-webhook-merge-1',
          from: '15550001111@lid',
          to: '15550002222@c.us',
          fromMe: false,
          body: 'hello from webhook merge',
          ack: 0,
          ackName: 'PENDING'
        }
      }
    });

    expect(response.statusCode).toBe(202);

    const conversations = await ConversationModel.find({ tenantId }).lean().exec();
    const message = await MessageModel.findOne({ providerMessageId: 'wamid-webhook-merge-1' }).lean().exec();

    expect(conversations).toHaveLength(1);
    expect(conversations[0]?._id.toString()).toBe(existingConversation._id.toString());
    expect(message?.conversationId.toString()).toBe(existingConversation._id.toString());
  } finally {
    await server.close();
  }
});
```

The assertion must explicitly check:

```ts
const conversations = await ConversationModel.find({ tenantId }).lean().exec();
expect(conversations).toHaveLength(1);
expect(messages[0]?.conversationId.toString()).toBe(conversations[0]?._id.toString());
```

- [ ] **Step 2: Run the inbound-focused test files to prove they fail first**

Run:

```bash
pnpm --filter @noxivo/workflow-engine exec vitest run test/inbox.service.test.ts test/messaging-webhook-route.test.ts
```

Expected: FAIL until the merge/upsert logic consistently reuses the canonical conversation.

- [ ] **Step 3: Implement the minimal inbound merge changes**

In `apps/workflow-engine/src/modules/inbox/inbox.service.ts`, keep reuse centered on canonical contact id + alias overlap.

The lookup/upsert behavior should preserve this rule:

```ts
const aliasCandidates = new Set([
  contactId,
  canonicalContactId,
  ...(contactAliases ?? [])
].filter((value): value is string => typeof value === 'string' && value.trim().length > 0));
```

When an existing conversation is found through alias overlap, normalize it onto the canonical identity without creating a new conversation row, and preserve the union of aliases:

```ts
metadata: {
  ...existingMetadata,
  messagingCanonicalContactId: canonicalContactId ?? contactId,
  messagingChatId: rawContactId ?? existingMetadata.messagingChatId ?? contactId,
  messagingAliases: Array.from(new Set([
    ...(existingMetadata.messagingAliases ?? []),
    ...aliasCandidates
  ]))
}
```

Only touch `messaging-sync.service.ts` or `messaging.route.ts` if one of them bypasses the canonical identity/upsert path.

- [ ] **Step 4: Re-run the inbound-focused tests and confirm they pass**

Run:

```bash
pnpm --filter @noxivo/workflow-engine exec vitest run test/inbox.service.test.ts test/messaging-webhook-route.test.ts
```

Expected: PASS, with webhook and sync writes converging on one canonical conversation.

- [ ] **Step 5: Commit if the user explicitly asks for a commit later**

```bash
git add apps/workflow-engine/src/modules/inbox/inbox.service.ts apps/workflow-engine/src/modules/inbox/messaging-sync.service.ts apps/workflow-engine/src/modules/webhooks/messaging.route.ts apps/workflow-engine/test/inbox.service.test.ts apps/workflow-engine/test/messaging-webhook-route.test.ts
git commit -m "fix(inbox): merge inbound aliases onto one conversation"
```

---

### Task 3: Verify outbound uses the canonical conversation identity without splitting threads

**Files:**
- Modify if needed: `apps/workflow-engine/src/routes/v1/messages.routes.ts`
- Modify if needed: `apps/workflow-engine/src/modules/inbox/internal-message.service.ts`
- Test: `apps/workflow-engine/test/messages-route.test.ts`
- Test: `apps/workflow-engine/test/internal-inbox-route.test.ts`

- [ ] **Step 1: Write the failing outbound regression tests**

In `apps/workflow-engine/test/messages-route.test.ts`, add a canonical-target regression for mapped identities.

```ts
it('sends through the canonical phone-backed identity when a lid-backed conversation has already been resolved to c.us', async () => {
  process.env.ENGINE_API_KEY = 'engine-key';
  process.env.MESSAGING_PROVIDER_BASE_URL = 'https://messaging.test';
  process.env.MESSAGING_PROVIDER_API_KEY = 'messaging-token';

  const agencyId = new mongoose.Types.ObjectId().toString();
  const tenantId = new mongoose.Types.ObjectId().toString();

  await MessagingSessionBindingModel.create({
    agencyId,
    tenantId,
    clusterId: new mongoose.Types.ObjectId(),
    sessionName: 'tenant-main',
    messagingSessionName: 'tenant-main',
    routingMetadata: {},
    status: 'active'
  });

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.endsWith('/api/sendText') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      expect(body.chatId).toBe('84961566302@c.us');
      return new Response(JSON.stringify({ id: 'wamid-outbound-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  const server = await buildServer({ logger: false });
  try {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/messages/send',
      headers: { 'x-api-key': 'engine-key' },
      payload: {
        to: '84961566302@lid',
        text: 'reply through canonical target',
        agencyId,
        tenantId
      }
    });

    expect(response.statusCode).toBe(200);
  } finally {
    await server.close();
  }
});
```

Add a true-anonymous-LID case in `apps/workflow-engine/test/internal-inbox-route.test.ts`:

```ts
it('keeps lid as the outbound target when the conversation is truly anonymous and has no phone mapping', async () => {
  const agencyId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const clusterId = new mongoose.Types.ObjectId();
  const conversationId = new mongoose.Types.ObjectId();

  await MessagingClusterModel.create({
    _id: clusterId,
    name: 'Primary MessagingProvider Cluster',
    region: 'eu-west-1',
    baseUrl: 'http://messaging.test',
    dashboardUrl: 'http://messaging.test/dashboard',
    swaggerUrl: 'http://messaging.test/docs',
    capacity: 10,
    activeSessionCount: 1,
    status: 'active',
    secretRefs: { webhookSecretVersion: 'v1' }
  });

  await MessagingSessionBindingModel.create({
    agencyId,
    tenantId,
    clusterId,
    sessionName: 'tenant-main',
    messagingSessionName: 'tenant-main',
    routingMetadata: {},
    status: 'active'
  });

  await ConversationModel.create({
    _id: conversationId,
    agencyId,
    tenantId,
    contactId: '50805738631354@lid',
    contactName: 'Anonymous',
    status: 'assigned',
    unreadCount: 0,
    metadata: {
      messagingCanonicalContactId: '50805738631354@lid',
      messagingChatId: '50805738631354@lid',
      messagingAliases: ['50805738631354@lid']
    }
  });

  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'wamid-anon-lid-1' }), {
    status: 201,
    headers: { 'content-type': 'application/json' }
  }));
  vi.stubGlobal('fetch', fetchMock);

  const server = await buildServer({ logger: false });
  try {
    const response = await server.inject({
      method: 'POST',
      url: `/v1/internal/inbox/conversations/${conversationId.toString()}/messages`,
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'send-anon-lid-1',
        'x-nexus-internal-psk': process.env.WORKFLOW_ENGINE_INTERNAL_PSK ?? ''
      },
      payload: {
        agencyId: agencyId.toString(),
        tenantId: tenantId.toString(),
        operatorUserId: 'user-1',
        content: 'reply to anonymous lid'
      }
    });

    expect(response.statusCode).toBe(200);

    const firstCall = fetchMock.mock.calls[0];
    const [, rawInit] = firstCall as unknown as [unknown, unknown];
    const init = (rawInit ?? {}) as RequestInit;
    const body = JSON.parse(String(init.body)) as { chatId: string };

    expect(body.chatId).toBe('50805738631354@lid');

    const conversations = await ConversationModel.find({ tenantId }).lean().exec();
    expect(conversations).toHaveLength(1);
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 2: Run the outbound-focused tests to verify they fail first**

Run:

```bash
pnpm --filter @noxivo/workflow-engine exec vitest run test/messages-route.test.ts test/internal-inbox-route.test.ts
```

Expected: FAIL until outbound target selection and persistence fully respect canonical-vs-anonymous identity.

- [ ] **Step 3: Implement the minimal outbound target selection changes**

In the outbound path, choose send target from the resolved canonical model:

```ts
const sendTarget = canonicalContactId?.endsWith('@c.us')
  ? canonicalContactId
  : rawContactId?.endsWith('@lid')
    ? rawContactId
    : contactId;
```

Persist the outbound message with both canonical and raw identifiers so the same conversation is reused:

```ts
await inboxService.recordMessage({
  agencyId,
  tenantId,
  contactId: canonicalContactId ?? sendTarget,
  canonicalContactId: canonicalContactId ?? sendTarget,
  rawContactId: rawContactId ?? sendTarget,
  contactAliases,
  role: 'assistant',
  content: text,
  providerMessageId,
  deliveryStatus: 'sent'
});
```

Do not force anonymous LID conversations into `@c.us` when there is no trustworthy mapping.

- [ ] **Step 4: Re-run the outbound-focused tests and confirm they pass**

Run:

```bash
pnpm --filter @noxivo/workflow-engine exec vitest run test/messages-route.test.ts test/internal-inbox-route.test.ts
```

Expected: PASS, with canonical phone-backed sends using `@c.us` and anonymous LID conversations staying LID-backed.

- [ ] **Step 5: Run the combined inbox hardening verification set**

Run:

```bash
pnpm --filter @noxivo/workflow-engine exec vitest run test/inbox.service.test.ts test/messaging-inbox-sync.service.test.ts test/messaging-webhook-route.test.ts test/messages-route.test.ts test/internal-inbox-route.test.ts
pnpm --filter @noxivo/workflow-engine lint
```

Expected:
- all targeted workflow-engine inbox tests PASS
- workflow-engine lint/typecheck PASS

- [ ] **Step 6: Commit if the user explicitly asks for a commit later**

```bash
git add apps/workflow-engine/src/modules/inbox/messaging-contact-identity.ts apps/workflow-engine/src/modules/inbox/inbox.service.ts apps/workflow-engine/src/modules/inbox/messaging-sync.service.ts apps/workflow-engine/src/modules/webhooks/messaging.route.ts apps/workflow-engine/src/routes/v1/messages.routes.ts apps/workflow-engine/src/modules/inbox/internal-message.service.ts apps/workflow-engine/test/inbox.service.test.ts apps/workflow-engine/test/messaging-inbox-sync.service.test.ts apps/workflow-engine/test/messaging-webhook-route.test.ts apps/workflow-engine/test/messages-route.test.ts apps/workflow-engine/test/internal-inbox-route.test.ts
git commit -m "fix(inbox): unify lid and phone identities"
```

---

## Self-review

### Spec coverage
- Canonical identity for mapped vs anonymous LIDs: covered in Task 1.
- Inbound convergence across webhook and sync: covered in Task 2.
- Outbound reuse of canonical conversation identity: covered in Task 3.
- No UI redesign or transport replacement: preserved as non-goals.

### Placeholder scan
- No `TBD`, `TODO`, or “implement later” markers remain.
- Each task includes concrete file paths, code snippets, and commands.

### Type consistency
- Canonical identity vocabulary is consistent across tasks: `canonicalContactId`, `rawContactId`, `contactAliases`, `messagingChatId`.
- The mapped-vs-anonymous distinction remains consistent from Task 1 through Task 3.
