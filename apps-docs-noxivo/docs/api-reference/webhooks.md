# 🔗 Webhooks

Configure your system to receive real-time updates from WhatsApp.

## Inbound Message Event {#inbound-message-event}

Fired whenever a customer sends a message to your WhatsApp number.

### Payload Sample {#payload-sample}
```json
{
  "event": "message",
  "session": "my-session",
  "payload": {
    "id": "false_1234567890@c.us_3EB0...",
    "from": "1234567890@c.us",
    "body": "Help with order",
    "timestamp": 1713345600
  },
  "metadata": {
    "agencyId": "64a1b...",
    "tenantId": "64a1b..."
  }
}
```

---

## Event Types {#event-types}

| Event | Description |
| :--- | :--- |
| `message` | Standard incoming message. |
| `message.ack` | Delivery status update (sent, delivered, read). |
| `message.revoked` | Fired when a message is deleted by the user. |
| `session.status` | Session lifecycle updates (WORKING, FAILED, etc.). |
| `presence.update` | Contact typing or online status updates. |

---

## Message Ack (Delivery Status) {#message-ack-delivery-status}

Fired when a message is sent, delivered, or read.

### Status Values {#status-values}
- `1`: Sent (left the engine).
- `2`: Delivered (received by customer).
- `3` or `4`: Read (opened by customer).
- `-1`: Failed.
