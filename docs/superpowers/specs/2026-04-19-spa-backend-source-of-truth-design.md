# Spa Backend Source-of-Truth Design

## Overview
Spa Tique Nails currently depends on Supabase for member auth, bookings, CMS content, gallery data, AI concierge configuration, and admin customer views. This design moves those responsibilities into Noxivo so `apps/workflow-engine` becomes the single backend source of truth for the salon frontend, while preserving payload shapes close enough to the existing frontend services to support a later frontend migration without rethinking the product model.

The backend should not force salon operations into messaging-first abstractions. Instead, it should introduce a dedicated spa domain inside `apps/workflow-engine` that owns spa-specific auth, catalog, bookings, customer records, and site configuration, while integrating with existing Noxivo messaging and AI capabilities where that integration is natural.

## Goals
- Replace Supabase as the system of record for Spa Tique auth, catalog, bookings, customers, CMS data, gallery data, and AI concierge settings.
- Expose stable backend APIs from Noxivo for the existing Spa Tique frontend to consume later.
- Keep API contracts close to the current frontend’s `cmsService.js`, `bookingService.js`, and `profileService.js` expectations.
- Create a clean internal domain model that can later power WhatsApp concierge, CRM enrichment, and admin tooling without reworking the data model.
- Let the salon configure which media delivery/storage provider it uses for catalog and gallery images: S3, Google Drive, ImageKit, or Cloudinary.

## Non-Goals
- Do not modify the Spa Tique frontend repository in this phase.
- Do not build Supabase compatibility at the storage layer.
- Do not couple core spa booking and CMS entities to MessagingProvider session state.
- Do not implement a full conversational AI runtime in this phase; only the configuration and backend surfaces required to support it.

## Architecture

### Domain Boundary
Add a new `spa` domain under `apps/workflow-engine/src/modules/spa/` and a matching route layer under `apps/workflow-engine/src/routes/v1/spa/`.

This domain owns:
- member/admin authentication
- service and product catalog data
- bookings and booking status lifecycle
- customer records derived from accounts and bookings
- site settings and gallery content
- media storage configuration and media URL resolution
- AI concierge configuration

Existing Noxivo modules remain reusable for:
- shared database connection and model exports
- API key and route infrastructure patterns
- future messaging and AI persona execution
- audit/event publication patterns where helpful

### Separation Principle
The spa domain should be internally clean even if its public payloads mirror existing frontend expectations. Public responses may use transitional field names like `image_url`, `appointment_date`, or `full_name`, but the internal services should normalize these concepts and avoid leaking frontend-specific naming deep into the backend.

### Media Provider Principle
Image assets should not be hardwired to a single vendor. The backend should store canonical media asset references plus a per-salon media provider configuration, then resolve frontend-facing image URLs from that configuration.

Supported providers for this milestone:
- `s3`
- `google_drive`
- `imagekit`
- `cloudinary`

Provider secrets must remain server-side only. Public clients may receive resolved delivery URLs and, where appropriate, public configuration like an ImageKit URL endpoint or Cloudinary cloud name, but never private keys, service account credentials, or signing secrets.

## Data Model

### 1. `SpaMember`
Represents a salon account.

Fields:
- `email` (unique)
- `passwordHash`
- `fullName`
- `phone`
- `role` (`member` | `admin`)
- `status` (`active` | `suspended`)
- `avatarUrl`
- `lastLoginAt`

Purpose:
- replaces Supabase Auth user + `profiles.role`
- acts as the identity source for protected member and admin routes

### 2. `SpaSession`
Represents authenticated browser/API sessions.

Fields:
- `memberId`
- `tokenHash`
- `expiresAt`
- `userAgent`
- `ipAddress`
- `revokedAt`

Purpose:
- supports secure HTTP-only cookie sessions
- can also support bearer-token style access for server-to-server/admin consumers later

### 3. `SpaServiceCategory`
Represents service/product categories shown in the frontend.

Fields:
- `name`
- `slug`
- `description`
- `sortOrder`
- `isActive`

### 4. `SpaService`
Represents a service or product exposed in the catalog canvas and public services page.

