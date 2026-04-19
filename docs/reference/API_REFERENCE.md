# Noxivo API Reference

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NOXIVO_API_KEY` | Developer API key for external integrations | Yes (for external API access) |
| `MessagingProvider_PROXY_BASE_URL` | MessagingProvider Plus proxy URL | Yes (WhatsApp) |
| `MessagingProvider_PROXY_AUTH_TOKEN` | MessagingProvider Plus auth token | Yes (WhatsApp) |
| `MONGODB_URI` | MongoDB connection string | Yes |
| `REDIS_URL` | Redis URL (optional, for realtime) | No |
| `WORKFLOW_ENGINE_INTERNAL_BASE_URL` | Workflow engine URL (internal) | Yes |
| `WORKFLOW_ENGINE_INTERNAL_PSK` | Internal API secret | Yes |

## Dashboard API Endpoints

### Auth
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/session` - Get current session

### Team Inbox
- `GET /api/team-inbox` - List conversations
- `GET /api/team-inbox/events` - SSE events stream
- `POST /api/team-inbox/[conversationId]/messages` - Send message
- `POST /api/team-inbox/[conversationId]/assign` - Assign conversation
- `POST /api/team-inbox/[conversationId]/read` - Mark read
- `POST /api/team-inbox/[conversationId]/suggest-reply` - AI suggestion

### Settings
- `GET /api/settings/qr` - Get WhatsApp QR code (auto-creates session if needed)

### MessagingProvider Proxy (All MessagingProvider Session Operations)

Use the proxy endpoints to control WhatsApp sessions directly:

| Endpoint | Description |
|---------|------------|
| `GET /api/messaging-proxy/{session}/sessions` | List all sessions |
| `POST /api/messaging-proxy/{session}/sessions` | Create new session |
| `GET /api/messaging-proxy/{session}` | Get session details |
| `PUT /api/messaging-proxy/{session}` | Update session config |
| `DELETE /api/messaging-proxy/{session}` | Delete session |
| `POST /api/messaging-proxy/{session}/start` | Start session |
| `POST /api/messaging-proxy/{session}/stop` | Stop session |
| `POST /api/messaging-proxy/{session}/restart` | Restart session |
| `POST /api/messaging-proxy/{session}/logout` | Logout session |
| `GET /api/messaging-proxy/{session}/auth/qr?format=raw` | Get QR code (raw) |
| `GET /api/messaging-proxy/{session}/auth/qr?format=image` | Get QR code (image) |
| `POST /api/messaging-proxy/{session}/auth/request-code` | Request pairing code |
| `GET /api/messaging-proxy/{session}/me` | Get authenticated account info |

### Agencies
- `GET /api/agencies` - List agencies
- `POST /api/agencies` - Create agency

## MessagingProvider Session Config

When creating a session, you can pass config:

```json
{
  "name": "my-session",
  "start": true,
  "config": {
    "client": { "deviceName": "MyDevice" },
    "webhooks": [{ "url": "https://yoursite.com/webhook", "events": ["message", "session.status"] }],
    "metadata": { "userId": "123", "tenantId": "abc" }
  }
}
```

## Running the App

```bash
# Install dependencies
pnpm install

# Run both services (dev mode)
pnpm dev

# Or individually
pnpm --filter @noxivo/dashboard dev
pnpm --filter @noxivo/workflow-engine dev

# Build for production
pnpm build

# Run tests
pnpm test
```

## Memory Note

The dev scripts are capped at 768MB via `NODE_OPTIONS='--max-old-space=768'`. If you need more memory, increase this value in package.json scripts.