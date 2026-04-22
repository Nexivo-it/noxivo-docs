# Direct messaging API Access (Proxy)

The Noxivo Engine provides a comprehensive proxy to the underlying **WhatsApp HTTP API (messaging)**. This allows you to use any standard messaging endpoint while leveraging the Engine's authentication and multi-tenant routing.

## The Passthrough Pattern {#the-passthrough-pattern}

Any request sent to `/api/v1/*` that is not a native Noxivo route will be automatically forwarded to the messaging backend.

**Base URL for Proxy**: `https://api-workflow-engine.noxivo.app/api/v1`

### Authentication {#authentication}
You must include the Noxivo Engine API Key in your request:
- **Header**: `X-API-Key`
- **Value**: `your-engine-api-key`

## Example: Send Native messaging Buttons {#example-send-native-messaging-buttons}

If you want to use the native messaging `sendButtons` feature, you can call it through the engine proxy.

**Endpoint**: `POST /api/v1/sendButtons`

### Request Body {#request-body}
```json
{
  "session": "wa_agency_123_tenant_456",
  "chatId": "1234567890@c.us",
  "header": "Noxivo Order #101",
  "body": "Your package is arriving today. Would you like to track it?",
  "footer": "Noxivo Logistics",
  "buttons": [
    {
      "type": "reply",
      "text": "Track Now",
      "id": "track_btn"
    },
    {
      "type": "url",
      "text": "View Order",
      "url": "https://noxivo-saas.com/orders/101"
    }
  ]
}
```

## Supported Methods {#supported-methods}
The proxy supports all standard HTTP methods:
- `GET`: For fetching data (e.g., `/api/v1/sessions`)
- `POST`: For actions (e.g., `/api/v1/sendText`)
- `PUT`: For updates
- `DELETE`: For removal

## Benefits of Using the Proxy {#benefits-of-using-the-proxy}
1. **Unified Auth**: No need to manage separate messaging API keys.
2. **Internal Networking**: The Engine handles communication with messaging clusters over a private network.
3. **Traceability**: All proxied requests are logged by the Engine for observability.

---

*Note: For the full list of available messaging endpoints, please refer to the [Official messaging Documentation](https://messaging.dev/docs/).*
