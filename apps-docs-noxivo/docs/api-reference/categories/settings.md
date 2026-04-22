# API Reference: settings

## Overview
The Settings API manages configurable platform and tenant-level behavior such as branding, channels, notifications, integrations, and operational preferences. It centralizes configuration persistence for governance and consistency.

**Base URL**: `{{BASE_URL}}`  
**API Version Prefix**: `/api/v1`

---

## List tenant credentials (provider/display/status/config metadata)

List tenant credentials (provider/display/status/config metadata).

**Endpoint**: `GET /api/v1/settings/credentials`

### Authorization
- **Access Model**: Cookie session + canManageCredentials
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"credentials": "CredentialSummary[]"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/settings/credentials' -b cookies.txt
```

### Example Response
```json
{
  "credentials": "CredentialSummary[]"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: List tenant credentials (provider/display/status/config metadata). Endpoint: GET /api/v1/settings/credentials. Authorization: Cookie session + canManageCredentials. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Upsert provider credentials and mirror shop providers to DataSourceModel

Upsert provider credentials and mirror shop providers to DataSourceModel.

**Endpoint**: `POST /api/v1/settings/credentials`

### Authorization
- **Access Model**: Cookie session + canManageCredentials
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | `airtable | google_sheets | shopify | woocommerce` | No | airtable | google_sheets | shopify | woocommerce |
| `displayName` | `string 2-80` | No | optional |
| `secret` | `object` | Yes | provider-specific, required |
| `config` | `object` | No | provider-specific, optional |

### Response
| Status | Body |
|--------|------|
| 200 | `CredentialSummary` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/settings/credentials' -b cookies.txt -H 'content-type: application/json' -d '{"provider":"shopify","secret":{"apiAccessToken":"..."},"config":{"storeUrl":"https://acme.myshopify.com"}}'
```

### Example Response
```json
"CredentialSummary"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Upsert provider credentials and mirror shop providers to DataSourceModel. Endpoint: POST /api/v1/settings/credentials. Authorization: Cookie session + canManageCredentials. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Get per-provider entitlement/configuration/enabled status for shop integrations

Get per-provider entitlement/configuration/enabled status for shop integrations.

**Endpoint**: `GET /api/v1/settings/shop`

### Authorization
- **Access Model**: Cookie session + canManageCredentials
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"providers": "[{ provider, entitled, configured, enabled, credentialStatus, lastSyncedAt }]"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/settings/shop' -b cookies.txt
```

### Example Response
```json
{
  "providers": "[{ provider, entitled, configured, enabled, credentialStatus, lastSyncedAt }]"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Get per-provider entitlement/configuration/enabled status for shop integrations. Endpoint: GET /api/v1/settings/shop. Authorization: Cookie session + canManageCredentials. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Toggle a shop provider enabled/disabled with plan/credential checks

Toggle a shop provider enabled/disabled with plan/credential checks.

**Endpoint**: `POST /api/v1/settings/shop`

### Authorization
- **Access Model**: Cookie session + canManageCredentials
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | `shopify | woocommerce` | No | shopify | woocommerce |
| `enabled` | `boolean` | No | boolean |

### Response
| Status | Body |
|--------|------|
| 200 | `{"provider": "shopify\|woocommerce", "enabled": "boolean"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/settings/shop' -b cookies.txt -H 'content-type: application/json' -d '{"provider":"shopify","enabled":true}'
```

### Example Response
```json
{
  "provider": "shopify|woocommerce",
  "enabled": "boolean"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Toggle a shop provider enabled/disabled with plan/credential checks. Endpoint: POST /api/v1/settings/shop. Authorization: Cookie session + canManageCredentials. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Get media storage config (secret fields redacted)

Get media storage config (secret fields redacted).

**Endpoint**: `GET /api/v1/settings/storage`

### Authorization
- **Access Model**: Cookie session + canManageAgencySettings
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `MediaStorageConfig\|null` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/settings/storage' -b cookies.txt
```

### Example Response
```json
"MediaStorageConfig|null"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Get media storage config (secret fields redacted). Endpoint: GET /api/v1/settings/storage. Authorization: Cookie session + canManageAgencySettings. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Upsert media storage configuration for agency

Upsert media storage configuration for agency.

**Endpoint**: `PUT /api/v1/settings/storage`

### Authorization
- **Access Model**: Cookie session + canManageAgencySettings
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | `s3|google_drive|imagekit|cloudinary|bunny|cloudflare_r2|local` | No | s3|google_drive|imagekit|cloudinary|bunny|cloudflare_r2|local |
| `isActive` | `boolean` | No | boolean |
| `publicBaseUrl` | `string|null` | No | string|null |
| `publicConfig` | `object` | No | object |
| `secretConfig` | `object` | No | object |
| `pathPrefix` | `string` | No | string |

### Response
| Status | Body |
|--------|------|
| 200 | `MediaStorageConfig (redacted)` |
| 400 | `{"error": "Failed to update storage configuration"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X PUT '{{BASE_URL}}/api/v1/settings/storage' -b cookies.txt -H 'content-type: application/json' -d '{"provider":"imagekit","isActive":true,"publicConfig":{},"secretConfig":{}}'
```

### Example Response
```json
"MediaStorageConfig (redacted)"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Upsert media storage configuration for agency. Endpoint: PUT /api/v1/settings/storage. Authorization: Cookie session + canManageAgencySettings. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## List latest notifications and unread count

List latest notifications and unread count.

**Endpoint**: `GET /api/v1/settings/notifications`

### Authorization
- **Access Model**: Cookie session required (any authenticated actor)
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"notifications": "Notification[]", "unreadCount": "number"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/settings/notifications' -b cookies.txt
```

### Example Response
```json
{
  "notifications": "Notification[]",
  "unreadCount": "number"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: List latest notifications and unread count. Endpoint: GET /api/v1/settings/notifications. Authorization: Cookie session required (any authenticated actor). Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Mark a single notification/all notifications as read

Mark a single notification/all notifications as read.

**Endpoint**: `POST /api/v1/settings/notifications`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | `markAsRead | markAllAsRead` | No | markAsRead | markAllAsRead |
| `notificationId` | `string` | Yes | required for markAsRead |

### Response
| Status | Body |
|--------|------|
| 200 | `{"success": true}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/settings/notifications' -b cookies.txt -H 'content-type: application/json' -d '{"action":"markAllAsRead"}'
```

### Example Response
```json
{
  "success": true
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Mark a single notification/all notifications as read. Endpoint: POST /api/v1/settings/notifications. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Return ImageKit auth signature/token for direct upload clients

Return ImageKit auth signature/token for direct upload clients.

**Endpoint**: `GET /api/v1/settings/imagekit-auth`

### Authorization
- **Access Model**: Cookie session + canManageAgencySettings
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"token": "string", "expire": "number", "signature": "string", "publicKey": "string"}` |
| 404 | `{"error": "ImageKit is not configured for this agency"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/settings/imagekit-auth' -b cookies.txt
```

### Example Response
```json
{
  "token": "string",
  "expire": "number",
  "signature": "string",
  "publicKey": "string"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Return ImageKit auth signature/token for direct upload clients. Endpoint: GET /api/v1/settings/imagekit-auth. Authorization: Cookie session + canManageAgencySettings. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Get activation state for webhook inbox ingest channel

Get activation state for webhook inbox ingest channel.

**Endpoint**: `GET /api/v1/settings/webhook-inbox-activation`

### Authorization
- **Access Model**: Cookie session + canManageCredentials
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"isActive": "boolean", "webhookUrl": "string\|null", "activatedAt": "string\|null", "deactivatedAt": "string\|null"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/settings/webhook-inbox-activation' -b cookies.txt
```

### Example Response
```json
{
  "isActive": "boolean",
  "webhookUrl": "string|null",
  "activatedAt": "string|null",
  "deactivatedAt": "string|null"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Get activation state for webhook inbox ingest channel. Endpoint: GET /api/v1/settings/webhook-inbox-activation. Authorization: Cookie session + canManageCredentials. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Activate webhook inbox source and return API key once

Activate webhook inbox source and return API key once.

**Endpoint**: `POST /api/v1/settings/webhook-inbox-activation`

### Authorization
- **Access Model**: Cookie session + canManageCredentials
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"isActive": true, "webhookUrl": "string", "apiKey": "string", "activatedAt": "string"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/settings/webhook-inbox-activation' -b cookies.txt
```

### Example Response
```json
{
  "isActive": true,
  "webhookUrl": "string",
  "apiKey": "string",
  "activatedAt": "string"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Activate webhook inbox source and return API key once. Endpoint: POST /api/v1/settings/webhook-inbox-activation. Authorization: Cookie session + canManageCredentials. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Deactivate webhook inbox activation

Deactivate webhook inbox activation.

**Endpoint**: `DELETE /api/v1/settings/webhook-inbox-activation`

### Authorization
- **Access Model**: Cookie session + canManageCredentials
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"isActive": false}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X DELETE '{{BASE_URL}}/api/v1/settings/webhook-inbox-activation' -b cookies.txt
```

### Example Response
```json
{
  "isActive": false
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Deactivate webhook inbox activation. Endpoint: DELETE /api/v1/settings/webhook-inbox-activation. Authorization: Cookie session + canManageCredentials. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## List webhook inbox sources (secret hash excluded)

List webhook inbox sources (secret hash excluded).

**Endpoint**: `GET /api/v1/settings/webhook-inbox-sources`

### Authorization
- **Access Model**: Cookie session + canManageCredentials
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"sources": "WebhookInboxSourceDto[]"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/settings/webhook-inbox-sources' -b cookies.txt
```

### Example Response
```json
{
  "sources": "WebhookInboxSourceDto[]"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: List webhook inbox sources (secret hash excluded). Endpoint: GET /api/v1/settings/webhook-inbox-sources. Authorization: Cookie session + canManageCredentials. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Create webhook inbox source with generated inboundPath and hashed secret

Create webhook inbox source with generated inboundPath and hashed secret.

**Endpoint**: `POST /api/v1/settings/webhook-inbox-sources`

### Authorization
- **Access Model**: Cookie session + canManageCredentials
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string 2-120` | Yes | required |
| `outboundUrl` | `valid URL` | Yes | required |
| `inboundSecret` | `string` | Yes | required |
| `outboundHeaders` | `Record<string,string>` | No | optional |

### Response
| Status | Body |
|--------|------|
| 201 | `{"source": "WebhookInboxSourceDto"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/settings/webhook-inbox-sources' -b cookies.txt -H 'content-type: application/json' -d '{"name":"CRM Bridge","outboundUrl":"https://example.com/hook","inboundSecret":"secret"}'
```

### Example Response
```json
{
  "source": "WebhookInboxSourceDto"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Create webhook inbox source with generated inboundPath and hashed secret. Endpoint: POST /api/v1/settings/webhook-inbox-sources. Authorization: Cookie session + canManageCredentials. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Update source metadata/url/headers/status/inboundSecret

Update source metadata/url/headers/status/inboundSecret.

**Endpoint**: `PATCH /api/v1/settings/webhook-inbox-sources/:sourceId`

### Authorization
- **Access Model**: Cookie session + canManageCredentials
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | No | optional |
| `outboundUrl` | `valid URL` | No | optional |
| `inboundSecret` | `string` | No | optional |
| `outboundHeaders` | `Record<string,string>` | No | optional |
| `status` | `active|disabled` | No | optional |

### Response
| Status | Body |
|--------|------|
| 200 | `{"source": "WebhookInboxSourceDto"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X PATCH '{{BASE_URL}}/api/v1/settings/webhook-inbox-sources/$SOURCE_ID' -b cookies.txt -H 'content-type: application/json' -d '{"status":"disabled"}'
```

### Example Response
```json
{
  "source": "WebhookInboxSourceDto"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Update source metadata/url/headers/status/inboundSecret. Endpoint: PATCH /api/v1/settings/webhook-inbox-sources/:sourceId. Authorization: Cookie session + canManageCredentials. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Return current active scoped API key status for agency/tenant

Return current active scoped API key status for agency/tenant.

**Endpoint**: `GET /api/v1/settings/developer-api`

### Authorization
- **Access Model**: Cookie session + canManageAgencySettings
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"key": "string\|null", "status": "active\|inactive"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/settings/developer-api' -b cookies.txt
```

### Example Response
```json
{
  "key": "string|null",
  "status": "active|inactive"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Return current active scoped API key status for agency/tenant. Endpoint: GET /api/v1/settings/developer-api. Authorization: Cookie session + canManageAgencySettings. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Revoke existing keys and create a new active scoped API key

Revoke existing keys and create a new active scoped API key.

**Endpoint**: `POST /api/v1/settings/developer-api`

### Authorization
- **Access Model**: Cookie session + canManageAgencySettings
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"key": "nx_<hex>", "status": "active"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/settings/developer-api' -b cookies.txt
```

### Example Response
```json
{
  "key": "nx_<hex>",
  "status": "active"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Revoke existing keys and create a new active scoped API key. Endpoint: POST /api/v1/settings/developer-api. Authorization: Cookie session + canManageAgencySettings. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Revoke all scoped developer API keys for current agency/tenant

Revoke all scoped developer API keys for current agency/tenant.

**Endpoint**: `DELETE /api/v1/settings/developer-api`

### Authorization
- **Access Model**: Cookie session + canManageAgencySettings
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"success": true}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X DELETE '{{BASE_URL}}/api/v1/settings/developer-api' -b cookies.txt
```

### Example Response
```json
{
  "success": true
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Revoke all scoped developer API keys for current agency/tenant. Endpoint: DELETE /api/v1/settings/developer-api. Authorization: Cookie session + canManageAgencySettings. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Get messaging session snapshot (status/profile/qr diagnostics)

Get messaging session snapshot (status/profile/qr diagnostics).

**Endpoint**: `GET /api/v1/settings/whatsapp-check`

### Authorization
- **Access Model**: Cookie session + canManageAgencySettings
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `DashboardMessagingSessionSnapshot + agencyId/tenantId` |
| 502 | `{"error": "Failed to communicate with Engine API"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/settings/whatsapp-check' -b cookies.txt
```

### Example Response
```json
"DashboardMessagingSessionSnapshot + agencyId/tenantId"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Get messaging session snapshot (status/profile/qr diagnostics). Endpoint: GET /api/v1/settings/whatsapp-check. Authorization: Cookie session + canManageAgencySettings. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Get current QR/session snapshot for WhatsApp connection

Get current QR/session snapshot for WhatsApp connection.

**Endpoint**: `GET /api/v1/settings/qr`

### Authorization
- **Access Model**: Cookie session + canManageAgencySettings
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `DashboardMessagingSessionSnapshot` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/settings/qr' -b cookies.txt
```

### Example Response
```json
"DashboardMessagingSessionSnapshot"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Get current QR/session snapshot for WhatsApp connection. Endpoint: GET /api/v1/settings/qr. Authorization: Cookie session + canManageAgencySettings. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Login/regenerate QR by starting or restarting backing session

Login/regenerate QR by starting or restarting backing session.

**Endpoint**: `POST /api/v1/settings/qr`

### Authorization
- **Access Model**: Cookie session + canManageAgencySettings
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | `login | regenerate` | No | optional; default login |

### Response
| Status | Body |
|--------|------|
| 200 | `DashboardMessagingSessionSnapshot + { bootstrapped, restarted }` |
| 502 | `{"error": "Failed to regenerate/recover WhatsApp session"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/settings/qr' -b cookies.txt -H 'content-type: application/json' -d '{"action":"regenerate"}'
```

### Example Response
```json
"DashboardMessagingSessionSnapshot + { bootstrapped, restarted }"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Login/regenerate QR by starting or restarting backing session. Endpoint: POST /api/v1/settings/qr. Authorization: Cookie session + canManageAgencySettings. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Logout/revoke WhatsApp session then return refreshed snapshot

Logout/revoke WhatsApp session then return refreshed snapshot.

**Endpoint**: `DELETE /api/v1/settings/qr`

### Authorization
- **Access Model**: Cookie session + canManageAgencySettings
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"ok": true, "snapshot": "DashboardMessagingSessionSnapshot"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X DELETE '{{BASE_URL}}/api/v1/settings/qr' -b cookies.txt
```

### Example Response
```json
{
  "ok": true,
  "snapshot": "DashboardMessagingSessionSnapshot"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Logout/revoke WhatsApp session then return refreshed snapshot. Endpoint: DELETE /api/v1/settings/qr. Authorization: Cookie session + canManageAgencySettings. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
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
| 502 | Bad Gateway |
