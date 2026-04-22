# 🚀 Noxivo Engine: n8n Integration Guide

This guide provides a comprehensive reference for connecting **n8n** (or Make/Zapier) to the **Noxivo Engine API**. 

By leveraging **Scoped API Keys**, you can achieve a "Zero-Config" setup where the engine automatically routes requests to the correct WhatsApp session without needing to provide internal identifiers line `agencyId` or `tenantId` in every request.

---

## 1. Global Setup & Authentication {#1-global-setup--authentication}

In your n8n workflow, use the **HTTP Request** node to communicate with the engine.

### Connection Details {#connection-details}
- **Base URL**: `https://api-workflow-engine.noxivo.app`
- **Authentication**: Header-based (`X-API-Key`)

### Required Headers {#required-headers}
| Header | Value | Description |
| :--- | :--- | :--- |
| `X-API-Key` | `nx_...` | Your Scoped API Key (found in Dashboard Settings) |
| `Content-Type` | `application/json` | Required for all POST/PUT requests |

> [!TIP]
> **Zero-Config Advantage**: When using a scoped key (`nx_...`), the engine knows exactly which WhatsApp account you are managing. You do **not** need to include `agencyId` or `tenantId` in your request bodies.

---

## 2. Sending Messages (SaaS Tracking) {#2-sending-messages-saas-tracking}

Sending messages via `/api/v1/messages/send` ensures that all outbound traffic is recorded in your **Noxivo Team Inbox** for full visibility across your agency.

### A. Send Simple Text {#a-send-simple-text}
- **Method**: `POST`
- **URL**: `https://api-workflow-engine.noxivo.app/api/v1/messages/send`

**JSON Body**:
```json
{
  "to": "1234567890@c.us",
  "text": "Hello from n8n! This message is tracked in the Noxivo Dashboard."
}
```

### B. Send Image or PDF {#b-send-image-or-pdf}
- **Method**: `POST`
- **URL**: `https://api-workflow-engine.noxivo.app/api/v1/messages/send`

**JSON Body**:
```json
{
  "to": "1234567890@c.us",
  "text": "Please find your invoice attached.",
  "attachments": [
    {
      "url": "https://example.com/invoice.pdf",
      "kind": "document",
      "mimeType": "application/pdf",
      "fileName": "invoice_123.pdf"
    }
  ]
}
```

---

## 3. Advanced Features (Passthrough) {#3-advanced-features-passthrough}

The Noxivo Engine provides a seamless passthrough to advanced WhatsApp features. These endpoints require more specific parameters but offer high interactivity.

### Send Interactive Buttons {#send-interactive-buttons}
- **Method**: `POST`
- **URL**: `https://api-workflow-engine.noxivo.app/api/v1/sendButtons`

**JSON Body**:
```json
{
  "chatId": "1234567890@c.us",
  "header": "Welcome",
  "body": "How can we help you today?",
  "buttons": [
    { "type": "reply", "text": "Support", "id": "action_support" },
    { "type": "url", "text": "Docs", "url": "https://noxivo-docs.netlify.app" }
  ]
}
```

---

## 4. Inbound: Handling Customer Replies {#4-inbound-handling-customer-replies}

To build an automated chatbot or response system, you must configure a Webhook in n8n.

1.  **Create Webhook**: Add a **Webhook** node in n8n (Method: `POST`, Path: `noxivo-inbound`).
2.  **Toggle Production**: Copy the **Production URL**.
3.  **Register Webhook**: Paste this URL into the **Webhook URL** field in your Noxivo Dashboard (Tenant Settings).

### Inbound Payload Structure {#inbound-payload-structure}
When a message arrives, n8n will receive a JSON payload like this:

```json
{
  "event": "message",
  "payload": {
    "from": "1234567890@c.us",
    "body": "I have a question about my order",
    "timestamp": 1713345600
  },
  "metadata": {
    "agencyId": "...",
    "tenantId": "..."
  }
}
```

### n8n Expression Cheat Sheet {#n8n-expression-cheat-sheet}
| Target Data | n8n Expression |
| :--- | :--- |
| **Message Text** | `{{ $json.payload.body }}` |
| **Sender Phone** | `{{ $json.payload.from }}` |
| **System Event** | `{{ $json.event }}` |

---

## 5. Session & Profile info {#5-session--profile-info}

Check if your connection is live or fetch your own profile data.

- **Get Profile**: `GET /api/v1/sessions/me/profile`
- **Status Check**: `GET /api/v1/status`

> [!IMPORTANT]
> Always use `https` for production requests to ensure your API Key remains secure in transit.
