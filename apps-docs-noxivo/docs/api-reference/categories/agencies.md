# API Reference: agencies

## Overview
The Agencies API enables platform and agency administrators to manage agency records, tenants, team membership, invitations, and administrative metadata. It is the operational control plane for multi-tenant business entities.

**Base URL**: `{{BASE_URL}}`  
**API Version Prefix**: `/api/v1`

---

## List agencies accessible to current session actor

List agencies accessible to current session actor.

**Endpoint**: `GET /api/v1/agencies`

### Authorization
- **Access Model**: Cookie session required (noxivo_session)
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"items": "AgencySummary[]"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/agencies' -b cookies.txt
```

### Example Response
```json
{
  "items": "AgencySummary[]"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: List agencies accessible to current session actor. Endpoint: GET /api/v1/agencies. Authorization: Cookie session required (noxivo_session). Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Create a new agency and default tenant (platform admin only)

Create a new agency and default tenant (platform admin only).

**Endpoint**: `POST /api/v1/agencies`

### Authorization
- **Access Model**: Cookie session required; platform owner scope
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | required |
| `slug` | `string kebab-case` | Yes | required |
| `plan` | `reseller_basic | reseller_pro | enterprise` | Yes | required |
| `customDomain` | `string|null` | No | optional |
| `supportEmail` | `email|null` | No | optional |
| `primaryColor` | `#RRGGBB|null` | No | optional |
| `ownerEmail` | `email` | No | optional |
| `ownerFullName` | `string` | No | optional |

### Response
| Status | Body |
|--------|------|
| 201 | `{"agency": "AgencySummary", "ownerInvitation": {"email": "string", "signupUrl": "string"}}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/agencies' -b cookies.txt -H 'content-type: application/json' -d '{"name":"Acme","slug":"acme","plan":"reseller_basic"}'
```

### Example Response
```json
{
  "agency": "AgencySummary",
  "ownerInvitation": {
    "email": "string",
    "signupUrl": "string"
  }
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Create a new agency and default tenant (platform admin only). Endpoint: POST /api/v1/agencies. Authorization: Cookie session required; platform owner scope. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Get agency admin detail including tenants summary and team counts

Get agency admin detail including tenants summary and team counts.

**Endpoint**: `GET /api/v1/agencies/:agencyId`

### Authorization
- **Access Model**: Cookie session required; target agency access
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Path Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agencyId` | `ObjectId` | No | ObjectId |

### Response
| Status | Body |
|--------|------|
| 200 | `{"agency": "AgencySummary", "tenantCount": "number", "teamCount": "number", "tenants": "TenantSummary[]"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/agencies/$AGENCY_ID' -b cookies.txt
```

### Example Response
```json
{
  "agency": "AgencySummary",
  "tenantCount": "number",
  "teamCount": "number",
  "tenants": "TenantSummary[]"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Get agency admin detail including tenants summary and team counts. Endpoint: GET /api/v1/agencies/:agencyId. Authorization: Cookie session required; target agency access. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Update agency metadata/branding/plan/status

Update agency metadata/branding/plan/status.

**Endpoint**: `PATCH /api/v1/agencies/:agencyId`

### Authorization
- **Access Model**: Cookie session required; canManageAgencySettings + target agency
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | No | optional |
| `customDomain` | `string|null` | No | optional |
| `supportEmail` | `email|null` | No | optional |
| `primaryColor` | `#RRGGBB|null` | No | optional |
| `logoUrl` | `url|null` | No | optional |
| `hidePlatformBranding` | `boolean` | No | optional |
| `plan` | `AgencyPlan` | No | platform owner only |
| `status` | `trial|active|suspended|cancelled` | No | platform owner only |

### Response
| Status | Body |
|--------|------|
| 200 | `AgencySummary` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X PATCH '{{BASE_URL}}/api/v1/agencies/$AGENCY_ID' -b cookies.txt -H 'content-type: application/json' -d '{"supportEmail":"help@acme.com"}'
```

### Example Response
```json
"AgencySummary"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Update agency metadata/branding/plan/status. Endpoint: PATCH /api/v1/agencies/:agencyId. Authorization: Cookie session required; canManageAgencySettings + target agency. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## List tenants for an agency

List tenants for an agency.

**Endpoint**: `GET /api/v1/agencies/:agencyId/tenants`

### Authorization
- **Access Model**: Cookie session required; target agency access
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `TenantSummary[]` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/agencies/$AGENCY_ID/tenants' -b cookies.txt
```

### Example Response
```json
"TenantSummary[]"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: List tenants for an agency. Endpoint: GET /api/v1/agencies/:agencyId/tenants. Authorization: Cookie session required; target agency access. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Create tenant under agency (enforces usage limit and slug uniqueness)

Create tenant under agency (enforces usage limit and slug uniqueness).

**Endpoint**: `POST /api/v1/agencies/:agencyId/tenants`

### Authorization
- **Access Model**: Cookie session required; canManageAgencySettings + target agency
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `slug` | `string kebab-case` | Yes | required |
| `name` | `string` | Yes | required |
| `region` | `eu-west-1 | me-central-1 | us-east-1` | No | eu-west-1 | me-central-1 | us-east-1 |
| `billingMode` | `agency_pays | tenant_pays` | No | agency_pays | tenant_pays |
| `whiteLabelOverrides` | `partial WhiteLabelConfig` | No | optional |

### Response
| Status | Body |
|--------|------|
| 201 | `TenantSummary` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/agencies/$AGENCY_ID/tenants' -b cookies.txt -H 'content-type: application/json' -d '{"slug":"acme-sales","name":"Sales","region":"us-east-1","billingMode":"agency_pays"}'
```

### Example Response
```json
"TenantSummary"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Create tenant under agency (enforces usage limit and slug uniqueness). Endpoint: POST /api/v1/agencies/:agencyId/tenants. Authorization: Cookie session required; canManageAgencySettings + target agency. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Get single tenant detail in agency scope

Get single tenant detail in agency scope.

**Endpoint**: `GET /api/v1/agencies/:agencyId/tenants/:tenantId`

### Authorization
- **Access Model**: Cookie session required; target agency access
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `TenantSummary` |
| 404 | `{"error": "Tenant not found"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/agencies/$AGENCY_ID/tenants/$TENANT_ID' -b cookies.txt
```

### Example Response
```json
"TenantSummary"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Get single tenant detail in agency scope. Endpoint: GET /api/v1/agencies/:agencyId/tenants/:tenantId. Authorization: Cookie session required; target agency access. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## List agency team members and pending invitations

List agency team members and pending invitations.

**Endpoint**: `GET /api/v1/agencies/:agencyId/team`

### Authorization
- **Access Model**: Cookie session required; target agency access
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"members": "TeamMemberRecord[]", "invitations": "AgencyInvitationRecord[]"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/agencies/$AGENCY_ID/team' -b cookies.txt
```

### Example Response
```json
{
  "members": "TeamMemberRecord[]",
  "invitations": "AgencyInvitationRecord[]"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: List agency team members and pending invitations. Endpoint: GET /api/v1/agencies/:agencyId/team. Authorization: Cookie session required; target agency access. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Update team member role/status/tenant access

Update team member role/status/tenant access.

**Endpoint**: `PATCH /api/v1/agencies/:agencyId/team/:userId`

### Authorization
- **Access Model**: Cookie session required; canManageAgencyTeam + target agency
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `role` | `agency_owner | agency_admin | agency_member | viewer` | No | optional |
| `status` | `active | suspended` | No | optional |
| `tenantIds` | `['string']` | No | ['string'] |
| `defaultTenantId` | `string` | No | optional |

### Response
| Status | Body |
|--------|------|
| 200 | `TeamMemberRecord` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X PATCH '{{BASE_URL}}/api/v1/agencies/$AGENCY_ID/team/$USER_ID' -b cookies.txt -H 'content-type: application/json' -d '{"role":"agency_admin"}'
```

### Example Response
```json
"TeamMemberRecord"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Update team member role/status/tenant access. Endpoint: PATCH /api/v1/agencies/:agencyId/team/:userId. Authorization: Cookie session required; canManageAgencyTeam + target agency. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Remove team member (blocks last-owner removal)

Remove team member (blocks last-owner removal).

**Endpoint**: `DELETE /api/v1/agencies/:agencyId/team/:userId`

### Authorization
- **Access Model**: Cookie session required; canManageAgencyTeam + target agency
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"success": true}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X DELETE '{{BASE_URL}}/api/v1/agencies/$AGENCY_ID/team/$USER_ID' -b cookies.txt
```

### Example Response
```json
{
  "success": true
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Remove team member (blocks last-owner removal). Endpoint: DELETE /api/v1/agencies/:agencyId/team/:userId. Authorization: Cookie session required; canManageAgencyTeam + target agency. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## List pending invitations for agency

List pending invitations for agency.

**Endpoint**: `GET /api/v1/agencies/:agencyId/invitations`

### Authorization
- **Access Model**: Cookie session required; target agency access
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `AgencyInvitationRecord[]` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/agencies/$AGENCY_ID/invitations' -b cookies.txt
```

### Example Response
```json
"AgencyInvitationRecord[]"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: List pending invitations for agency. Endpoint: GET /api/v1/agencies/:agencyId/invitations. Authorization: Cookie session required; target agency access. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Create/refresh invitation with signup URL

Create/refresh invitation with signup URL.

**Endpoint**: `POST /api/v1/agencies/:agencyId/invitations`

### Authorization
- **Access Model**: Cookie session required; canManageAgencyTeam + target agency
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | `string email` | Yes | required |
| `fullName` | `string` | No | optional |
| `role` | `agency_admin | agency_member | viewer` | No | agency_admin | agency_member | viewer |
| `tenantIds` | `['string']` | No | ['string'] |

### Response
| Status | Body |
|--------|------|
| 201 | `{"invitation": "AgencyInvitationRecord", "signupUrl": "string"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/agencies/$AGENCY_ID/invitations' -b cookies.txt -H 'content-type: application/json' -d '{"email":"agent@acme.com","role":"agency_member"}'
```

### Example Response
```json
{
  "invitation": "AgencyInvitationRecord",
  "signupUrl": "string"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Create/refresh invitation with signup URL. Endpoint: POST /api/v1/agencies/:agencyId/invitations. Authorization: Cookie session required; canManageAgencyTeam + target agency. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Update invitation fields (role/tenant scope/etc

Update invitation fields (role/tenant scope/etc.).

**Endpoint**: `PATCH /api/v1/agencies/:agencyId/invitations/:invitationId`

### Authorization
- **Access Model**: Cookie session required; canManageAgencyTeam + target agency
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | `string email` | No | optional |
| `fullName` | `string|null` | No | optional |
| `role` | `AgencyTeamRole` | No | optional |
| `tenantIds` | `['string']` | No | ['string'] |
| `status` | `pending|accepted|expired|revoked` | No | optional |

### Response
| Status | Body |
|--------|------|
| 200 | `AgencyInvitationRecord` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X PATCH '{{BASE_URL}}/api/v1/agencies/$AGENCY_ID/invitations/$INVITATION_ID' -b cookies.txt -H 'content-type: application/json' -d '{"role":"agency_admin"}'
```

### Example Response
```json
"AgencyInvitationRecord"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Update invitation fields (role/tenant scope/etc. Endpoint: PATCH /api/v1/agencies/:agencyId/invitations/:invitationId. Authorization: Cookie session required; canManageAgencyTeam + target agency. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Revoke invitation

Revoke invitation.

**Endpoint**: `DELETE /api/v1/agencies/:agencyId/invitations/:invitationId`

### Authorization
- **Access Model**: Cookie session required; canManageAgencyTeam + target agency
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"success": true}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X DELETE '{{BASE_URL}}/api/v1/agencies/$AGENCY_ID/invitations/$INVITATION_ID' -b cookies.txt
```

### Example Response
```json
{
  "success": true
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Revoke invitation. Endpoint: DELETE /api/v1/agencies/:agencyId/invitations/:invitationId. Authorization: Cookie session required; canManageAgencyTeam + target agency. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
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
