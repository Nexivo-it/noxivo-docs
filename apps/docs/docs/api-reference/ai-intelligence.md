# 🧠 AI & Intelligence

Advanced agentic capabilities of the Noxivo Engine.

## AI Sales Agent Control <span class="badge badge--success">SaaS Managed</span>

Manage the status and behavior of the built-in AI Sales Agent for a specific tenant.

### Get Agent State
Retrieves whether the agent is enabled and its current operational mode.

**Endpoint**: `POST /api/v1/ai-sales-agent/state`

**Request Body**:
```json
{
  "agencyId": "agency_123",
  "tenantId": "tenant_456"
}
```

**Response**:
```json
{
  "enabled": true,
  "mode": "bot_active" 
}
```
*Modes: `bot_active` (AI responds), `human_takeover` (AI is paused).*

---

### Update Agent State
Enable/disable the agent or switch between AI and Human modes.

**Endpoint**: `PUT /api/v1/ai-sales-agent/state`

**Request Body**:
```json
{
  "agencyId": "agency_123",
  "tenantId": "tenant_456",
  "enabled": true,
  "mode": "bot_active"
}
```

---

### Manage Agent Persona
Configure the AI's identity, tone, and system prompt.

**Endpoints**:
- `POST /api/v1/ai-sales-agent/persona` (Get current persona)
- `PUT /api/v1/ai-sales-agent/persona` (Update persona)

**Persona Object**:
```json
{
  "agencyId": "agency_123",
  "tenantId": "tenant_456",
  "agentName": "Sarah",
  "modelChoice": "gpt-4o",
  "systemPrompt": "You are a helpful sales assistant for...",
  "fallbackMessage": "I'm not sure about that, let me check with a human.",
  "temperature": 0.7,
  "maxTokens": 1000,
  "active": true
}
```

---

## Agentic Context & Memory

### Get Inbox Context
Generates a hyper-contextual system prompt for an LLM by injecting contact memories and recent message history.

**Endpoint**: `POST /api/v1/ai/inbox-context`

**Request Body**:
```json
{
  "agencyId": "64a1b2c3...",
  "tenantId": "64a1b2c3...",
  "conversationId": "64a1b2c3..."
}
```

---

### Manage Memories
Create or delete contact-specific facts in the Memory Vault.

**Endpoints**:
- `GET /api/v1/memories?contactId=...`
- `POST /api/v1/memories`
- `DELETE /api/v1/memories/:id`

**Create Memory Body**:
```json
{
  "agencyId": "...",
  "tenantId": "...",
  "contactId": "1234567890@c.us",
  "fact": "Customer is interested in the Enterprise plan.",
  "category": "context",
  "source": "ai_extracted"
}
```
