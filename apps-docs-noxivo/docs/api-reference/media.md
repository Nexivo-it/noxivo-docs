# 🖼️ Media

Handle file uploads, downloads, and automated storage synchronization.

## Automated Media Sync {#automated-media-sync}
Noxivo Engine automatically processes incoming and outgoing media. When a message contains media, the Engine:
1. Downloads the media from WhatsApp.
2. Optionally uploads it to your configured Storage Provider (S3, Cloudinary, etc.).
3. Provides a public, permanent URL in the message payload.

---

## Send Media Attachment {#send-media-attachment}

Sends a media file through the engine. This is the recommended way to send images, documents, and videos.

### Endpoint {#endpoint}
`POST /api/v1/messages/send`

### Example Body {#example-body}
```json
{
  "agencyId": "...",
  "tenantId": "...",
  "to": "1234567890@c.us",
  "text": "Check this out!",
  "attachments": [
    {
      "url": "https://example.com/image.jpg",
      "kind": "image",
      "mimeType": "image/jpeg",
      "fileName": "promo.jpg"
    }
  ]
}
```

---

## Direct Media Send (Legacy) {#direct-media-send-legacy}
You can also use the dedicated media endpoint, which proxies directly to the underlying messaging provider.

### Endpoint {#endpoint-1}
`POST /api/v1/media/send`

### Example Body {#example-body-1}
```json
{
  "id": "wa_session_123",
  "to": "1234567890@c.us",
  "url": "https://example.com/image.jpg",
  "kind": "image",
  "caption": "Direct proxy send"
}
```

