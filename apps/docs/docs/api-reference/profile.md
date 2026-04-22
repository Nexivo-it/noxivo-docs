# 👤 Profile

Manage your WhatsApp profile information through the Noxivo Engine.

---

## Get Profile Details {#get-profile-details}
Retrieves your current WhatsApp display name, status, and about info.

**Endpoint**: `GET /api/v1/sessions/:id/profile`

**Example cURL**:
```bash
curl https://api-workflow-engine.noxivo.app/api/v1/sessions/wa_agency_123_tenant_456/profile \
     -H "X-API-Key: YOUR_ENGINE_KEY"
```

---

## Profile Updates (Proxy) {#profile-updates-proxy}
For updating your profile name and about info, you can use the WAHA proxy endpoints directly through the engine.

### Update Display Name {#update-display-name}
**Endpoint**: `POST /api/v1/:session/profile/name`
**Body**: `{ "name": "Noxivo Support" }`

### Update About Info {#update-about-info}
**Endpoint**: `POST /api/v1/:session/profile/about`
**Body**: `{ "about": "Available for support 24/7" }`
