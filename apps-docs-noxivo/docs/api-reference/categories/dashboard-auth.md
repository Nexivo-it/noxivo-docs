# API Reference: dashboard-auth

## Overview
The Dashboard Authentication API manages sign-up, login, logout, session introspection, and pre-login agency branding resolution. These endpoints are the primary entry point for dashboard identity and tenant-aware onboarding.

**Base URL**: `{{BASE_URL}}`  
**API Version Prefix**: `/api/v1`

---

## Resolve pre-login agency branding by slug

Resolve pre-login agency branding by slug.

**Endpoint**: `GET /api/v1/dashboard-auth/branding/:agencySlug`

### Authorization
- **Access Model**: Public (no API key, no session required)
- **Headers**:
  - No authentication header required for this endpoint.

### Path Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agencySlug` | `string` | Yes | required |

### Response
| Status | Body |
|--------|------|
| 200 | `{"agencyId": "string", "agencyName": "string", "agencySlug": "string", "branding": "WhiteLabelConfig"}` |
| 404 | `{"error": "Not found"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X GET '{{BASE_URL}}/api/v1/dashboard-auth/branding/acme'
```

### Example Response
```json
{
  "agencyId": "string",
  "agencyName": "string",
  "agencySlug": "string",
  "branding": "WhiteLabelConfig"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Resolve pre-login agency branding by slug. Endpoint: GET /api/v1/dashboard-auth/branding/:agencySlug. Authorization: Public (no API key, no session required). Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Authenticate user and create noxivo_session cookie

Authenticate user and create noxivo_session cookie.

**Endpoint**: `POST /api/v1/dashboard-auth/login`

### Authorization
- **Access Model**: Public endpoint; sets HttpOnly session cookie on success
- **Headers**:
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | `string email` | Yes | required |
| `password` | `string min 8 chars` | Yes | required |

### Response
| Status | Body |
|--------|------|
| 200 | `{"user": {"id": "string", "agencyId": "string", "tenantId": "string", "tenantIds": ["string"], "email": "string", "fullName": "string", "role": "platform_admin \| agency_owner \...` |
| 401 | `{"error": "Invalid email or password"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/dashboard-auth/login' -H 'content-type: application/json' -d '{"email":"owner@acme.com","password":"password123"}' -c cookies.txt
```

### Example Response
```json
{
  "user": {
    "id": "string",
    "agencyId": "string",
    "tenantId": "string",
    "tenantIds": [
      "string"
    ],
    "email": "string",
    "fullName": "string",
    "role": "platform_admin | agency_owner | agency_admin | agency_member | viewer",
    "status": "active | suspended"
  },
  "setCookie": "noxivo_session"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Authenticate user and create noxivo_session cookie. Endpoint: POST /api/v1/dashboard-auth/login. Authorization: Public endpoint; sets HttpOnly session cookie on success. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Create owner/invited user account and create session cookie

Create owner/invited user account and create session cookie.

**Endpoint**: `POST /api/v1/dashboard-auth/signup`

### Authorization
- **Access Model**: Public endpoint; sets HttpOnly session cookie on success
- **Headers**:
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | `string email` | Yes | required |
| `password` | `string min 8 chars` | Yes | required |
| `fullName` | `string 2-120 chars` | Yes | required |
| `agencyName` | `string 2-120 chars` | Yes | required when invitationToken is omitted |
| `invitationToken` | `string` | No | optional |

### Response
| Status | Body |
|--------|------|
| 200 | `{"user": "AuthenticatedUser", "setCookie": "noxivo_session"}` |
| 400 | `{"error": "Validation or invitation/domain error"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/dashboard-auth/signup' -H 'content-type: application/json' -d '{"email":"new@acme.com","password":"password123","fullName":"Jane Doe","agencyName":"Acme"}' -c cookies.txt
```

### Example Response
```json
{
  "user": "AuthenticatedUser",
  "setCookie": "noxivo_session"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Create owner/invited user account and create session cookie. Endpoint: POST /api/v1/dashboard-auth/signup. Authorization: Public endpoint; sets HttpOnly session cookie on success. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Delete active auth session token (if any) and clear session cookie

Delete active auth session token (if any) and clear session cookie.

**Endpoint**: `POST /api/v1/dashboard-auth/logout`

### Authorization
- **Access Model**: Public endpoint; consumes optional noxivo_session cookie
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"ok": true}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/dashboard-auth/logout' -b cookies.txt -c cookies.txt
```

### Example Response
```json
{
  "ok": true
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Delete active auth session token (if any) and clear session cookie. Endpoint: POST /api/v1/dashboard-auth/logout. Authorization: Public endpoint; consumes optional noxivo_session cookie. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Return current authenticated actor resolved from noxivo_session cookie

Return current authenticated actor resolved from noxivo_session cookie.

**Endpoint**: `GET /api/v1/dashboard-auth/session`

### Authorization
- **Access Model**: Cookie session required (noxivo_session)
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"user": "Session actor"}` |
| 401 | `{"error": "Unauthorized"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X GET '{{BASE_URL}}/api/v1/dashboard-auth/session' -b cookies.txt
```

### Example Response
```json
{
  "user": "Session actor"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Return current authenticated actor resolved from noxivo_session cookie. Endpoint: GET /api/v1/dashboard-auth/session. Authorization: Cookie session required (noxivo_session). Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
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
