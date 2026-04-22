# 📜 Messaging History

The Messaging History API provides endpoints to retrieve and synchronize WhatsApp conversations and messages between the Noxivo Engine and your application.

---

## List Conversations
Retrieves a paginated list of chats associated with your account. This endpoint automatically triggers a background synchronization with WhatsApp.

**Endpoint**: `GET /api/v1/inbox/chats`

**Query Parameters**:
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `agencyId` | string | **Yes** | Your Agency identifier from the Dashboard. |
| `tenantId` | string | **Yes** | Your Tenant identifier from the Dashboard. |
| `limit` | number | No | Number of items per page (default: 20). |
| `offset` | number | No | Number of items to skip. |
| `pages` | number | No | Sync depth (1-20). |

**Response Sample**:
```json
{
  "chats": [
    {
      "id": "1234567890@c.us",
      "name": "John Doe",
      "picture": "https://pps.whatsapp.net/...",
      "lastMessage": {
        "body": "Hi there!",
        "timestamp": 1713345600,
        "fromMe": false
      },
      "unreadCount": 2
    }
  ],
  "total": 42,
  "hasMore": true
}
```

---

## Get Message History
Fetches messages for a specific conversation ID. The engine ensures missing history is fetched from WhatsApp before returning the results.

**Endpoint**: `GET /api/v1/inbox/conversations/:conversationId/messages`

**Query Parameters**:
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `agencyId` | string | **Yes** | Agency identifier. |
| `tenantId` | string | **Yes** | Tenant identifier. |
| `limit` | number | No | Number of items per page. |
| `offset` | number | No | Number of items to skip. |

**Response Sample**:
```json
{
  "messages": [
    {
      "id": "false_1234567890@c.us_3EB0...",
      "from": "1234567890@c.us",
      "fromMe": false,
      "to": "me",
      "body": "Hello!",
      "timestamp": 1713345600,
      "ack": 3,
      "ackName": "READ",
      "hasMedia": false
    }
  ],
  "hasMore": false
}
```

---

## Send Message (with Sync)
Sends a message to a conversation. This is the preferred way to send messages to ensure they are properly tracked and synced across all engine services.

**Endpoint**: `POST /api/v1/inbox/conversations/:conversationId/messages`

**Body**:
```json
{
  "agencyId": "...",
  "tenantId": "...",
  "content": "Hi, how can I help you?",
  "attachments": []
}
```

---

## Message Delivery Status
Retrieves the real-time delivery status for a specific message.

**Endpoint**: `GET /api/v1/inbox/messages/:messageId/status`

**Query Parameters**:
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `agencyId` | string | **Yes** | Agency identifier. |
| `tenantId` | string | **Yes** | Tenant identifier. |
