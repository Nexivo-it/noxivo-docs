# API Reference: workflows

## Overview
The Workflows API provides lifecycle operations for workflow definitions, deployment metadata, and execution-related configuration used by the orchestration engine. Use this category to create, inspect, and manage automation logic.

**Base URL**: `{{BASE_URL}}`  
**API Version Prefix**: `/api/v1`

---

## List workflow definitions in session agency/tenant scope

List workflow definitions in session agency/tenant scope.

**Endpoint**: `GET /api/v1/workflows`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"workflows": [{"id": "string", "name": "string", "description": "string", "status": "active\|paused", "type": "string"}]}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/workflows' -b cookies.txt
```

### Example Response
```json
{
  "workflows": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "status": "active|paused",
      "type": "string"
    }
  ]
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: List workflow definitions in session agency/tenant scope. Endpoint: GET /api/v1/workflows. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Create starter workflow definition

Create starter workflow definition.

**Endpoint**: `POST /api/v1/workflows`

### Authorization
- **Access Model**: Cookie session + canManageWorkflows
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | required |
| `description` | `string` | No | optional |
| `channel` | `string` | No | optional, default whatsapp |

### Response
| Status | Body |
|--------|------|
| 200 | `{"id": "string", "name": "string", "key": "string", "status": "paused"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/workflows' -b cookies.txt -H 'content-type: application/json' -d '{"name":"Lead Follow-up"}'
```

