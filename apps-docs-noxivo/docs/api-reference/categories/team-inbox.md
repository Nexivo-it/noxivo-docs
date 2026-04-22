# API Reference: team-inbox

## Overview
The Team Inbox API powers collaborative messaging operations including conversations, assignment, status transitions, and reply workflows. It is optimized for agent productivity, routing, and operational observability.

**Base URL**: `{{BASE_URL}}`  
**API Version Prefix**: `/api/v1`

---

## List conversations with optional query + status filters

List conversations with optional query + status filters.

**Endpoint**: `GET /api/v1/team-inbox`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Query Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | `string` | No | optional search |
| `status` | `all|active|archived` | No | optional, default active |

### Response
| Status | Body |
|--------|------|
| 200 | `ConversationListItem[]` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/team-inbox?status=active&query=john' -b cookies.txt
```

### Example Response
```json
"ConversationListItem[]"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: List conversations with optional query + status filters. Endpoint: GET /api/v1/team-inbox. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## SSE connect handshake for inbox events

SSE connect handshake for inbox events.

**Endpoint**: `GET /api/v1/team-inbox/events`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `text/event-stream (connected event then close)` |

### Example cURL
```bash
# Copy and paste ready to test
curl -N '{{BASE_URL}}/api/v1/team-inbox/events' -b cookies.txt
```

