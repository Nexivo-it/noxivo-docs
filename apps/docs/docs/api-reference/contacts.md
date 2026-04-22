# 👥 Contacts

Manage and interact with WhatsApp contacts through the Noxivo Engine.

---

## Get All Contacts
Retrieves a list of all contacts synchronized with the current session.

**Endpoint**: `GET /api/v1/sessions/:id/contacts`

**Example cURL**:
```bash
curl https://api-workflow-engine.noxivo.app/api/v1/sessions/wa_agency_123_tenant_456/contacts \
     -H "X-API-Key: YOUR_ENGINE_KEY"
```

---

## Get Contact Identity
Retrieves the canonical contact ID and internal metadata for a raw contact ID or phone number.

**Endpoint**: `GET /api/v1/inbox/chats?agencyId=...&tenantId=...`

---

## Contact Management (Proxy)
For blocking, unblocking, and manual syncing, you can use the WAHA proxy endpoints directly through the engine.

### Block Contact
**Endpoint**: `POST /api/v1/:session/block`
**Body**: `{ "chatId": "1234567890@c.us" }`

### Unblock Contact
**Endpoint**: `POST /api/v1/:session/unblock`
**Body**: `{ "chatId": "1234567890@c.us" }`

### Sync Contacts
**Endpoint**: `POST /api/v1/:session/syncContacts`
