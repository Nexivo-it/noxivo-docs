# API Reference: catalog

## Overview
The Catalog API exposes reusable workflow assets, templates, and package-level metadata required to standardize automation rollout across tenants. It supports browsing, creation, updates, and controlled consumption of catalog resources.

**Base URL**: `{{BASE_URL}}`  
**API Version Prefix**: `/api/v1`

---

## List catalog items for tenant

List catalog items for tenant.

**Endpoint**: `GET /api/v1/catalog`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"items": "CatalogItem[]"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/catalog' -b cookies.txt
```

### Example Response
```json
{
  "items": "CatalogItem[]"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: List catalog items for tenant. Endpoint: GET /api/v1/catalog. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Create catalog item from payload envelope

Create catalog item from payload envelope.

**Endpoint**: `POST /api/v1/catalog`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `payload` | `object` | No | catalog item fields |

### Response
| Status | Body |
|--------|------|
| 200 | `{"item": "CatalogItem"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/catalog' -b cookies.txt -H 'content-type: application/json' -d '{"payload":{"name":"Haircut"}}'
```

### Example Response
```json
{
  "item": "CatalogItem"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Create catalog item from payload envelope. Endpoint: POST /api/v1/catalog. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Get single catalog item by id

Get single catalog item by id.

**Endpoint**: `GET /api/v1/catalog/:id`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `CatalogItem` |
| 404 | `{"error": "Item not found"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/catalog/$ITEM_ID' -b cookies.txt
```

### Example Response
```json
"CatalogItem"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Get single catalog item by id. Endpoint: GET /api/v1/catalog/:id. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Update catalog item fields

Update catalog item fields.

**Endpoint**: `PATCH /api/v1/catalog/:id`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `body` | `object` | No | partial catalog item fields |

### Response
| Status | Body |
|--------|------|
| 200 | `CatalogItem` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X PATCH '{{BASE_URL}}/api/v1/catalog/$ITEM_ID' -b cookies.txt -H 'content-type: application/json' -d '{"priceAmount":45}'
```

### Example Response
```json
"CatalogItem"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Update catalog item fields. Endpoint: PATCH /api/v1/catalog/:id. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Delete catalog item

Delete catalog item.

**Endpoint**: `DELETE /api/v1/catalog/:id`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"success": true}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X DELETE '{{BASE_URL}}/api/v1/catalog/$ITEM_ID' -b cookies.txt
```

### Example Response
```json
{
  "success": true
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Delete catalog item. Endpoint: DELETE /api/v1/catalog/:id. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Read catalog settings + storage/branding context

Read catalog settings + storage/branding context.

**Endpoint**: `GET /api/v1/catalog/settings`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `CatalogSettings` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/catalog/settings' -b cookies.txt
```

### Example Response
```json
"CatalogSettings"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Read catalog settings + storage/branding context. Endpoint: GET /api/v1/catalog/settings. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Update catalog settings including business profile and storage options

Update catalog settings including business profile and storage options.

**Endpoint**: `POST /api/v1/catalog/settings`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `businessName` | `string` | No | optional |
| `currency` | `USD|EUR|GBP|VND|AUD|CAD` | No | optional |
| `timezone` | `string` | No | optional |
| `accentColor` | `string` | No | optional |
| `logoUrl` | `string` | No | optional |
| `defaultDuration` | `number` | No | optional |
| `storage` | `object` | No | provider/publicConfig/secretConfig/pathPrefix, optional |

### Response
| Status | Body |
|--------|------|
| 200 | `CatalogSettings` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/catalog/settings' -b cookies.txt -H 'content-type: application/json' -d '{"currency":"USD"}'
```

### Example Response
```json
"CatalogSettings"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Update catalog settings including business profile and storage options. Endpoint: POST /api/v1/catalog/settings. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Upload catalog media multipart file to /public/uploads

Upload catalog media multipart file to /public/uploads.

**Endpoint**: `POST /api/v1/catalog/upload`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `multipart` | `file field named 'file'` | No | file field named 'file' |

### Response
| Status | Body |
|--------|------|
| 200 | `{"url": "string", "filename": "string", "type": "mime", "size": "number", "isImage": "boolean", "isPdf": "boolean"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/catalog/upload' -b cookies.txt -F 'file=@/tmp/image.png' -H 'Content-Type: application/json'
```

### Example Response
```json
{
  "url": "string",
  "filename": "string",
  "type": "mime",
  "size": "number",
  "isImage": "boolean",
  "isPdf": "boolean"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Upload catalog media multipart file to /public/uploads. Endpoint: POST /api/v1/catalog/upload. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Publish catalog items to destination (webhook/WordPress/Shopify adapters)

Publish catalog items to destination (webhook/WordPress/Shopify adapters).

**Endpoint**: `POST /api/v1/catalog/publish`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `destination` | `unknown destination selector` | No | unknown destination selector |
| `items` | `CatalogItem[]` | No | optional explicit list |

### Response
| Status | Body |
|--------|------|
| 200 | `PublishResult` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/catalog/publish' -b cookies.txt -H 'content-type: application/json' -d '{"destination":"webhook"}'
```

### Example Response
```json
"PublishResult"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Publish catalog items to destination (webhook/WordPress/Shopify adapters). Endpoint: POST /api/v1/catalog/publish. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Generate metadata/SEO suggestions for catalog entries

Generate metadata/SEO suggestions for catalog entries.

**Endpoint**: `POST /api/v1/catalog/ai-help`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | `'seo-only' or omitted` | No | 'seo-only' or omitted |
| `context` | `object` | No | object |

### Response
| Status | Body |
|--------|------|
| 200 | `{"suggestions": "object\|array"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/catalog/ai-help' -b cookies.txt -H 'content-type: application/json' -d '{"context":{"itemType":"service","name":"Haircut"}}'
```

### Example Response
```json
{
  "suggestions": "object|array"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Generate metadata/SEO suggestions for catalog entries. Endpoint: POST /api/v1/catalog/ai-help. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
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
