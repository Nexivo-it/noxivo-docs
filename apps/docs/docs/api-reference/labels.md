# 🏷️ Labels

Organize chats using labels (WhatsApp Business only).

## List Labels

Returns all available labels for the session.

### Endpoint
`GET /api/v1/sessions/:id/labels`

### Example cURL
```bash
curl https://api-workflow-engine.noxivo.app/api/v1/sessions/my-session/labels \
     -H "X-API-Key: YOUR_ENGINE_KEY"
```

---

## Set Labels for Chat

Assigns one or more labels to a specific chat.

### Endpoint
`POST /api/v1/sessions/:id/labels/set`

### Request Body
```json
{
  "chatId": "1234567890@c.us",
  "labelIds": ["label_1", "label_2"]
}
```
