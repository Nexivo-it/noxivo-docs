# 📤 Chatting

Methods for sending messages through the Noxivo Engine.

## Send Message (Synchronized) {#send-message-synchronized}

Sends a message and ensures it is tracked by the engine with full delivery lifecycle.

### Endpoint {#endpoint}
`POST /api/v1/messages/send`


### Request Body {#request-body}
| Field | Type | Description |
| :--- | :--- | :--- |
| `agencyId` | string | **Required**. |
| `tenantId` | string | **Required**. |
| `to` | string | **Required**. Phone or contactId. |
| `text` | string | Message content. |
| `attachments` | array | Optional list of media. |

### Full Attachment Example {#full-attachment-example}
```json
{
  "agencyId": "64a1b2c3...",
  "tenantId": "64a1b2c3...",
  "to": "1234567890@c.us",
  "text": "Hi! Check this invoice.",
  "attachments": [
    {
      "url": "https://example.com/invoice_101.pdf",
      "kind": "document",
      "mimeType": "application/pdf",
      "fileName": "invoice_101.pdf",
      "caption": "Your monthly invoice"
    }
  ]
}
```

### Example cURL {#example-curl}
```bash
curl -X POST https://api-workflow-engine.noxivo.app/api/v1/messages/send \
     -H "X-API-Key: YOUR_ENGINE_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "agencyId": "64a1b2c3...",
       "tenantId": "64a1b2c3...",
       "to": "1234567890",
       "text": "Hello World"
     }'
```

---

## Send Interactive Buttons (Raw) {#send-interactive-buttons-raw}

Sends a message with reply buttons or URL links.

### Endpoint {#endpoint-1}
`POST /api/v1/sendButtons`

### JSON Body {#json-body}
```json
{
  "session": "my-session",
  "chatId": "1234567890@c.us",
  "header": "Welcome",
  "body": "Please select your department:",
  "footer": "Noxivo Support",
  "buttons": [
    { "type": "reply", "text": "Technical", "id": "dept_tech" },
    { "type": "reply", "text": "Billing", "id": "dept_bill" }
  ]
}
```

---

## Send Interactive List (Raw) {#send-interactive-list-raw}

Sends a menu with sections and selectable rows.

### Endpoint {#endpoint-2}
`POST /api/v1/sendList`

### JSON Body {#json-body-1}
```json
{
  "session": "my-session",
  "chatId": "1234567890@c.us",
  "message": {
    "title": "Main Menu",
    "description": "How can we help?",
    "button": "Open Menu",
    "sections": [
      {
        "title": "Options",
        "rows": [
          { "title": "Option 1", "rowId": "opt_1" },
          { "title": "Option 2", "rowId": "opt_2" }
        ]
      }
    ]
  }
}
```
