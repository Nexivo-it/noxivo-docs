# 🏷️ Labels

Organize chats using labels (WhatsApp Business only).

## List Labels {#list-labels}

Returns all available labels for the session.

### Endpoint {#endpoint}
`GET /api/v1/sessions/:id/labels`

### Example cURL {#example-curl}
```bash
curl https://api-workflow-engine.noxivo.app/api/v1/sessions/my-session/labels \
     -H "X-API-Key: YOUR_ENGINE_KEY"
```

---

## Set Labels for Chat {#set-labels-for-chat}

Assigns one or more labels to a specific chat.

### Endpoint {#endpoint-1}
`POST /api/v1/sessions/:id/labels/set`

### Request Body {#request-body}
```json
{
  "chatId": "1234567890@c.us",
  "labelIds": ["label_1", "label_2"]
}
```
