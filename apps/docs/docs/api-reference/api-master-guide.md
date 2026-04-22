# 🚀 Noxivo Engine API: Master Guide

This guide provides a comprehensive technical reference for the Noxivo Engine API. It includes clean, copy-pasteable HTTP request blocks for developers and automation engineers (n8n, Make, Zapier).

## 1. Authentication {#1-authentication}

Noxivo uses **Scoped API Keys** to authenticate all requests. These keys are linked directly to your WhatsApp session in the background, allowing you to use the API without providing complex configuration IDs in every request.

### How to Connect {#how-to-connect}
1.  **Log in** to your Noxivo Agency Dashboard.
2.  **Scan the QR Code** to connect your WhatsApp account.
3.  Go to **Settings > API Keys** and click **Generate New Key**.
4.  Copy the generated `API-Key`.

### Zero-Config Usage {#zero-config-usage}
Because your API key is "scoped" to your account, you do not need to provide an `agencyId` or `tenantId` in your requests. The Engine automatically detects the correct session.

```http
API-Key: your-scoped-api-key
Content-Type: application/json
```

---

## 2. Messaging & History {#2-messaging--history}

### Send Message {#send-message}
Sends a message to a WhatsApp number. The Engine automatically routes it through your connected session.

**Endpoint**: `POST /api/v1/messages/send`

**Example Request**:
```json
{
  "to": "1234567890@c.us",
  "text": "Hello! This was sent via the Scoped API."
}
```

### Get Messaging History {#get-messaging-history}
Retrieves synchronized chat logs and messages.

**Endpoint**: `GET /api/v1/inbox/chats`
**Endpoint**: `GET /api/v1/inbox/conversations/:id/messages`

---

## 3. Webhooks & Events {#3-webhooks--events}
Receive real-time notifications for incoming messages and delivery status.

**Configuration**: Set your webhook URL in the **Noxivo Dashboard**.

**Events**:
- `message`: New incoming message received.
- `message.ack`: Delivery status (sent, delivered, read).


---

## 3. Resource Management {#3-resource-management}

### Sessions & Status {#sessions--status}
Check if your WhatsApp account is currently online.

**Endpoint**: `GET /api/v1/sessions/status`

---

### Contacts {#contacts}
Retrieve all contacts synchronized with your account.

**Endpoint**: `GET /api/v1/sessions/contacts`

---

### Media (Images & Audio) {#media-images--audio}
Send images, audio, and documents by including them in the `attachments` array.

**Endpoint**: `POST /api/v1/messages/send`

**Example Payload**:
```json
{
  "to": "1234567890@c.us",
  "text": "Check this invoice.",
  "attachments": [
    {
      "url": "https://example.com/invoice.pdf",
      "kind": "document",
      "mimeType": "application/pdf",
      "fileName": "invoice.pdf"
    }
  ]
}
```

---

## 4. AI Sales Agent {#4-ai-sales-agent}

Toggle the automated AI responder and manage its persona.

**Toggle Status**: `PUT /api/v1/ai-sales-agent/state`
**Update Persona**: `PUT /api/v1/ai-sales-agent/persona`

---

## 5. n8n & Automation {#5-n8n--automation}
Noxivo is designed to be easily integrated with external automation tools. Simply use the **HTTP Request** node in n8n or Zapier with your **Scoped API Key** to start automating your WhatsApp messages without any additional configuration.