Fields:
- `categoryId`
- `name`
- `slug`
- `description`
- `shortDescription`
- `price`
- `currency`
- `durationLabel`
- `durationMinutes`
- `inventory`
- `imageUrl`
- `gallery`
- `isActive`
- `sortOrder`
- `canvasPosition` (`x`, `y`)
- `kind` (`service` | `product`)

Purpose:
- covers the existing static `servicesData.js`
- supports both public catalog reads and admin CRUD
- keeps room for future product inventory without redesigning the entity

### 5. `SpaBooking`
Represents a guest or member booking.

Fields:
- `memberId` (nullable for guest bookings)
- `customerName`
- `customerEmail`
- `customerPhone`
- `appointmentDateIso`
- `appointmentDateLabel`
- `appointmentTime`
- `selectedServices` (embedded snapshot of service ids/names/prices/durations)
- `totalPrice`
- `status` (`pending` | `confirmed` | `completed` | `cancelled`)
- `notes`
- `source` (`guest` | `member` | `admin` | `whatsapp`)

Purpose:
- replaces the Supabase `bookings` table
- preserves booking history even when service definitions later change

### 6. `SpaCustomerProfile`
Represents an admin/customer ledger view derived from accounts and bookings.

Fields:
- `memberId` (nullable)
- `email`
- `phone`
- `fullName`
- `bookingCount`
- `lastBookingAt`
- `lastBookingStatus`
- `tags`
- `notes`

Purpose:
- replaces the current admin customer aggregation logic built from `bookings` + `profiles`
- allows future CRM enrichment without recalculating everything only at request time

### 7. `SpaSiteSettings`
Represents site-wide CMS settings.

Fields:
- `salonName`
- `tagline`
- `phone`
- `whatsapp`
- `email`
- `address`
- `hours`
- `googleMapsUrl`
- `googleMapsEmbed`
- `socialLinks`
- `metaDescription`

Purpose:
- replaces Supabase `site_settings`

### 8. `SpaGalleryImage`
Represents gallery assets.

Fields:
- `url`
- `alt`
- `category`
- `sortOrder`
- `isActive`

Purpose:
- replaces Supabase `gallery_images`

### 9. `SpaMediaStorageConfig`
Represents the active image/storage provider and its backend-managed configuration.

Fields:
- `provider` (`s3` | `google_drive` | `imagekit` | `cloudinary`)
- `isActive`
- `publicBaseUrl`
- `publicConfig` (safe frontend-readable values only)
- `secretConfig` (server-only encrypted or otherwise protected values)
- `pathPrefix`
- `transformDefaults`

Provider-specific configuration expectations:

#### S3
- public config: `bucket`, `region`, optional CDN/base URL
- secret config: access key / secret / signing settings if uploads are later signed

#### Google Drive
- public config: optional shared folder id or public asset base pattern
- secret config: service account or OAuth refresh material if backend-managed fetch/upload is required

#### ImageKit
- public config: `urlEndpoint`, optional `publicKey`
- secret config: `privateKey`

#### Cloudinary
- public config: `cloudName`
- secret config: `apiKey`, `apiSecret`

Purpose:
- centralizes media delivery behavior for services and gallery assets
- lets the admin switch image providers without rewriting service/gallery records
- provides one place to define how stored image references become public URLs

### 10. `SpaAiConciergeConfig`
Represents salon AI concierge configuration.

Fields:
- `personaName`
- `openingMessage`
- `systemPrompt`
- `model`
- `temperature`
- `webhookUrl`
- `suggestedPrompts`
- `active`

Purpose:
- replaces Supabase `ai_config`
- serves as the salon-owned configuration source for later Noxivo AI persona/runtime integration

## API Design

### Authentication
- `POST /api/v1/spa/auth/sign-up`
- `POST /api/v1/spa/auth/sign-in`
- `POST /api/v1/spa/auth/sign-out`
- `GET /api/v1/spa/auth/me`

Behavior:
- use secure password hashing
- set HTTP-only session cookie on sign-in/sign-up
- return normalized member payload (`id`, `email`, `fullName`, `role`, `status`)
- admin/member authorization derives from backend session, not client-side role assumptions

