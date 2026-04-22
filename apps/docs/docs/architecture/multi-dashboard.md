# Multi-Dashboard Architecture

## Overview {#overview}

The Workflow Engine is designed to serve **multiple independent dashboards** simultaneously. Each dashboard represents a separate project/tenant with its own users, agencies, and tenants. The engine acts as a centralized WhatsApp automation hub.

## Architecture {#architecture}

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         WORKFLOW ENGINE                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Own Admin Dashboard (Engine Admin)                            │   │
│  │  - View all agencies from all dashboards                        │   │
│  │  - Manage all messaging sessions                                     │   │
│  │  - Monitor system health                                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Dashboard Registry Service                                     │   │
│  │  - Register/manage connected dashboards                         │   │
│  │  - Track agency ownership per dashboard                         │   │
│  │  - Handle webhook routing                                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Engine Database                                                │   │
│  │  - MessagingSessionBindings (agencyId, tenantId)                     │   │
│  │  - WorkflowDefinitions, WorkflowExecutions                     │   │
│  │  - Conversations, Messages                                      │   │
│  │  - DashboardConfig (agencyId, dashboardUrl, webhookSecret)       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
           │                                         │
           │ API calls (X-API-Key + agencyId)      │ Webhooks
           ▼                                         ▼
┌──────────────────────┐               ┌──────────────────────┐
│    Dashboard A       │               │    Dashboard B       │
│    (Project 1)       │               │    (Project 2)       │
│                      │               │                      │
│  Own Database:       │               │  Own Database:       │
│  - Users             │               │  - Users              │
│  - Agencies          │               │  - Agencies           │
│  - Tenants           │               │  - Tenants            │
└──────────────────────┘               └──────────────────────┘
```

## How It Works {#how-it-works}

### 1. Dashboard Registration {#1-dashboard-registration}

When a new dashboard connects to the engine, it registers itself:

```bash
POST /v1/internal/dashboard/register
Authorization: PSK <WORKFLOW_ENGINE_INTERNAL_PSK>
Content-Type: application/json

{
  "agencyId": "agency_abc123",
  "dashboardName": "My SaaS Platform",
  "dashboardUrl": "https://myapp.com",
  "webhookSecret": "very-long-secret-string-min-32-chars"
}
```

**Response:**
```json
{
  "success": true,
  "apiKey": "generated-api-key-for-this-dashboard",
  "agencyId": "agency_abc123"
}
```

The dashboard stores this `apiKey` and uses it for all subsequent API calls.

### 2. API Authentication {#2-api-authentication}

Every API call from a dashboard includes:
- `X-API-Key` header with the dashboard's unique API key
- `agencyId` and `tenantId` in the request body or query params

```bash
GET /api/v1/sessions?agencyId=agency_abc123&tenantId=tenant_xyz789
X-API-Key: dashboard-generated-api-key
```

### 3. Webhook Routing {#3-webhook-routing}

When messaging sends webhooks, the engine identifies which agency/tenant the event belongs to and forwards it to the correct dashboard.

### 4. Engine Admin Dashboard {#4-engine-admin-dashboard}

The engine's own admin dashboard shows all registered dashboards, all agencies across all dashboards, and all messaging sessions with agency/tenant metadata.

## Dashboard Registry API Endpoints {#dashboard-registry-api-endpoints}

### Internal (Dashboard → Engine) {#internal-dashboard--engine}

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/internal/dashboard/register` | Register new dashboard |
| GET | `/v1/internal/dashboard/config?agencyId=` | Get dashboard config |
| PATCH | `/v1/internal/dashboard/config` | Update dashboard config |
| GET | `/v1/internal/dashboard/agencies` | List all agencies |

### Admin (Engine Admin Dashboard) {#admin-engine-admin-dashboard}

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/dashboards` | List all registered dashboards |
| GET | `/api/v1/admin/dashboards/:agencyId` | Get dashboard details |
| GET | `/api/v1/admin/dashboards/:agencyId/sessions` | Get sessions for dashboard |
| POST | `/api/v1/admin/dashboards/:agencyId/suspend` | Suspend dashboard |
| POST | `/api/v1/admin/dashboards/:agencyId/activate` | Reactivate dashboard |

## Environment Variables {#environment-variables}

### Engine Side {#engine-side}

```bash
# Required
ENGINE_API_KEY=...                    # Master API key
WORKFLOW_ENGINE_INTERNAL_PSK=...      # PSK for internal dashboard routes
```

### Dashboard Side {#dashboard-side}

```bash
# Dashboard configuration
NEXT_PUBLIC_ENGINE_BASE_URL=https://engine.example.com
ENGINE_API_KEY=...                    # API key from engine registration
WORKFLOW_ENGINE_INTERNAL_PSK=...       # PSK for registration
```

## Use Cases {#use-cases}

### 1. SaaS Platform {#1-saas-platform}
A company builds a SaaS platform on top of the engine. They register their dashboard once and get an API key. All their customers' agencies are under their single `agencyId`.

### 2. White-Label Solution {#2-white-label-solution}
A digital agency white-labels the engine for multiple clients. Each client gets their own `agencyId`, but all route through the same dashboard.

### 3. Multi-Tenant Enterprise {#3-multi-tenant-enterprise}
An enterprise runs multiple divisions. Each division has its own dashboard, but all connect to one central engine.

## Security Considerations {#security-considerations}

1. **API Key Rotation**: Dashboard should rotate API keys periodically
2. **Webhook Validation**: Dashboard must validate webhook signatures using `webhookSecret`
3. **PSK Protection**: The registration and internal endpoints are protected by PSK
4. **Rate Limiting**: Implement rate limiting per dashboard API key