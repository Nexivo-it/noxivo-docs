# Spa API

## Overview

The Spa API turns `apps/workflow-engine` into the source of truth for Spa Tique Nails auth, bookings, catalog data, customer projection, site settings, gallery assets, media-provider configuration, and AI concierge configuration.

Base route prefix: `/api/v1/spa`

All spa records are linked to an `agencyId`. Public and guest-entry routes require that agency context explicitly. Authenticated member/admin routes inherit agency scope from the signed-in spa member.

## Auth

### `POST /api/v1/spa/auth/sign-up`
Creates a member account and starts a cookie session.

Request:

```json
{
  "agencyId": "agency-object-id",
  "email": "member@example.com",
  "password": "supersecret123",
  "fullName": "Spa Member",
  "phone": "+15550001111"
}
```

### `POST /api/v1/spa/auth/sign-in`
Signs in an existing member and refreshes the `spa_member_session` cookie.

Request body must include `agencyId`.

### `POST /api/v1/spa/auth/sign-out`
Revokes the current session and clears the cookie.

### `GET /api/v1/spa/auth/me`
Returns the current signed-in member.

## Public Catalog and Booking

### `GET /api/v1/spa/catalog/services`
Returns active services in frontend-compatible shape.

Query parameter required: `agencyId=<agency-object-id>`

Response item example:

```json
{
  "id": "...",
  "name": "Signature Manicure",
  "category": "Manicures",
  "duration": "45 MINS",
  "price": 65,
  "description": "Classic service",
  "image_url": "https://ik.imagekit.io/luxenail/services/signature.png"
}
```

### `POST /api/v1/spa/bookings`
Creates a guest or member booking and stores a service snapshot.

Request:

```json
{
  "agencyId": "agency-object-id",
  "customerName": "Guest Booker",
  "customerEmail": "guest@example.com",
  "customerPhone": "+15550001111",
  "appointmentDateIso": "2026-04-21",
  "appointmentDateLabel": "Tuesday, April 21, 2026",
  "appointmentTime": "1:30 PM",
  "serviceIds": ["service-id"],
  "notes": "First visit"
}
```

## Member Account

### `GET /api/v1/spa/account/bookings`
Returns the authenticated member’s booking history.

### `GET /api/v1/spa/account/profile`
Returns:

```json
{
  "profile": {
    "displayName": "Spa Member",
    "email": "member@example.com",
    "phone": "+15550001111",
    "avatarUrl": "",
    "hasProfile": true
  }
}
```

### `PUT /api/v1/spa/account/profile`
Updates member profile basics used by the frontend account view.

## Admin

All admin routes require a signed-in member with `role=admin`.

### Customers
- `GET /api/v1/spa/admin/customers`

### Services
- `GET /api/v1/spa/admin/services`
- `POST /api/v1/spa/admin/services`

### Site settings
- `GET /api/v1/spa/admin/site-settings`
- `PUT /api/v1/spa/admin/site-settings`

### Gallery
- `GET /api/v1/spa/admin/gallery`
- `POST /api/v1/spa/admin/gallery`

### Media storage config
- `GET /api/v1/spa/admin/media-storage`
- `PUT /api/v1/spa/admin/media-storage`

Supported providers:
- `s3`
- `google_drive`
- `imagekit`
- `cloudinary`

Response values are redacted so `secretConfig` is never returned to the frontend.

### AI concierge config
- `GET /api/v1/spa/admin/ai-concierge`
- `PUT /api/v1/spa/admin/ai-concierge`

## Frontend Mapping Notes

- `cmsService.fetchServices` → `GET /api/v1/spa/catalog/services`
- `bookingService.createBooking` → `POST /api/v1/spa/bookings` with `agencyId`
- `bookingService.listBookingsForUser` → `GET /api/v1/spa/account/bookings`
- `profileService.getProfileForUser` → `GET /api/v1/spa/account/profile`
- `profileService.saveProfileForUser` → `PUT /api/v1/spa/account/profile`
- admin catalog/settings/gallery/customer views → `/api/v1/spa/admin/*`

Frontend integration rule: keep the active Spa Tique agency id in frontend config/state and send it on guest/public/auth routes until the member session exists.

## Security Notes

- Do not expose ImageKit private keys, Cloudinary secrets, S3 credentials, or Google Drive service credentials to the frontend.
- Only public delivery config belongs in frontend-visible payloads.
- Media URLs should be resolved server-side from the active provider config.
