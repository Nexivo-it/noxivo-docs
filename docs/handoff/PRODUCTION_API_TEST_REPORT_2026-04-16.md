# Production API Test Report (2026-04-16)

## Local Patch Status (Pending Redeploy)
- Local workflow-engine fixes have been implemented and verified via lint/build/tests for:
  - status wrapper path mapping (`/api/v1/sessions/:id/status/*`)
  - `POST /api/v1/messages/send` fallback when active DB binding is missing
  - webhook resolution behavior (`/v1/webhooks/messaging`) to avoid blanket 500 on unresolved sessions
  - admin session action resolution and QR path correctness
- Local verification command:
  - `pnpm --filter @noxivo/workflow-engine exec vitest run test/messages-route.test.ts test/status-route.test.ts test/messaging-webhook-route.test.ts test/messaging-webhook-enterprise.test.ts test/admin-mission-control.test.ts` ✅
- This report section below still reflects the **latest deployed environment** until the new patch is deployed and re-tested.

## Latest Post-Deploy Run
- Run timestamp (UTC): `2026-04-16T09:44:48Z`
- Target engine: `https://api-workflow-engine.khelifi-salmen.com`
- Reference session used: `agency-cb59e033-tenant-b379175e-whatsapp` (`WORKING`)
- Target number used for live checks: `+84961566302` (`84961566302@c.us`)
- Auth headers used:
  - Engine: `X-API-Key`
  - Webhook: `x-messaging-webhook-secret`

## Live Inbound/Outbound Validation
- Inbound check (`Test codex`) found in active session chat overview:
  - Match count: `1`
  - Chat id: `50805738631354@lid`
  - `fromMe: false`
- Outbound check to `+84961566302`:
  - `POST /api/v1/sendText` returned `201` with MessagingProvider message payload.
- Profile picture checks:
  - `GET /api/v1/sessions/{session}/profile` returned `200` with account profile + picture URL.
  - `GET /api/v1/contacts/profile-picture?...` returned `200` with picture URL for target contact.

## Category Matrix (Post-Deploy)

| Category | Endpoint(s) tested | Result | Notes |
|---|---|---:|---|
| Health | `GET /health` | 200 | Engine + Mongo + Redis + MessagingProvider healthy |
| Sessions Control | `GET /api/v1/sessions`, `GET /api/v1/sessions/by-tenant`, `POST /api/v1/sessions/bootstrap`, `GET /api/v1/sessions/{id}/status` | 200 | Session discovery + bootstrap work |
| Pairing | `GET /api/v1/sessions/{new}/qr`, `GET /api/v1/sessions/{new}/status` | 500 / 200 | New bootstrap session was `STARTING`; QR returned MessagingProvider 422 mapped to engine 500 |
| Profile | `GET /api/v1/sessions/{id}/profile`, `GET /api/v1/contacts/profile-picture` | 200 | Both pass |
| Chatting | `POST /api/v1/sendText`, `POST /api/v1/messages/send` | 201 / 409 | MessagingProvider direct send works; engine send requires active DB binding (`No active MessagingProvider session binding found`) |
| Presence | `GET /api/v1/{session}/presence`, `GET /api/v1/{session}/presence/{chatId}` | 501 / 200 | Full presence list not implemented on WEBJS engine |
| Channels | `GET /api/v1/{session}/channels` | 200 | Returns `[]` |
| Status | `GET /api/v1/sessions/{id}/status/stories`, `POST /api/v1/sessions/{id}/status/text` | 500 | Engine custom status routes target outdated MessagingProvider endpoints |
| Status (fallback) | `POST /api/v1/{session}/status/text` | 201 | Fallback MessagingProvider path works correctly |
| Chats | `GET /api/v1/{session}/chats/overview`, `GET /api/v1/{session}/chats/{id}/messages`, `GET /api/v1/chats?...` | 200 / 500 / 200 | Chat overview + engine chat list work; chat messages endpoint throws MessagingProvider runtime error |
| API Keys | `GET /api/v1/keys`, `POST /api/v1/keys` | 200 / 500* | `POST` with invalid body fails as expected; valid POST with session works (see notes) |
| Contacts | `GET /api/v1/sessions/{id}/contacts`, `GET /api/v1/contacts/check-exists?...` | 200 | Contacts pass; method for `check-exists` is `GET` |
| Groups | `GET /api/v1/{session}/groups` | 200 | Returns `[]` |
| Calls | `POST /api/v1/{session}/calls/reject` | 400 | Route exists; request body validation enforced |
| Events | `POST /api/v1/{session}/events` | 501 | Not implemented by WEBJS engine |
| Labels | `GET /api/v1/{session}/labels` | 200 | Returns labels |
| Media | `POST /api/v1/{session}/media/convert/voice` | 500 | MessagingProvider returns upstream 404 for conversion call |
| Apps | `GET /api/v1/apps?session=...` | 200 | Returns `[]` |
| Observability | `GET /api/v1/health/messaging` | 200 | Upstream healthy |
| Storage | `GET /api/v1/{session}/storage` | 404 | No matching MessagingProvider path in current OpenAPI |
| Webhooks | `POST /v1/webhooks/messaging` across full event list | 500 (all tested) | Webhook processor fails for tested session payloads |

