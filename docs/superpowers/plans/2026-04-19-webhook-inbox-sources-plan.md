# Webhook Inbox Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add named webhook inbox sources that can ingest/send messages through the existing inbox, render distinctly from WhatsApp, and support source-aware archived conversations.

**Architecture:** Extend the current inbox core instead of building a second channel pipeline. Make `Conversation` and `Message` source-aware, add a dedicated webhook source configuration model plus workflow-engine ingress/egress services, then teach dashboard settings and inbox routes/components to surface webhook names, filters, and local archive behavior.

**Tech Stack:** pnpm workspaces, Next.js App Router, Fastify, Vitest, Mongoose, Zod, Tailwind CSS 4, Lumina design tokens.

---

## File Structure

### New files
- `packages/database/src/models/webhook-inbox-source.ts` — tenant-scoped webhook source config model.
- `packages/contracts/src/webhook-inbox-source.ts` — Zod contracts for source config and inbound payloads.
- `apps/workflow-engine/src/modules/webhooks/webhook-inbox.route.ts` — inbound webhook handler for source-based inbox ingestion.
- `apps/workflow-engine/src/modules/inbox/webhook-outbound.service.ts` — outbound delivery for operator replies on webhook conversations.
- `apps/dashboard/app/api/settings/webhook-inbox-sources/route.ts` — list/create webhook source settings API.
- `apps/dashboard/app/api/settings/webhook-inbox-sources/[sourceId]/route.ts` — update/disable/rotate source settings API.
- `apps/workflow-engine/test/webhook-inbox-route.test.ts` — inbound webhook regression coverage.
- `apps/dashboard/test/settings-webhook-inbox-sources-route.test.ts` — settings route coverage.

### Modified files
- `packages/database/src/models/conversation.ts` — source-aware identity + archive fields.
- `packages/database/src/models/message.ts` — channel metadata for rendering and outbound correlation.
- `packages/database/src/models/index.ts` — export the new source model.
- `packages/contracts/src/inbox.ts` — channel-aware conversation/message DTOs.
- `packages/contracts/src/internal-inbox.ts` — outbound send payload/response fields for source-aware sends.
- `packages/contracts/src/index.ts` — export new webhook source contracts.
- `apps/workflow-engine/src/modules/inbox/inbox.service.ts` — source-aware upsert/query logic.
- `apps/workflow-engine/src/modules/inbox/internal-message.service.ts` — branch WhatsApp vs webhook outbound delivery.
- `apps/workflow-engine/src/server.ts` — register the webhook inbox route.
- `apps/dashboard/app/api/team-inbox/route.ts` — source/archive filtering in inbox list responses.
- `apps/dashboard/app/api/team-inbox/[conversationId]/messages/route.ts` — source-aware thread payloads and outbound send handling.
- `apps/dashboard/app/api/team-inbox/[conversationId]/actions/route.ts` — local archive/unarchive semantics.
- `apps/dashboard/app/dashboard/settings/integrations/integrations-client.tsx` — webhook source settings UI.
- `apps/dashboard/app/dashboard/inbox/page.tsx` — filter state for WhatsApp / Webhook / Archived.
- `apps/dashboard/components/team-inbox/chat-list.tsx` — source badges in the list.
- `apps/dashboard/components/team-inbox/chat-window.tsx` — source badge + webhook name/contact id in thread.
- `apps/dashboard/components/team-inbox/types.ts` — channel-aware frontend DTOs.
- `apps/workflow-engine/test/internal-inbox-route.test.ts` — outbound webhook thread coverage.
- `apps/workflow-engine/test/inbox.service.test.ts` — source-aware conversation identity coverage.
- `apps/dashboard/test/team-inbox-routes.test.ts` — inbox route behavior for source filters and archive.
- `apps/dashboard/test/inbox-pagination-realtime.test.tsx` — archived/webhook realtime preservation.
- `TODO.md` and `SESSION_HANDOFF.md` — repo-required session hygiene after implementation.

---

### Task 1: Make inbox persistence source-aware

