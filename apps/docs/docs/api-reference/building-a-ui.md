# 🛠️ Building a Messaging UI

Learn how to use the Noxivo Engine to build a fully functional messaging interface with synchronization.

## 0. Prerequisite: Connect Account
Before using the API, your client must connect their WhatsApp account and generate an API key.
1. Log in to the **Noxivo Dashboard**.
2. Scan the **QR Code** to link WhatsApp.
3. Generate a **Scoped API Key** for your application.

---

## 1. Listen for Webhooks

Set up a webhook listener in your application to receive incoming messages in real-time.

```json
{
  "event": "message",
  "payload": {
    "from": "1234567890@c.us",
    "body": "Hi, I need help!"
  },
  "metadata": {
    "agencyId": "...",
    "tenantId": "..."
  }
}
```

---

## 2. Display Message History

When a user opens a conversation, fetch the history with automated engine synchronization.

```bash
curl https://api-workflow-engine.noxivo.app/api/v1/inbox/conversations/64a1b2.../messages \
     -H "X-API-Key: YOUR_ENGINE_KEY" \
     -G \
     -d "agencyId=64a1b2c3..." \
     -d "tenantId=64a1b2c3..."
```

---

## 3. Send a Reply (with Sync)

To ensure the reply is tracked correctly by the Engine and has all relevant metadata, use the synchronized send endpoint.

```bash
curl -X POST https://api-workflow-engine.noxivo.app/api/v1/inbox/conversations/64a1b2.../messages \
     -H "X-API-Key: YOUR_ENGINE_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "agencyId": "...",
       "tenantId": "...",
       "content": "Sure, how can I help you?"
     }'
```

---

## 4. Manage Handoff

If you want to stop automated AI responses and hand the conversation to a human operator, use the Handoff API.

```bash
curl -X POST https://api-workflow-engine.noxivo.app/api/v1/conversations/64a1b2.../assign \
     -H "X-API-Key: YOUR_ENGINE_KEY"
```