## Webhooks Sweep
- Tested events:
  - `session.status`, `message`, `message.reaction`, `message.any`, `message.ack`, `message.ack.group`, `message.revoked`, `message.edited`
  - `group.v2.join`, `group.v2.leave`, `group.v2.update`, `group.v2.participants`
  - `presence.update`, `poll.vote`, `poll.vote.failed`, `chat.archive`
  - `call.received`, `call.accepted`, `call.rejected`
  - `label.upsert`, `label.deleted`, `label.chat.added`, `label.chat.deleted`
  - `event.response`, `event.response.failed`, `engine.event`, `group.join`, `group.leave`, `state.change`
- Outcome: all returned `500` from `/v1/webhooks/messaging` in this run.

## Notable Corrections During Testing
- `GET /api/v1/contacts/check-exists` is the correct method (`POST` was incorrect in initial probe).
- API key creation works when request body is valid:
  - Example success: `POST /api/v1/keys` with `{"isAdmin":false,"session":"agency-cb59e033-tenant-b379175e-whatsapp","isActive":true}` returned key payload.
  - Cleanup `DELETE /api/v1/keys/{id}` returned `{"result":true}`.

## Open Regressions / Bugs
1. **[P1] Engine status routes use outdated MessagingProvider paths**
   - `GET /api/v1/sessions/{id}/status/stories` -> `Cannot GET /api/{session}/status`
   - `POST /api/v1/sessions/{id}/status/text` -> `Cannot POST /api/sendStatusText`
   - Fallback paths (`/api/v1/{session}/status/text`) still work.

2. **[P1] Chat messages endpoint unstable on active session**
   - `GET /api/v1/{session}/chats/{chatId}/messages` returns MessagingProvider runtime error:
   - `Cannot read properties of undefined (reading 'waitForChatLoading')`.

3. **[P1] Engine `messages/send` depends on DB session binding, not just active MessagingProvider session**
   - Returned `409` (`No active MessagingProvider session binding found`) despite session being `WORKING`.

4. **[P1] Webhook processing fails for tested session payloads**
   - `/v1/webhooks/messaging` returned `500` for all tested events in this run.

5. **[P2] QR retrieval immediately after bootstrap can surface as 500**
   - New session in `STARTING` state returned MessagingProvider 422 when fetching QR.

## Artifacts (Raw)
- Matrix TSV: `docs/handoff/PRODUCTION_API_TEST_MATRIX_2026-04-16_POST_DEPLOY.tsv`
- Run metadata: `docs/handoff/PRODUCTION_API_TEST_MATRIX_2026-04-16_POST_DEPLOY.meta.json`
- Inbound detection payload (`Test codex`): `docs/handoff/PRODUCTION_API_TEST_MATRIX_2026-04-16_POST_DEPLOY.inbound.json`

## Historical Note
- This report supersedes the earlier pre-fix run from the same date by adding post-deploy active-session validation and full category sweep results.