### Example Response
```json
"text/event-stream (connected event then close)"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: SSE connect handshake for inbox events. Endpoint: GET /api/v1/team-inbox/events. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Return high-level agency/tenant operational counts

Return high-level agency/tenant operational counts.

**Endpoint**: `GET /api/v1/team-inbox/stats`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"agencies": "number", "tenants": "number", "conversations": "number", "messages": "number", "users": "number", "activeWorkflows": "number", "activeSessions": "number", "timesta...` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/team-inbox/stats' -b cookies.txt
```

### Example Response
```json
{
  "agencies": "number",
  "tenants": "number",
  "conversations": "number",
  "messages": "number",
  "users": "number",
  "activeWorkflows": "number",
  "activeSessions": "number",
  "timestamp": "ISO date"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Return high-level agency/tenant operational counts. Endpoint: GET /api/v1/team-inbox/stats. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## List plugin installations for tenant inbox context

List plugin installations for tenant inbox context.

**Endpoint**: `GET /api/v1/team-inbox/plugins`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Query Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pluginId` | `string` | No | optional |

### Response
| Status | Body |
|--------|------|
| 200 | `PluginInstallation[]` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/team-inbox/plugins?pluginId=shop' -b cookies.txt
```

### Example Response
```json
"PluginInstallation[]"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: List plugin installations for tenant inbox context. Endpoint: GET /api/v1/team-inbox/plugins. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Upsert plugin installation toggles/config

Upsert plugin installation toggles/config.

**Endpoint**: `POST /api/v1/team-inbox/plugins`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pluginId` | `string` | Yes | required |
| `pluginVersion` | `string` | Yes | required |
| `enabled` | `boolean` | Yes | required |
| `config` | `object` | No | optional |

### Response
| Status | Body |
|--------|------|
| 200 | `PluginInstallation` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/team-inbox/plugins' -b cookies.txt -H 'content-type: application/json' -d '{"pluginId":"shop","pluginVersion":"1.0.0","enabled":true}'
```

### Example Response
```json
"PluginInstallation"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Upsert plugin installation toggles/config. Endpoint: POST /api/v1/team-inbox/plugins. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Return agency billing plan/features for inbox UI

Return agency billing plan/features for inbox UI.

**Endpoint**: `GET /api/v1/team-inbox/billing`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `BillingSummary` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/team-inbox/billing' -b cookies.txt
```

### Example Response
```json
"BillingSummary"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Return agency billing plan/features for inbox UI. Endpoint: GET /api/v1/team-inbox/billing. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## List lead-tagged contacts linked to conversations

List lead-tagged contacts linked to conversations.

**Endpoint**: `GET /api/v1/team-inbox/leads`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{ conversationId, contactId, contactName }[]` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/team-inbox/leads' -b cookies.txt
```

### Example Response
```json
"{ conversationId, contactId, contactName }[]"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: List lead-tagged contacts linked to conversations. Endpoint: GET /api/v1/team-inbox/leads. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Assign/unassign a conversation

Assign/unassign a conversation.

**Endpoint**: `POST /api/v1/team-inbox/:conversationId/assign`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `assignedTo` | `string|null` | No | string|null |

### Response
| Status | Body |
|--------|------|
| 200 | `{"success": true, "assignedTo": "string\|null"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/team-inbox/$CONVERSATION_ID/assign' -b cookies.txt -H 'content-type: application/json' -d '{"assignedTo":"$USER_ID"}'
```

### Example Response
```json
{
  "success": true,
  "assignedTo": "string|null"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Assign/unassign a conversation. Endpoint: POST /api/v1/team-inbox/:conversationId/assign. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Mark conversation unreadCount to zero

Mark conversation unreadCount to zero.

**Endpoint**: `POST /api/v1/team-inbox/:conversationId/read`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"success": true, "unreadCount": 0}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/team-inbox/$CONVERSATION_ID/read' -b cookies.txt
```

### Example Response
```json
{
  "success": true,
  "unreadCount": 0
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Mark conversation unreadCount to zero. Endpoint: POST /api/v1/team-inbox/:conversationId/read. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Archive/unarchive conversation metadata flag

Archive/unarchive conversation metadata flag.

**Endpoint**: `POST /api/v1/team-inbox/:conversationId/actions`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | `archive | unarchive` | No | archive | unarchive |

### Response
| Status | Body |
|--------|------|
| 200 | `{"success": true, "isArchived": "boolean"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/team-inbox/$CONVERSATION_ID/actions' -b cookies.txt -H 'content-type: application/json' -d '{"action":"archive"}'
```

### Example Response
```json
{
  "success": true,
  "isArchived": "boolean"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Archive/unarchive conversation metadata flag. Endpoint: POST /api/v1/team-inbox/:conversationId/actions. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Return handoff/assigned conversation back to open queue

Return handoff/assigned conversation back to open queue.

**Endpoint**: `POST /api/v1/team-inbox/:conversationId/unhandoff`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"conversationId": "string", "status": "open"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/team-inbox/$CONVERSATION_ID/unhandoff' -b cookies.txt
```

### Example Response
```json
{
  "conversationId": "string",
  "status": "open"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Return handoff/assigned conversation back to open queue. Endpoint: POST /api/v1/team-inbox/:conversationId/unhandoff. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Generate deterministic suggestion text (assist/auto mode)

Generate deterministic suggestion text (assist/auto mode).

**Endpoint**: `POST /api/v1/team-inbox/:conversationId/suggest-reply`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | `assist | auto` | No | optional |

### Response
| Status | Body |
|--------|------|
| 200 | `{"mode": "assist\|auto", "reply": "string"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/team-inbox/$CONVERSATION_ID/suggest-reply' -b cookies.txt -H 'content-type: application/json' -d '{"mode":"assist"}'
```

### Example Response
```json
{
  "mode": "assist|auto",
  "reply": "string"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Generate deterministic suggestion text (assist/auto mode). Endpoint: POST /api/v1/team-inbox/:conversationId/suggest-reply. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Get leadSaved state and latest CRM note

Get leadSaved state and latest CRM note.

**Endpoint**: `GET /api/v1/team-inbox/:conversationId/lead`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"leadSaved": "boolean", "note": "string\|null"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/team-inbox/$CONVERSATION_ID/lead' -b cookies.txt
```

### Example Response
```json
{
  "leadSaved": "boolean",
  "note": "string|null"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Get leadSaved state and latest CRM note. Endpoint: GET /api/v1/team-inbox/:conversationId/lead. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Save lead tag and optional note on contact profile

Save lead tag and optional note on contact profile.

**Endpoint**: `POST /api/v1/team-inbox/:conversationId/lead`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `note` | `string` | No | optional |

### Response
| Status | Body |
|--------|------|
| 200 | `{"success": true, "leadSaved": true}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/team-inbox/$CONVERSATION_ID/lead' -b cookies.txt -H 'content-type: application/json' -d '{"note":"high intent"}'
```

### Example Response
```json
{
  "success": true,
  "leadSaved": true
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Save lead tag and optional note on contact profile. Endpoint: POST /api/v1/team-inbox/:conversationId/lead. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Remove lead tag from contact profile

Remove lead tag from contact profile.

**Endpoint**: `DELETE /api/v1/team-inbox/:conversationId/lead`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"success": true, "leadSaved": false}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X DELETE '{{BASE_URL}}/api/v1/team-inbox/$CONVERSATION_ID/lead' -b cookies.txt
```

### Example Response
```json
{
  "success": true,
  "leadSaved": false
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Remove lead tag from contact profile. Endpoint: DELETE /api/v1/team-inbox/:conversationId/lead. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Cursor-paginated conversation history

Cursor-paginated conversation history.

**Endpoint**: `GET /api/v1/team-inbox/:conversationId/messages`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Query Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `limit` | `number 1-100` | No | optional, default 20 |
| `cursor` | `base64url cursor` | No | optional |

### Response
| Status | Body |
|--------|------|
| 200 | `{"messages": "Message[]", "hasMore": "boolean", "nextCursor": "string\|null"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/team-inbox/$CONVERSATION_ID/messages?limit=20' -b cookies.txt
```

### Example Response
```json
{
  "messages": "Message[]",
  "hasMore": "boolean",
  "nextCursor": "string|null"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Cursor-paginated conversation history. Endpoint: GET /api/v1/team-inbox/:conversationId/messages. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Send operator outbound message through internal inbox service

Send operator outbound message through internal inbox service.

**Endpoint**: `POST /api/v1/team-inbox/:conversationId/messages`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | `string` | No | string |
| `attachments` | `InternalInboxSendAttachment[]` | No | optional |
| `replyToMessageId` | `string` | No | optional |

### Response
| Status | Body |
|--------|------|
| 200 | `InternalInboxSendResult` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/team-inbox/$CONVERSATION_ID/messages' -b cookies.txt -H 'content-type: application/json' -d '{"content":"Hello!"}'
```

### Example Response
```json
"InternalInboxSendResult"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Send operator outbound message through internal inbox service. Endpoint: POST /api/v1/team-inbox/:conversationId/messages. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Resend an existing message payload

Resend an existing message payload.

**Endpoint**: `POST /api/v1/team-inbox/:conversationId/messages/:messageId`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"messageId": "string", "resentAt": "ISO date", "result": "InternalInboxSendResult"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/team-inbox/$CONVERSATION_ID/messages/$MESSAGE_ID' -b cookies.txt
```

### Example Response
```json
{
  "messageId": "string",
  "resentAt": "ISO date",
  "result": "InternalInboxSendResult"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Resend an existing message payload. Endpoint: POST /api/v1/team-inbox/:conversationId/messages/:messageId. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## List latest delivery events for conversation messages

List latest delivery events for conversation messages.

**Endpoint**: `GET /api/v1/team-inbox/:conversationId/delivery-history`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `DeliveryEvent[]` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/team-inbox/$CONVERSATION_ID/delivery-history' -b cookies.txt
```

### Example Response
```json
"DeliveryEvent[]"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: List latest delivery events for conversation messages. Endpoint: GET /api/v1/team-inbox/:conversationId/delivery-history. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Load CRM profile for conversation/contact

Load CRM profile for conversation/contact.

**Endpoint**: `GET /api/v1/team-inbox/:conversationId/crm`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `CrmConversationProfile` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/team-inbox/$CONVERSATION_ID/crm' -b cookies.txt
```

### Example Response
```json
"CrmConversationProfile"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Load CRM profile for conversation/contact. Endpoint: GET /api/v1/team-inbox/:conversationId/crm. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Mutate CRM profile (tags, notes, fields) for conversation

Mutate CRM profile (tags, notes, fields) for conversation.

**Endpoint**: `PATCH /api/v1/team-inbox/:conversationId/crm`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | `mutation action` | No | e.g. add_note |
| `...` | `mutation payload` | No | mutation payload |

### Response
| Status | Body |
|--------|------|
| 200 | `CrmConversationProfile` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X PATCH '{{BASE_URL}}/api/v1/team-inbox/$CONVERSATION_ID/crm' -b cookies.txt -H 'content-type: application/json' -d '{"action":"add_note","note":{"body":"Called today"}}'
```

### Example Response
```json
"CrmConversationProfile"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Mutate CRM profile (tags, notes, fields) for conversation. Endpoint: PATCH /api/v1/team-inbox/:conversationId/crm. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Apply message action: delete, star, unstar

Apply message action: delete, star, unstar.

**Endpoint**: `POST /api/v1/team-inbox/:conversationId/messages/:messageId/actions`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | `delete | star | unstar` | No | delete | star | unstar |

### Response
| Status | Body |
|--------|------|
| 200 | `{"success": true, "status_or_starred": "revoked \| boolean"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/team-inbox/$CONVERSATION_ID/messages/$MESSAGE_ID/actions' -b cookies.txt -H 'content-type: application/json' -d '{"action":"star"}'
```

### Example Response
```json
{
  "success": true,
  "status_or_starred": "revoked | boolean"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Apply message action: delete, star, unstar. Endpoint: POST /api/v1/team-inbox/:conversationId/messages/:messageId/actions. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Errors
| Code | Message |
|------|---------|
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Internal Server Error |