**Files:**
- Create: `packages/database/src/models/webhook-inbox-source.ts`
- Modify: `packages/database/src/models/conversation.ts`
- Modify: `packages/database/src/models/message.ts`
- Modify: `packages/database/src/models/index.ts`
- Modify: `packages/contracts/src/inbox.ts`
- Create: `packages/contracts/src/webhook-inbox-source.ts`
- Modify: `packages/contracts/src/internal-inbox.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `apps/workflow-engine/test/inbox.service.test.ts`

- [ ] **Step 1: Write the failing persistence test**

```ts
it('keeps the same contactId separate across webhook sources and defaults archive to false', async () => {
  const sourceA = 'webhook-source-a';
  const sourceB = 'webhook-source-b';

  await inboxService.recordMessage({
    agencyId,
    tenantId,
    contactId: 'contact-123',
    contactName: 'Alice',
    role: 'user',
    content: 'hello from website',
    channelType: 'webhook',
    channelInstanceId: sourceA,
    channelDisplayName: 'Website Chatbot',
    source: 'webhook.inbound',
    timestamp: new Date('2026-04-19T08:00:00.000Z'),
  });

  await inboxService.recordMessage({
    agencyId,
    tenantId,
    contactId: 'contact-123',
    contactName: 'Alice',
    role: 'user',
    content: 'hello from support widget',
    channelType: 'webhook',
    channelInstanceId: sourceB,
    channelDisplayName: 'Support Widget',
    source: 'webhook.inbound',
    timestamp: new Date('2026-04-19T08:01:00.000Z'),
  });

  const conversations = await ConversationModel.find({ tenantId }).sort({ channelDisplayName: 1 }).lean();

  expect(conversations).toHaveLength(2);
  expect(conversations.map((conversation) => conversation.channelDisplayName)).toEqual([
    'Support Widget',
    'Website Chatbot',
  ]);
  expect(conversations.every((conversation) => conversation.isArchived === false)).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails for the right reason**

Run: `pnpm --filter @noxivo/workflow-engine exec vitest run test/inbox.service.test.ts -t "keeps the same contactId separate across webhook sources"`

Expected: FAIL because `recordMessage`/schemas do not yet accept `channelType`, `channelInstanceId`, `channelDisplayName`, or `isArchived`.

- [ ] **Step 3: Add the minimal source-aware schema and contract changes**

```ts
// packages/contracts/src/inbox.ts
export const InboxChannelTypeSchema = z.enum(['whatsapp', 'webhook']);

// packages/database/src/models/conversation.ts
channelType: { type: String, enum: ['whatsapp', 'webhook'], required: true, default: 'whatsapp' },
channelInstanceId: { type: String, required: true, default: 'default-whatsapp' },
channelDisplayName: { type: String, required: true, default: 'WhatsApp' },
isArchived: { type: Boolean, default: false },

ConversationSchema.index(
  { tenantId: 1, channelType: 1, channelInstanceId: 1, contactId: 1 },
  { unique: true, name: 'conversation_tenant_channel_contact_unique' },
);

// packages/database/src/models/message.ts
channelType: { type: String, enum: ['whatsapp', 'webhook'], required: true, default: 'whatsapp' },
channelInstanceId: { type: String, required: true, default: 'default-whatsapp' },
channelDisplayName: { type: String, required: true, default: 'WhatsApp' },

// packages/database/src/models/webhook-inbox-source.ts
const WebhookInboxSourceSchema = new Schema({
  agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true, trim: true },
  status: { type: String, enum: ['active', 'disabled'], default: 'active' },
  inboundPath: { type: String, required: true, unique: true },
  inboundSecretHash: { type: String, required: true },
  outboundUrl: { type: String, required: true },
  outboundHeaders: { type: Map, of: String, default: {} },
}, { timestamps: true });
```

- [ ] **Step 4: Update `InboxService.recordMessage()` to upsert by source-aware identity and re-run the test**

```ts
const conversation = await ConversationModel.findOneAndUpdate(
  {
    tenantId: input.tenantId,
    channelType: input.channelType,
    channelInstanceId: input.channelInstanceId,
    contactId: input.contactId,
  },
  {
    $setOnInsert: {
      agencyId: input.agencyId,
      contactId: input.contactId,
      contactName: input.contactName,
      channelType: input.channelType,
      channelInstanceId: input.channelInstanceId,
      channelDisplayName: input.channelDisplayName,
      isArchived: false,
    },
    $set: {
      contactName: input.contactName,
      lastMessageAt: input.timestamp,
      channelDisplayName: input.channelDisplayName,
    },
  },
  { upsert: true, new: true },
);
```

Run: `pnpm --filter @noxivo/workflow-engine exec vitest run test/inbox.service.test.ts -t "keeps the same contactId separate across webhook sources"`

Expected: PASS

- [ ] **Step 5: Build shared packages before moving on**

Run: `pnpm --filter @noxivo/contracts build && pnpm --filter @noxivo/database build`

Expected: both builds pass with the new channel/source fields exported cleanly.

---

### Task 2: Add inbound webhook source ingestion in the workflow engine

**Files:**
- Create: `apps/workflow-engine/src/modules/webhooks/webhook-inbox.route.ts`
- Modify: `apps/workflow-engine/src/modules/inbox/inbox.service.ts`
- Modify: `apps/workflow-engine/src/server.ts`
- Test: `apps/workflow-engine/test/webhook-inbox-route.test.ts`

- [ ] **Step 1: Write the failing route test**

```ts
it('creates a webhook conversation and publishes realtime data for a named source', async () => {
  const source = await WebhookInboxSourceModel.create({
    agencyId,
    tenantId,
    name: 'Website Chatbot',
    status: 'active',
    inboundPath: 'website-chatbot',
    inboundSecretHash: hashSecret('test-secret'),
    outboundUrl: 'https://example.com/outbound',
  });

  const response = await app.inject({
    method: 'POST',
    url: `/v1/webhooks/inbox/${source.inboundPath}`,
    headers: { 'x-webhook-secret': 'test-secret' },
    payload: {
      contactId: 'contact-123',
      contactName: 'Alice',
      externalMessageId: 'ext-1',
      text: 'hello from the site',
      timestamp: '2026-04-19T09:00:00.000Z',
    },
  });

  expect(response.statusCode).toBe(202);

  const conversation = await ConversationModel.findOne({
    tenantId,
    channelType: 'webhook',
    channelInstanceId: String(source._id),
    contactId: 'contact-123',
  }).lean();

  expect(conversation?.channelDisplayName).toBe('Website Chatbot');
});
```

- [ ] **Step 2: Run the route test and confirm it fails because the route does not exist**

Run: `pnpm --filter @noxivo/workflow-engine exec vitest run test/webhook-inbox-route.test.ts`

Expected: FAIL with 404 or missing module/route registration.

- [ ] **Step 3: Add the new route and minimal handler**

```ts
// apps/workflow-engine/src/modules/webhooks/webhook-inbox.route.ts
export async function registerWebhookInboxRoute(app: FastifyInstance) {
  app.post('/v1/webhooks/inbox/:inboundPath', async (request, reply) => {
    const params = z.object({ inboundPath: z.string().min(1) }).parse(request.params);
    const payload = WebhookInboundMessageSchema.parse(request.body);
    const secret = request.headers['x-webhook-secret'];

    const source = await resolveWebhookInboxSource(params.inboundPath, secret);

    await inboxService.recordMessage({
      agencyId: String(source.agencyId),
      tenantId: String(source.tenantId),
      contactId: payload.contactId,
      contactName: payload.contactName ?? payload.contactId,
      role: 'user',
      content: payload.text,
      providerMessageId: payload.externalMessageId ?? null,
      channelType: 'webhook',
      channelInstanceId: String(source._id),
      channelDisplayName: source.name,
      source: 'webhook.inbound',
      timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
    });

    return reply.code(202).send({ accepted: true, sourceId: String(source._id) });
  });
}
```

- [ ] **Step 4: Register the route in `server.ts` and re-run the test**

```ts
await registerWebhookInboxRoute(app);
```

Run: `pnpm --filter @noxivo/workflow-engine exec vitest run test/webhook-inbox-route.test.ts`

Expected: PASS

- [ ] **Step 5: Add disabled-source rejection coverage before leaving the route layer**

```ts
it('rejects disabled webhook inbox sources', async () => {
  await WebhookInboxSourceModel.create({ ...baseSource, status: 'disabled' });

  const response = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/inbox/website-chatbot',
    headers: { 'x-webhook-secret': 'test-secret' },
    payload: { contactId: 'contact-123', text: 'blocked' },
  });

  expect(response.statusCode).toBe(403);
});
```

Run: `pnpm --filter @noxivo/workflow-engine exec vitest run test/webhook-inbox-route.test.ts`

Expected: PASS

---

### Task 3: Route operator replies to webhook outbound URLs

**Files:**
- Create: `apps/workflow-engine/src/modules/inbox/webhook-outbound.service.ts`
- Modify: `apps/workflow-engine/src/modules/inbox/internal-message.service.ts`
- Modify: `packages/contracts/src/internal-inbox.ts`
- Modify: `apps/dashboard/app/api/team-inbox/[conversationId]/messages/route.ts`
- Test: `apps/workflow-engine/test/internal-inbox-route.test.ts`

- [ ] **Step 1: Write the failing outbound webhook test**

```ts
it('sends operator replies for webhook conversations to the source outbound url', async () => {
  const conversation = await ConversationModel.create({
    agencyId,
    tenantId,
    contactId: 'contact-123',
    contactName: 'Alice',
    channelType: 'webhook',
    channelInstanceId: String(source._id),
    channelDisplayName: 'Website Chatbot',
  });

  outboundFetchMock.mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 200 }));

  const response = await app.inject({
    method: 'POST',
    url: `/v1/internal/inbox/conversations/${conversation._id.toString()}/messages`,
    headers: INTERNAL_HEADERS,
    payload: { text: 'Hello from Noxivo' },
  });

  expect(response.statusCode).toBe(200);
  expect(outboundFetchMock).toHaveBeenCalledWith(
    'https://example.com/outbound',
    expect.objectContaining({ method: 'POST' }),
  );
});
```

- [ ] **Step 2: Run the test to confirm the current send path is WhatsApp-only**

Run: `pnpm --filter @noxivo/workflow-engine exec vitest run test/internal-inbox-route.test.ts -t "sends operator replies for webhook conversations"`

Expected: FAIL because the route/service does not branch on `channelType=webhook`.

- [ ] **Step 3: Add a minimal outbound service and branch in `internal-message.service.ts`**

```ts
// apps/workflow-engine/src/modules/inbox/webhook-outbound.service.ts
export class WebhookOutboundService {
  async sendOperatorReply(input: {
    source: WebhookInboxSourceDocument;
    conversationId: string;
    contactId: string;
    messageId: string;
    text: string;
  }) {
    return fetch(input.source.outboundUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...Object.fromEntries(input.source.outboundHeaders ?? new Map()),
      },
      body: JSON.stringify({
        sourceId: String(input.source._id),
        sourceName: input.source.name,
        conversationId: input.conversationId,
        contactId: input.contactId,
        messageId: input.messageId,
        text: input.text,
      }),
    });
  }
}

// apps/workflow-engine/src/modules/inbox/internal-message.service.ts
if (conversation.channelType === 'webhook') {
  const source = await WebhookInboxSourceModel.findById(conversation.channelInstanceId).orFail();
  await webhookOutboundService.sendOperatorReply({
    source,
    conversationId: conversation.id,
    contactId: conversation.contactId,
    messageId: message.id,
    text: input.text,
  });
}
```

- [ ] **Step 4: Re-run the focused test and then the full internal inbox test file**

Run: `pnpm --filter @noxivo/workflow-engine exec vitest run test/internal-inbox-route.test.ts`

Expected: PASS

- [ ] **Step 5: Keep the dashboard send path source-aware**

```ts
// apps/dashboard/app/api/team-inbox/[conversationId]/messages/route.ts
const isWebhookConversation = conversation.channelType === 'webhook';

const engineResponse = await engineClient.post(
  `/v1/internal/inbox/conversations/${conversationId}/messages`,
  { text },
  { headers: INTERNAL_HEADERS },
);

expect(isWebhookConversation || isWhatsAppConversation).toBe(true);
```

Run: `pnpm --filter @noxivo/dashboard exec vitest run test/team-inbox-routes.test.ts -t "posts outbound messages"`

Expected: PASS and no regression in the dashboard route.

---

### Task 4: Add tenant settings APIs and UI for webhook inbox sources

**Files:**
- Create: `apps/dashboard/app/api/settings/webhook-inbox-sources/route.ts`
- Create: `apps/dashboard/app/api/settings/webhook-inbox-sources/[sourceId]/route.ts`
- Modify: `apps/dashboard/app/dashboard/settings/integrations/integrations-client.tsx`
- Test: `apps/dashboard/test/settings-webhook-inbox-sources-route.test.ts`

- [ ] **Step 1: Write the failing settings route test**

```ts
it('creates and lists webhook inbox sources with display names', async () => {
  const createResponse = await POST(
    makeRequest({
      name: 'Website Chatbot',
      outboundUrl: 'https://example.com/outbound',
      inboundSecret: 'test-secret',
    }),
  );

  expect(createResponse.status).toBe(201);

  const listResponse = await GET(makeRequest());
  const body = await listResponse.json();

  expect(body.sources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'Website Chatbot', status: 'active' }),
    ]),
  );
});
```

- [ ] **Step 2: Run the settings test to verify the API does not exist yet**

Run: `pnpm --filter @noxivo/dashboard exec vitest run test/settings-webhook-inbox-sources-route.test.ts`

Expected: FAIL because the route files do not exist.

- [ ] **Step 3: Add minimal list/create/update route handlers**

```ts
// apps/dashboard/app/api/settings/webhook-inbox-sources/route.ts
export async function GET() {
  const session = await requireDashboardSession();
  const sources = await WebhookInboxSourceModel.find({
    agencyId: session.agencyId,
    tenantId: session.tenantId,
  }).sort({ createdAt: -1 }).lean();

  return NextResponse.json({ sources: sources.map(mapWebhookSourceDto) });
}

export async function POST(request: Request) {
  const session = await requireDashboardSession();
  const payload = WebhookInboxSourceCreateSchema.parse(await request.json());

  const source = await WebhookInboxSourceModel.create({
    agencyId: session.agencyId,
    tenantId: session.tenantId,
    name: payload.name,
    status: 'active',
    inboundPath: crypto.randomUUID(),
    inboundSecretHash: hashSecret(payload.inboundSecret),
    outboundUrl: payload.outboundUrl,
  });

  return NextResponse.json({ source: mapWebhookSourceDto(source) }, { status: 201 });
}
```

- [ ] **Step 4: Add the settings UI card/list and re-run the route test**

```tsx
<section className="glass-panel rounded-3xl p-5">
  <div className="flex items-center justify-between">
    <div>
      <h3 className="text-sm font-semibold text-foreground">Webhook Inbox Sources</h3>
      <p className="text-xs text-muted-foreground">Create named webhook sources for website chatbots and external inbox integrations.</p>
    </div>
    <Button onClick={openCreateWebhookSourceModal}>Add source</Button>
  </div>
</section>
```

Run: `pnpm --filter @noxivo/dashboard exec vitest run test/settings-webhook-inbox-sources-route.test.ts`

Expected: PASS

- [ ] **Step 5: Verify settings regressions stay green**

Run: `pnpm --filter @noxivo/dashboard exec vitest run test/settings-credentials-route.test.ts test/settings-shop-route.test.ts`

Expected: PASS, proving the new settings surface did not break adjacent integrations pages.

---

### Task 5: Render channel differences and add archive-aware inbox filtering

**Files:**
- Modify: `apps/dashboard/app/api/team-inbox/route.ts`
- Modify: `apps/dashboard/app/api/team-inbox/[conversationId]/messages/route.ts`
- Modify: `apps/dashboard/app/api/team-inbox/[conversationId]/actions/route.ts`
- Modify: `apps/dashboard/app/dashboard/inbox/page.tsx`
- Modify: `apps/dashboard/components/team-inbox/chat-list.tsx`
- Modify: `apps/dashboard/components/team-inbox/chat-window.tsx`
- Modify: `apps/dashboard/components/team-inbox/types.ts`
- Test: `apps/dashboard/test/team-inbox-routes.test.ts`
- Test: `apps/dashboard/test/inbox-pagination-realtime.test.tsx`

- [ ] **Step 1: Write the failing inbox route tests for filter + archive behavior**

```ts
it('returns archived conversations only when filter=archived', async () => {
  await ConversationModel.create({
    agencyId,
    tenantId,
    contactId: 'contact-1',
    channelType: 'webhook',
    channelInstanceId: 'source-1',
    channelDisplayName: 'Website Chatbot',
    isArchived: true,
  });

  const response = await GET(makeRequest('http://localhost/api/team-inbox?filter=archived'));
  const body = await response.json();

  expect(body.conversations).toHaveLength(1);
  expect(body.conversations[0].channelDisplayName).toBe('Website Chatbot');
});

it('keeps archived webhook conversations out of the default inbox filter', async () => {
  const response = await GET(makeRequest('http://localhost/api/team-inbox'));
  const body = await response.json();

  expect(body.conversations).toHaveLength(0);
});
```

- [ ] **Step 2: Run the route tests to verify archive/source filters are missing**

Run: `pnpm --filter @noxivo/dashboard exec vitest run test/team-inbox-routes.test.ts -t "archived conversations"`

Expected: FAIL because the list route does not yet understand `filter=archived` or source-aware DTOs.

- [ ] **Step 3: Add local archive semantics and source filters to the dashboard APIs**

```ts
// apps/dashboard/app/api/team-inbox/route.ts
const filter = searchParams.get('filter') ?? 'all';

if (filter === 'archived') {
  query.isArchived = true;
} else {
  query.isArchived = false;
  if (filter === 'whatsapp') query.channelType = 'whatsapp';
  if (filter === 'webhook') query.channelType = 'webhook';
}

// apps/dashboard/app/api/team-inbox/[conversationId]/actions/route.ts
if (action === 'archive') {
  await ConversationModel.findOneAndUpdate(scope, { $set: { isArchived: true } });
  return NextResponse.json({ ok: true, isArchived: true });
}

if (action === 'unarchive') {
  await ConversationModel.findOneAndUpdate(scope, { $set: { isArchived: false } });
  return NextResponse.json({ ok: true, isArchived: false });
}
```

- [ ] **Step 4: Render source badges and webhook contact metadata in the inbox UI**

```tsx
// apps/dashboard/components/team-inbox/chat-list.tsx
<span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', badgeClassName)}>
  {conversation.channelType === 'webhook'
    ? `Webhook · ${conversation.channelDisplayName}`
    : 'WhatsApp'}
</span>

// apps/dashboard/components/team-inbox/chat-window.tsx
{selectedConversation.channelType === 'webhook' ? (
  <p className="text-[11px] text-muted-foreground">
    {selectedConversation.channelDisplayName} · Contact ID {selectedConversation.contactId}
  </p>
) : null}
```

- [ ] **Step 5: Re-run route + realtime UI coverage**

Run: `pnpm --filter @noxivo/dashboard exec vitest run test/team-inbox-routes.test.ts test/inbox-pagination-realtime.test.tsx`

Expected: PASS, including preservation of archived webhook conversations during refresh.

---

### Task 6: Full verification and repo hygiene

**Files:**
- Modify: `TODO.md`
- Modify: `SESSION_HANDOFF.md`

- [ ] **Step 1: Run focused workflow-engine verification**

Run: `pnpm --filter @noxivo/workflow-engine exec vitest run test/inbox.service.test.ts test/webhook-inbox-route.test.ts test/internal-inbox-route.test.ts`

Expected: PASS

- [ ] **Step 2: Run focused dashboard verification**

Run: `pnpm --filter @noxivo/dashboard exec vitest run test/team-inbox-routes.test.ts test/inbox-pagination-realtime.test.tsx test/settings-webhook-inbox-sources-route.test.ts`

Expected: PASS

- [ ] **Step 3: Run package/app type gates**

Run: `pnpm --filter @noxivo/contracts build && pnpm --filter @noxivo/database build && pnpm --filter @noxivo/workflow-engine lint && pnpm --filter @noxivo/dashboard lint`

Expected: PASS

- [ ] **Step 4: Update handoff files with exact changed files and verification commands**

```md
## Update - 2026-04-19 (Webhook Inbox Sources)
- Added tenant-configurable webhook inbox sources with named display labels.
- Extended conversation/message identity to support `channelType`, `channelInstanceId`, and local archive state.
- Added workflow-engine inbound/outbound webhook route coverage and dashboard archive/source filters.
```

- [ ] **Step 5: If the user explicitly asks for a commit, create one with the finished slice**

Run: `git add packages/contracts packages/database apps/workflow-engine apps/dashboard TODO.md SESSION_HANDOFF.md && git commit -m "feat: add webhook inbox sources"`

Expected: commit succeeds only if the user requested it.

---

## Plan Self-Review

### Spec coverage
- Named webhook source settings: Task 4
- Inbound webhook ingestion: Task 2
- Outbound reply routing: Task 3
- Source-aware conversation identity: Task 1
- Inbox visual distinction and source labels: Task 5
- Archived view and archived persistence: Task 5
- Verification and handoff hygiene: Task 6

### Placeholder scan
- No `TBD`, `TODO`, or “implement later” placeholders are present in task steps.
- Every task includes exact files and concrete commands.

### Type consistency
- Shared names are consistent across tasks: `channelType`, `channelInstanceId`, `channelDisplayName`, `isArchived`, `WebhookInboxSourceModel`.
