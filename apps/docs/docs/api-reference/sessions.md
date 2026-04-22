# 🖥️ Session & Connection

WhatsApp sessions are managed entirely through the **Noxivo Dashboard**. To use the Noxivo Engine API, your account must first be connected.

## 0. Dashboard Setup {#0-dashboard-setup}
1. Log in to your **Noxivo Dashboard**.
2. Go to the **Connection** page.
3. Scan the **QR Code** using your WhatsApp mobile application.
4. Once the status shows **Connected**, navigate to **Settings > API Keys**.
5. Generate a **Scoped API Key**. This key is automatically linked to your session.

---

## Session Status {#session-status}
You can programmatically check if your session is currently online and authenticated. Since you are using a Scoped API Key, the Engine automatically detects which session to check.

**Endpoint**: `GET /api/v1/sessions/status`

**Example cURL**:
```bash
curl https://api-workflow-engine.noxivo.app/api/v1/sessions/status \
     -H "X-API-Key: YOUR_SCOPED_KEY"
```

**Response Sample**:
```json
{
  "status": "WORKING",
  "phone": "1234567890",
  "accountName": "My Business Account",
  "platform": "WEBJS"
}
```

---

## Session Details {#session-details}
Retrieve technical metadata about the current session connection.

**Endpoint**: `GET /api/v1/sessions/me`

**Response Sample**:
```json
{
  "id": "1234567890@c.us",
  "pushname": "My Business",
  "platform": "WEBJS",
  "wid": {
    "server": "c.us",
    "user": "1234567890",
    "_serialized": "1234567890@c.us"
  }
}
```

---

## Session Management {#session-management}
While primary control happens in the Dashboard, you can trigger a restart or logout via the API if needed.

**Restart Session**: `POST /api/v1/sessions/restart`
**Logout Session**: `POST /api/v1/sessions/logout`

*Note: Restarting or Logging out will affect all services using this WhatsApp account.*