### Public Catalog and CMS
- `GET /api/v1/spa/catalog/services`
- `GET /api/v1/spa/catalog/services/:id`
- `GET /api/v1/spa/catalog/categories`
- `GET /api/v1/spa/site-settings`
- `GET /api/v1/spa/gallery`
- `GET /api/v1/spa/ai-concierge`

Behavior:
- public reads return only active records
- service payloads should include compatibility fields the frontend already expects: `id`, `name`, `category`, `duration`, `price`, `description`, `image_url`
- service and gallery `image_url` fields should be resolved from the active media provider config so frontend rendering stays simple
- settings and AI config should return safe public subsets where needed

### Booking
- `POST /api/v1/spa/bookings`
- `GET /api/v1/spa/account/bookings`
- `GET /api/v1/spa/admin/bookings`
- `PATCH /api/v1/spa/admin/bookings/:id`

Behavior:
- public booking creation supports guest and authenticated member flows
- account bookings are scoped to the authenticated member
- admin booking list returns the same normalized shape currently used by `bookingService.js`
- admin patch supports status updates and operational notes

### Customers
- `GET /api/v1/spa/admin/customers`
- `GET /api/v1/spa/admin/customers/:id`
- `PATCH /api/v1/spa/admin/customers/:id`

Behavior:
- customer list should expose `name`, `email`, `phone`, `bookingCount`, `lastBookingLabel`, `lastStatus`, `avatarUrl`
- detail/update routes enable future CRM expansion without redesigning the route surface

### Admin CMS / Catalog
- `GET /api/v1/spa/admin/services`
- `POST /api/v1/spa/admin/services`
- `PUT /api/v1/spa/admin/services/:id`
- `DELETE /api/v1/spa/admin/services/:id`
- `GET /api/v1/spa/admin/categories`
- `POST /api/v1/spa/admin/categories`
- `PUT /api/v1/spa/admin/categories/:id`
- `DELETE /api/v1/spa/admin/categories/:id`
- `GET /api/v1/spa/admin/site-settings`
- `PUT /api/v1/spa/admin/site-settings`
- `GET /api/v1/spa/admin/gallery`
- `POST /api/v1/spa/admin/gallery`
- `PUT /api/v1/spa/admin/gallery/:id`
- `DELETE /api/v1/spa/admin/gallery/:id`
- `GET /api/v1/spa/admin/media-storage`
- `PUT /api/v1/spa/admin/media-storage`
- `GET /api/v1/spa/admin/ai-concierge`
- `PUT /api/v1/spa/admin/ai-concierge`

Behavior:
- admin service routes support canvas metadata (`x`, `y`) as part of saved service state
- responses should stay close to the current admin canvas and CMS service usage
- media storage settings route should allow selecting one active provider plus provider-specific config values
- admin reads may include safe public config echoes, but must redact secrets from responses

## Auth and Authorization Model

### Session Strategy
Use secure session cookies for browser traffic:
- HTTP-only
- secure in production
- same-site policy set for the deployed frontend/backend setup
- token stored server-side as a hash in `SpaSession`

### Route Protection
- public routes: catalog, gallery, site settings, booking create
- member routes: account bookings, account profile, sign-out, me
- admin routes: all admin catalog/CMS/bookings/customers/AI configuration endpoints

### Why not reuse current admin auth directly?
The existing Noxivo admin auth is platform-oriented and tied to Noxivo’s operational dashboard concerns. Spa Tique needs a dedicated salon auth surface with member/admin roles and member-facing account routes, so the backend should reuse patterns, not the exact route contract.

## Frontend Mapping

### Current frontend dependencies
The Spa Tique frontend currently uses:
- `cmsService.js` for services, team, gallery, site settings, translations, AI config, admin service CRUD
- `bookingService.js` for booking create, member booking history, admin booking list
- `profileService.js` for member profile + admin customer aggregation
- Supabase auth in `AuthProvider.jsx`