### Example Response
```json
{
  "id": "string",
  "name": "string",
  "key": "string",
  "status": "paused"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Create starter workflow definition. Endpoint: POST /api/v1/workflows. Authorization: Cookie session + canManageWorkflows. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Clone a template workflow into current scope

Clone a template workflow into current scope.

**Endpoint**: `POST /api/v1/workflows/clone`

### Authorization
- **Access Model**: Cookie session + canManageWorkflows
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `templateId` | `string` | Yes | required |
| `customName` | `string` | No | optional |

### Response
| Status | Body |
|--------|------|
| 200 | `{"success": true, "workflowId": "string", "workflowName": "string"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/workflows/clone' -b cookies.txt -H 'content-type: application/json' -d '{"templateId":"sales-template"}'
```

### Example Response
```json
{
  "success": true,
  "workflowId": "string",
  "workflowName": "string"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Clone a template workflow into current scope. Endpoint: POST /api/v1/workflows/clone. Authorization: Cookie session + canManageWorkflows. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Fetch raw workflow definition document

Fetch raw workflow definition document.

**Endpoint**: `GET /api/v1/workflows/:workflowId`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"workflow": "WorkflowDefinition"}` |
| 404 | `{"error": "Workflow not found"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/workflows/$WORKFLOW_ID' -b cookies.txt
```

### Example Response
```json
{
  "workflow": "WorkflowDefinition"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Fetch raw workflow definition document. Endpoint: GET /api/v1/workflows/:workflowId. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Update workflow metadata or graphs (editorGraph/compiledDag)

Update workflow metadata or graphs (editorGraph/compiledDag).

**Endpoint**: `PATCH /api/v1/workflows/:workflowId`

### Authorization
- **Access Model**: Cookie session + canManageWorkflows
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`
  - `Content-Type: application/json`

### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | No | optional |
| `description` | `string` | No | optional |
| `editorGraph` | `object` | No | optional |
| `compiledDag` | `object` | No | optional |

### Response
| Status | Body |
|--------|------|
| 200 | `{"success": true, "workflow": "WorkflowDefinition"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X PATCH '{{BASE_URL}}/api/v1/workflows/$WORKFLOW_ID' -b cookies.txt -H 'content-type: application/json' -d '{"description":"Updated"}'
```

### Example Response
```json
{
  "success": true,
  "workflow": "WorkflowDefinition"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Update workflow metadata or graphs (editorGraph/compiledDag). Endpoint: PATCH /api/v1/workflows/:workflowId. Authorization: Cookie session + canManageWorkflows. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Delete workflow definition

Delete workflow definition.

**Endpoint**: `DELETE /api/v1/workflows/:workflowId`

### Authorization
- **Access Model**: Cookie session + canManageWorkflows
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"success": true}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X DELETE '{{BASE_URL}}/api/v1/workflows/$WORKFLOW_ID' -b cookies.txt
```

### Example Response
```json
{
  "success": true
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Delete workflow definition. Endpoint: DELETE /api/v1/workflows/:workflowId. Authorization: Cookie session + canManageWorkflows. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Toggle workflow active/paused flag

Toggle workflow active/paused flag.

**Endpoint**: `POST /api/v1/workflows/:workflowId/toggle`

### Authorization
- **Access Model**: Cookie session + canManageWorkflows
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"success": true, "isActive": "boolean"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl -X POST '{{BASE_URL}}/api/v1/workflows/$WORKFLOW_ID/toggle' -b cookies.txt
```

### Example Response
```json
{
  "success": true,
  "isActive": "boolean"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Toggle workflow active/paused flag. Endpoint: POST /api/v1/workflows/:workflowId/toggle. Authorization: Cookie session + canManageWorkflows. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Return recent workflow runs and related execution events

Return recent workflow runs and related execution events.

**Endpoint**: `GET /api/v1/workflows/:workflowId/runs`

### Authorization
- **Access Model**: Cookie session + canManageWorkflows
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"runs": "WorkflowRun[]", "events": "WorkflowExecutionEvent[]"}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/workflows/$WORKFLOW_ID/runs' -b cookies.txt
```

### Example Response
```json
{
  "runs": "WorkflowRun[]",
  "events": "WorkflowExecutionEvent[]"
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Return recent workflow runs and related execution events. Endpoint: GET /api/v1/workflows/:workflowId/runs. Authorization: Cookie session + canManageWorkflows. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## Aggregate node execution analytics map

Aggregate node execution analytics map.

**Endpoint**: `GET /api/v1/workflows/:workflowId/analytics`

### Authorization
- **Access Model**: Cookie session + canManageWorkflows
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `{"analytics": {"<nodeId>": {"nodeId": "string", "executionCount": "number", "successCount": "number", "failureCount": "number", "avgDurationMs": "number\|null"}}}` |

### Example cURL
```bash
# Copy and paste ready to test
curl '{{BASE_URL}}/api/v1/workflows/$WORKFLOW_ID/analytics' -b cookies.txt
```

### Example Response
```json
{
  "analytics": {
    "<nodeId>": {
      "nodeId": "string",
      "executionCount": "number",
      "successCount": "number",
      "failureCount": "number",
      "avgDurationMs": "number|null"
    }
  }
}
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: Aggregate node execution analytics map. Endpoint: GET /api/v1/workflows/:workflowId/analytics. Authorization: Cookie session + canManageWorkflows. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
```

---

## SSE stream for workflow execution events with hydration of latest run

SSE stream for workflow execution events with hydration of latest run.

**Endpoint**: `GET /api/v1/workflows/:workflowId/execution-events`

### Authorization
- **Access Model**: Cookie session required
- **Headers**:
  - `Cookie: noxivo_session=<SESSION_TOKEN>`

### Response
| Status | Body |
|--------|------|
| 200 | `text/event-stream` |

### Example cURL
```bash
# Copy and paste ready to test
curl -N '{{BASE_URL}}/api/v1/workflows/$WORKFLOW_ID/execution-events' -b cookies.txt
```

### Example Response
```json
"text/event-stream"
```

### AI Agent Prompt
```
Use the Noxivo API to execute this operation: SSE stream for workflow execution events with hydration of latest run. Endpoint: GET /api/v1/workflows/:workflowId/execution-events. Authorization: Cookie session required. Generate the request payload from the documented schema, perform the request, validate the HTTP status code, and return a structured summary of the result.
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