### Intended backend mapping
- `fetchServices` → `GET /api/v1/spa/catalog/services`
- `fetchAllServices` → `GET /api/v1/spa/admin/services`
- `upsertService` → `POST/PUT /api/v1/spa/admin/services`
- `deleteService` → `DELETE /api/v1/spa/admin/services/:id`
- `fetchGallery` / `fetchAllGallery` → `GET /api/v1/spa/gallery` / `GET /api/v1/spa/admin/gallery`
- `fetchSiteSettings` / `saveSiteSettings` → `GET/PUT /api/v1/spa/admin/site-settings`
- `fetchAiConfig` / `saveAiConfig` → `GET/PUT /api/v1/spa/admin/ai-concierge`
- `createBooking` → `POST /api/v1/spa/bookings`
- `listBookingsForUser` → `GET /api/v1/spa/account/bookings`
- `listBookingsForAdmin` → `GET /api/v1/spa/admin/bookings`
- `getProfileForUser` / `saveProfileForUser` → dedicated member profile routes inside spa auth/account surface
- `listCustomersForAdmin` → `GET /api/v1/spa/admin/customers`
- Supabase sign-in/sign-up/getSession → spa auth endpoints

### Media mapping rule
- service and gallery records should store stable asset references, not vendor-coupled frontend code snippets
- backend serializers should emit `image_url` based on the active provider config
- if the salon uses ImageKit, resolved URLs should support the configured endpoint such as `https://ik.imagekit.io/luxenail/`
- frontend code should never need private provider credentials to render images

### Compatibility rule
The first backend version should prefer payload compatibility over ideal naming purity where the frontend already relies on certain fields. Internal normalization is encouraged; externally breaking the frontend’s assumptions is not.

## Error Handling
- Zod-validate all request bodies, params, and query shapes
- use explicit 401 for unauthenticated access and 403 for authenticated-but-forbidden access
- return consistent `{ error: string }` or `{ error: string, details?: ... }` envelopes for failures
- treat missing entities as 404, not soft-null success responses, except where the existing frontend already expects nullable config bootstrap behavior

## Testing Strategy

### Route-level tests
Add focused Vitest coverage for:
- sign-up/sign-in/sign-out/me flow
- member vs admin authorization boundaries
- public catalog reads
- admin service CRUD
- booking creation and member/admin list reads
- customer list aggregation
- site settings/gallery/AI config reads and updates

### Model/service tests
Add tests for:
- session creation/invalidation
- booking total calculation and service snapshotting
- customer profile aggregation rules
- compatibility serializers that map internal entities to frontend-shaped payloads
- media provider resolution for S3, Google Drive, ImageKit, and Cloudinary
- provider config redaction so secrets never leak in admin/public responses

### Verification requirements
- `pnpm --filter @noxivo/workflow-engine test -- <new spa tests>`
- `pnpm --filter @noxivo/workflow-engine lint`
- `pnpm --filter @noxivo/workflow-engine build`

## Documentation Deliverables
- public/admin route reference with request and response examples
- auth flow notes for member and admin consumers
- frontend migration mapping from Supabase services to new Noxivo endpoints
- any required env vars and cookie/domain assumptions
- media provider configuration reference, including which values are public vs server-only

## Risks and Decisions
- The current Spa Tique frontend is tightly coupled to Supabase client behavior, so backend design must preserve contract compatibility where practical.
- The current Noxivo repo already contains catalog and AI-related pieces, but they are not a direct fit for salon CMS and auth, so partial reuse is better than forced reuse.
- Booking data should snapshot service details at booking time to avoid historical drift.
- Team and translation support exist in the frontend today; they are secondary to the user’s stated scope, so they should not block the first backend-source-of-truth milestone unless required by a chosen API surface.
- Media records should remain provider-agnostic enough that switching from ImageKit to S3 or Cloudinary does not require rewriting every service record.
- ImageKit private keys, Cloudinary secrets, S3 credentials, and Google Drive service credentials must never be exposed in frontend-visible payloads or docs meant for client-side integration.

## Success Criteria
- Noxivo owns the salon’s auth, catalog, bookings, CMS/config, gallery, customer ledger, and AI concierge config.
- The backend route surface is clear enough for the frontend to migrate off Supabase without redesigning its user flows.
- The spa domain is internally clean and not distorted by unrelated messaging abstractions.
- Media delivery is configurable through backend settings with support for S3, Google Drive, ImageKit, and Cloudinary.
- API docs and verification cover the new route surface well enough for handoff and deployment work.
