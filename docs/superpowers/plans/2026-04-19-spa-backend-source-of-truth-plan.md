# Spa Backend Source-of-Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new Spa backend domain in Noxivo that replaces Supabase as the source of truth for Spa Tique Nails auth, catalog, bookings, customers, CMS settings, gallery data, media-provider configuration, and AI concierge configuration.

**Architecture:** Add a dedicated `spa` route and service layer inside `apps/workflow-engine`, backed by new spa-specific Mongoose models and strict Zod contracts in `packages/contracts`. Keep public payloads compatible with the current Spa Tique frontend service layer while making media delivery configurable through backend-managed provider settings for S3, Google Drive, ImageKit, or Cloudinary.

**Tech Stack:** Fastify, Mongoose, Zod, Vitest, pnpm workspace packages (`@noxivo/contracts`, `@noxivo/database`), Node `crypto`.

---

## File Structure

### Create
- `packages/contracts/src/spa.ts` — Zod request/response schemas for spa auth, catalog, bookings, customers, CMS, media settings, and AI config.
- `packages/database/src/models/spa-member.ts` — salon account model.
- `packages/database/src/models/spa-session.ts` — cookie/session persistence for spa auth.
- `packages/database/src/models/spa-service-category.ts` — category model for services/products.
- `packages/database/src/models/spa-service.ts` — service/product catalog model with canvas positioning and image references.
- `packages/database/src/models/spa-booking.ts` — booking model with embedded service snapshots.
- `packages/database/src/models/spa-customer-profile.ts` — CRM-style projection for admin customer ledger.
- `packages/database/src/models/spa-site-settings.ts` — site-wide CMS settings.
- `packages/database/src/models/spa-gallery-image.ts` — gallery asset model.
- `packages/database/src/models/spa-media-storage-config.ts` — active media provider config with redacted secret handling.
- `packages/database/src/models/spa-ai-concierge-config.ts` — salon AI config model.
- `apps/workflow-engine/src/modules/spa/auth.service.ts` — sign-up/sign-in/sign-out/session helpers.
- `apps/workflow-engine/src/modules/spa/media-url.service.ts` — resolves `image_url` from active provider config.
- `apps/workflow-engine/src/modules/spa/serializers.ts` — compatibility serializers for frontend-shaped payloads.
- `apps/workflow-engine/src/modules/spa/customer-profile.service.ts` — customer aggregation/projection logic.
- `apps/workflow-engine/src/modules/spa/http-auth.ts` — cookie parsing and auth guards for member/admin routes.
- `apps/workflow-engine/src/routes/v1/spa.routes.ts` — all `/api/v1/spa/**` routes.
- `apps/workflow-engine/test/spa-auth-routes.test.ts` — auth/session route coverage.
- `apps/workflow-engine/test/spa-catalog-routes.test.ts` — catalog/CMS/media-provider route coverage.
- `apps/workflow-engine/test/spa-bookings-routes.test.ts` — booking/account route coverage.
- `apps/workflow-engine/test/spa-admin-routes.test.ts` — admin service/customer/settings/AI route coverage.
- `apps/workflow-engine/test/spa-media-url.service.test.ts` — media-provider resolution tests.
- `docs/reference/spa-api.md` — request/response docs and frontend mapping notes.

### Modify
- `packages/contracts/src/index.ts` — export new spa contracts.
- `packages/database/src/models/index.ts` — export new spa models.
- `apps/workflow-engine/src/server.ts` — register spa routes.
- `TODO.md` — record completed backend work and next step.
- `SESSION_HANDOFF.md` — capture files changed, verification, env vars, and deployment notes.

### Leave Alone
- Existing messaging proxy routes and MessagingProvider integration paths.
- `apps/dashboard/**` and the separate Spa Tique frontend repo.
- Existing generic platform auth/session flow for owner admin dashboard.

---

## Implementation Notes To Keep Constant

- Use a **separate spa auth/session model**, not the existing platform `UserModel` + `AuthSessionModel` combo.
- Keep the cookie name for spa auth distinct from the platform admin cookie. Use `spa_member_session`.
- Avoid new third-party auth libraries; use Node `crypto.scryptSync` plus random salts to hash passwords unless a repo-native password helper already exists.
- Store image references in records as stable asset references, then emit frontend-safe `image_url` values through `media-url.service.ts`.
- `secretConfig` values in media-provider settings must never be returned from route handlers.
- Admin service/category/gallery/settings/AI config routes should be cookie-authenticated, not API-key-only.
- Public routes should return only active records.

---

### Task 1: Add spa contracts and Mongoose models

**Files:**
- Create: `packages/contracts/src/spa.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/database/src/models/spa-member.ts`
- Create: `packages/database/src/models/spa-session.ts`
- Create: `packages/database/src/models/spa-service-category.ts`
- Create: `packages/database/src/models/spa-service.ts`
- Create: `packages/database/src/models/spa-booking.ts`
- Create: `packages/database/src/models/spa-customer-profile.ts`
- Create: `packages/database/src/models/spa-site-settings.ts`
- Create: `packages/database/src/models/spa-gallery-image.ts`
- Create: `packages/database/src/models/spa-media-storage-config.ts`
- Create: `packages/database/src/models/spa-ai-concierge-config.ts`
- Modify: `packages/database/src/models/index.ts`
- Test: `apps/workflow-engine/test/spa-media-url.service.test.ts`

- [ ] **Step 1: Write the failing media-provider resolution test**

Create `apps/workflow-engine/test/spa-media-url.service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveSpaMediaUrl } from '../src/modules/spa/media-url.service.js';

describe('resolveSpaMediaUrl', () => {
  it('resolves ImageKit asset references with the configured endpoint', () => {
    const url = resolveSpaMediaUrl({
      assetPath: '/services/signature-manicure.png',
      config: {
        provider: 'imagekit',
        publicBaseUrl: 'https://ik.imagekit.io/luxenail',
      },
    });

    expect(url).toBe('https://ik.imagekit.io/luxenail/services/signature-manicure.png');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails because the module does not exist**

Run:

```bash
pnpm --filter @noxivo/workflow-engine test -- test/spa-media-url.service.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Create `packages/contracts/src/spa.ts` with initial shared schemas**

Start the file with these core exports:

```ts
import { z } from 'zod';

export const SpaRoleSchema = z.enum(['member', 'admin']);
export const SpaStatusSchema = z.enum(['active', 'suspended']);
export const SpaMediaProviderSchema = z.enum(['s3', 'google_drive', 'imagekit', 'cloudinary']);

export const SpaSignupInputSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
  fullName: z.string().min(2).max(120).transform((value) => value.trim()),
  phone: z.string().trim().max(40).optional(),
}).strict();

export const SpaLoginInputSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
}).strict();

export const SpaMediaStorageConfigSchema = z.object({
  provider: SpaMediaProviderSchema,
  isActive: z.boolean().default(true),
  publicBaseUrl: z.string().url().nullable().default(null),
  publicConfig: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  secretConfig: z.record(z.string()).default({}),
  pathPrefix: z.string().trim().default(''),
}).strict();
```

- [ ] **Step 4: Export the new spa contracts**

Update `packages/contracts/src/index.ts`:

```ts
export * from './spa.js';
```

- [ ] **Step 5: Create the new spa model files**

Use the existing Mongoose model style from `user.ts` and `auth-session.ts`. For example, `packages/database/src/models/spa-member.ts` should start like this:

```ts
import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const SpaMemberSchema = new Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 160 },
  passwordHash: { type: String, required: true },
  fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  phone: { type: String, default: null },
  role: { type: String, required: true, enum: ['member', 'admin'], default: 'member' },
  status: { type: String, required: true, enum: ['active', 'suspended'], default: 'active' },
  avatarUrl: { type: String, default: null },
  lastLoginAt: { type: Date, default: null },
}, { collection: 'spa_members', timestamps: true });

export type SpaMember = InferSchemaType<typeof SpaMemberSchema>;
export const SpaMemberModel =
  (models.SpaMember as Model<SpaMember> | undefined) || model<SpaMember>('SpaMember', SpaMemberSchema);
```

`packages/database/src/models/spa-media-storage-config.ts` should include:

```ts
  provider: { type: String, required: true, enum: ['s3', 'google_drive', 'imagekit', 'cloudinary'] },
  isActive: { type: Boolean, required: true, default: true },
  publicBaseUrl: { type: String, default: null },
  publicConfig: { type: Schema.Types.Mixed, default: {} },
  secretConfig: { type: Schema.Types.Mixed, default: {} },
  pathPrefix: { type: String, default: '' },
```

- [ ] **Step 6: Export the new spa models**

Append these lines to `packages/database/src/models/index.ts`:

```ts
export * from './spa-member.js';
export * from './spa-session.js';
export * from './spa-service-category.js';
export * from './spa-service.js';
export * from './spa-booking.js';
export * from './spa-customer-profile.js';
export * from './spa-site-settings.js';
export * from './spa-gallery-image.js';
export * from './spa-media-storage-config.js';
export * from './spa-ai-concierge-config.js';
```

- [ ] **Step 7: Create the initial media URL resolver**

Create `apps/workflow-engine/src/modules/spa/media-url.service.ts`:

```ts
type MediaConfig = {
  provider: 's3' | 'google_drive' | 'imagekit' | 'cloudinary';
  publicBaseUrl?: string | null;
  pathPrefix?: string | null;
};

type ResolveSpaMediaUrlInput = {
  assetPath: string | null | undefined;
  config: MediaConfig | null;
};

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

export function resolveSpaMediaUrl(input: ResolveSpaMediaUrlInput): string | null {
  if (!input.assetPath) return null;
  if (/^https?:\/\//i.test(input.assetPath)) return input.assetPath;
  if (!input.config?.publicBaseUrl) return input.assetPath;

  const base = input.config.publicBaseUrl.replace(/\/+$/, '');
  const prefix = input.config.pathPrefix ? `/${trimSlashes(input.config.pathPrefix)}` : '';
  const assetPath = input.assetPath.startsWith('/') ? input.assetPath : `/${input.assetPath}`;
  return `${base}${prefix}${assetPath}`;
}
```

- [ ] **Step 8: Re-run the media resolver test and verify it passes**

Run:

```bash
pnpm --filter @noxivo/workflow-engine test -- test/spa-media-url.service.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit the contracts/models groundwork**

```bash
git add packages/contracts/src/spa.ts packages/contracts/src/index.ts packages/database/src/models/index.ts packages/database/src/models/spa-*.ts apps/workflow-engine/src/modules/spa/media-url.service.ts apps/workflow-engine/test/spa-media-url.service.test.ts
git commit -m "feat: add spa domain models"
```

### Task 2: Implement spa auth and account session flow

**Files:**
- Create: `apps/workflow-engine/src/modules/spa/auth.service.ts`
- Create: `apps/workflow-engine/src/modules/spa/http-auth.ts`
- Create: `apps/workflow-engine/test/spa-auth-routes.test.ts`
- Create: `apps/workflow-engine/src/routes/v1/spa.routes.ts`
- Modify: `apps/workflow-engine/src/server.ts`

- [ ] **Step 1: Write the failing auth route test**

Create `apps/workflow-engine/test/spa-auth-routes.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { connectWorkflowEngineTestDb, disconnectWorkflowEngineTestDb, resetWorkflowEngineTestDb } from './helpers/mongo-memory.js';

describe('spa auth routes', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-spa-auth-tests' });
  });

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('signs up a member and returns the current member session', async () => {
    const server = await buildServer({ logger: false });
    try {
      const signup = await server.inject({
        method: 'POST',
        url: '/api/v1/spa/auth/sign-up',
        payload: {
          email: 'member@example.com',
          password: 'supersecret123',
          fullName: 'Spa Member',
        },
      });

      expect(signup.statusCode).toBe(201);
      const cookie = signup.headers['set-cookie'];
      expect(cookie).toContain('spa_member_session=');

      const me = await server.inject({
        method: 'GET',
        url: '/api/v1/spa/auth/me',
        headers: { cookie: cookie as string },
      });

      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({
        user: {
          email: 'member@example.com',
          fullName: 'Spa Member',
          role: 'member',
        },
      });
    } finally {
      await server.close();
    }
  });
});
```

- [ ] **Step 2: Run the test and verify it fails with route not found**

Run:

```bash
pnpm --filter @noxivo/workflow-engine test -- test/spa-auth-routes.test.ts
```

Expected: FAIL with `404 !== 201`.

- [ ] **Step 3: Create `auth.service.ts` with hashing and session helpers**

Use Node `crypto` only:

```ts
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { SpaMemberModel, SpaSessionModel } from '@noxivo/database';

function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expectedHash] = storedHash.split(':');
  if (!salt || !expectedHash) return false;
  const actualHash = scryptSync(password, salt, 64).toString('hex');
  return timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
```

- [ ] **Step 4: Create `http-auth.ts` for spa cookie parsing and role checks**

Start with:

```ts
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { SpaMemberModel, SpaSessionModel } from '@noxivo/database';

export const SPA_SESSION_COOKIE_NAME = 'spa_member_session';

export async function requireSpaMember(request: FastifyRequest, reply: FastifyReply) {
  // parse cookie, load session, load member, 401 on failure
}

export async function requireSpaAdmin(request: FastifyRequest, reply: FastifyReply) {
  const member = await requireSpaMember(request, reply);
  if (!member || member.role !== 'admin') {
    await reply.status(403).send({ error: 'Forbidden' });
    return null;
  }
  return member;
}
```

- [ ] **Step 5: Create `spa.routes.ts` with auth endpoints only**

Implement these first handlers:

```ts
fastify.post('/api/v1/spa/auth/sign-up', async (request, reply) => {
  // validate with SpaSignupInputSchema
  // create SpaMember + SpaSession
  // set cookie
  return reply.status(201).send({ user: serializeSpaMember(member) });
});

fastify.post('/api/v1/spa/auth/sign-in', async (request, reply) => {
  // validate credentials
  // create new session
  // set cookie
  return reply.status(200).send({ user: serializeSpaMember(member) });
});

fastify.post('/api/v1/spa/auth/sign-out', async (request, reply) => {
  // revoke/delete current session and clear cookie
  return reply.status(200).send({ success: true });
});

fastify.get('/api/v1/spa/auth/me', async (request, reply) => {
  // require member session
  return reply.status(200).send({ user: serializeSpaMember(member) });
});
```

- [ ] **Step 6: Register the new route file in `server.ts`**

Add:

```ts
import { registerSpaRoutes } from './routes/v1/spa.routes.js';
```

and later:

```ts
await registerSpaRoutes(fastify);
```

- [ ] **Step 7: Re-run the auth test and verify it passes**

Run:

```bash
pnpm --filter @noxivo/workflow-engine test -- test/spa-auth-routes.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the auth milestone**

```bash
git add apps/workflow-engine/src/modules/spa/auth.service.ts apps/workflow-engine/src/modules/spa/http-auth.ts apps/workflow-engine/src/routes/v1/spa.routes.ts apps/workflow-engine/src/server.ts apps/workflow-engine/test/spa-auth-routes.test.ts
git commit -m "feat: add spa auth routes"
```

### Task 3: Implement public catalog, site settings, gallery, and media settings

**Files:**
- Modify: `apps/workflow-engine/src/routes/v1/spa.routes.ts`
- Create: `apps/workflow-engine/src/modules/spa/serializers.ts`
- Modify: `apps/workflow-engine/test/spa-catalog-routes.test.ts`

- [ ] **Step 1: Write the failing public catalog test**

Create `apps/workflow-engine/test/spa-catalog-routes.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SpaMediaStorageConfigModel, SpaServiceCategoryModel, SpaServiceModel } from '@noxivo/database';
import { buildServer } from '../src/server.js';
import { connectWorkflowEngineTestDb, disconnectWorkflowEngineTestDb, resetWorkflowEngineTestDb } from './helpers/mongo-memory.js';

describe('spa catalog routes', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-spa-catalog-tests' });
  });

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('returns active services with ImageKit-resolved image_url values', async () => {
    const category = await SpaServiceCategoryModel.create({ name: 'Manicures', slug: 'manicures', isActive: true, sortOrder: 0 });
    await SpaMediaStorageConfigModel.create({ provider: 'imagekit', isActive: true, publicBaseUrl: 'https://ik.imagekit.io/luxenail' });
    await SpaServiceModel.create({
      categoryId: category._id,
      name: 'Signature Manicure',
      slug: 'signature-manicure',
      description: 'Classic service',
      price: 65,
      durationLabel: '45 MINS',
      imageRef: '/services/signature.png',
      isActive: true,
      sortOrder: 0,
      kind: 'service',
    });

    const server = await buildServer({ logger: false });
    try {
      const response = await server.inject({ method: 'GET', url: '/api/v1/spa/catalog/services' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        expect.objectContaining({
          name: 'Signature Manicure',
          image_url: 'https://ik.imagekit.io/luxenail/services/signature.png',
        }),
      ]);
    } finally {
      await server.close();
    }
  });
});
```

- [ ] **Step 2: Run the test and verify it fails because the route serializer is incomplete**

Run:

```bash
pnpm --filter @noxivo/workflow-engine test -- test/spa-catalog-routes.test.ts
```

Expected: FAIL with empty response or missing `image_url`.

- [ ] **Step 3: Create `serializers.ts` for frontend-compatible payload shapes**

Include:

```ts
import { resolveSpaMediaUrl } from './media-url.service.js';

export function serializeSpaService(service: Record<string, unknown>, categoryName: string | null, mediaConfig: Record<string, unknown> | null) {
  return {
    id: String(service._id),
    name: service.name,
    category: categoryName ?? 'General',
    duration: service.durationLabel ?? '',
    price: Number(service.price ?? 0),
    description: service.description ?? '',
    image_url: resolveSpaMediaUrl({
      assetPath: typeof service.imageRef === 'string' ? service.imageRef : null,
      config: mediaConfig as never,
    }),
  };
}
```

- [ ] **Step 4: Extend `spa.routes.ts` with public catalog/CMS/media handlers**

Add:

```ts
fastify.get('/api/v1/spa/catalog/services', async (_request, reply) => {
  // load active services + categories + active media config
  // serialize with serializeSpaService
  return reply.status(200).send(serializedServices);
});

fastify.get('/api/v1/spa/catalog/categories', async (_request, reply) => {
  return reply.status(200).send(categories);
});

fastify.get('/api/v1/spa/site-settings', async (_request, reply) => {
  return reply.status(200).send(settings ?? DEFAULT_SITE_SETTINGS);
});

fastify.get('/api/v1/spa/gallery', async (_request, reply) => {
  return reply.status(200).send(serializedGallery);
});

fastify.get('/api/v1/spa/admin/media-storage', async (request, reply) => {
  const member = await requireSpaAdmin(request, reply);
  if (!member) return;
  return reply.status(200).send(redactedMediaConfig);
});

fastify.put('/api/v1/spa/admin/media-storage', async (request, reply) => {
  const member = await requireSpaAdmin(request, reply);
  if (!member) return;
  // persist provider + config, redact secretConfig in response
  return reply.status(200).send(redactedMediaConfig);
});
```

- [ ] **Step 5: Re-run the catalog test and verify it passes**

Run:

```bash
pnpm --filter @noxivo/workflow-engine test -- test/spa-catalog-routes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the catalog/CMS milestone**

```bash
git add apps/workflow-engine/src/modules/spa/serializers.ts apps/workflow-engine/src/routes/v1/spa.routes.ts apps/workflow-engine/test/spa-catalog-routes.test.ts
git commit -m "feat: add spa catalog and media routes"
```

### Task 4: Implement booking creation, member profile, and account bookings

**Files:**
- Modify: `apps/workflow-engine/src/routes/v1/spa.routes.ts`
- Create: `apps/workflow-engine/test/spa-bookings-routes.test.ts`

- [ ] **Step 1: Write the failing booking test**

Create `apps/workflow-engine/test/spa-bookings-routes.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SpaBookingModel, SpaMemberModel, SpaServiceModel, SpaServiceCategoryModel } from '@noxivo/database';
import { buildServer } from '../src/server.js';
import { connectWorkflowEngineTestDb, disconnectWorkflowEngineTestDb, resetWorkflowEngineTestDb } from './helpers/mongo-memory.js';

describe('spa booking routes', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-spa-booking-tests' });
  });

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('creates a guest booking with service snapshots', async () => {
    const category = await SpaServiceCategoryModel.create({ name: 'Pedicures', slug: 'pedicures', isActive: true, sortOrder: 0 });
    const service = await SpaServiceModel.create({
      categoryId: category._id,
      name: 'Silk Pedicure',
      slug: 'silk-pedicure',
      description: 'Hydrating service',
      price: 85,
      durationLabel: '60 MINS',
      isActive: true,
      sortOrder: 0,
      kind: 'service',
    });

    const server = await buildServer({ logger: false });
    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/spa/bookings',
        payload: {
          customerName: 'Guest Booker',
          customerEmail: 'guest@example.com',
          customerPhone: '+15550001111',
          appointmentDateIso: '2026-04-21',
          appointmentDateLabel: 'Tuesday, April 21, 2026',
          appointmentTime: '1:30 PM',
          serviceIds: [String(service._id)],
          notes: 'First visit',
        },
      });

      expect(response.statusCode).toBe(201);
      const booking = await SpaBookingModel.findOne({ customerEmail: 'guest@example.com' }).lean();
      expect(booking?.selectedServices).toHaveLength(1);
      expect(booking?.totalPrice).toBe(85);
    } finally {
      await server.close();
    }
  });
});
```

- [ ] **Step 2: Run the test and verify it fails because booking routes do not exist yet**

Run:

```bash
pnpm --filter @noxivo/workflow-engine test -- test/spa-bookings-routes.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Extend `spa.routes.ts` with booking and profile/account endpoints**

Add these handlers:

```ts
fastify.post('/api/v1/spa/bookings', async (request, reply) => {
  // validate payload
  // load referenced services
  // snapshot id/name/price/duration
  // create booking + update customer projection
  return reply.status(201).send({ booking: serializedBooking });
});

fastify.get('/api/v1/spa/account/bookings', async (request, reply) => {
  const member = await requireSpaMember(request, reply);
  if (!member) return;
  return reply.status(200).send({ bookings: serializedBookings });
});

fastify.get('/api/v1/spa/account/profile', async (request, reply) => {
  const member = await requireSpaMember(request, reply);
  if (!member) return;
  return reply.status(200).send({ profile: serializedProfile });
});

fastify.put('/api/v1/spa/account/profile', async (request, reply) => {
  const member = await requireSpaMember(request, reply);
  if (!member) return;
  return reply.status(200).send({ profile: serializedProfile });
});
```

- [ ] **Step 4: Re-run the booking test and verify it passes**

Run:

```bash
pnpm --filter @noxivo/workflow-engine test -- test/spa-bookings-routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the bookings/account milestone**

```bash
git add apps/workflow-engine/src/routes/v1/spa.routes.ts apps/workflow-engine/test/spa-bookings-routes.test.ts
git commit -m "feat: add spa booking routes"
```

### Task 5: Implement admin services, bookings, customers, site settings, gallery, and AI config

**Files:**
- Create: `apps/workflow-engine/src/modules/spa/customer-profile.service.ts`
- Modify: `apps/workflow-engine/src/routes/v1/spa.routes.ts`
- Create: `apps/workflow-engine/test/spa-admin-routes.test.ts`

- [ ] **Step 1: Write the failing admin route test**

Create `apps/workflow-engine/test/spa-admin-routes.test.ts` with an admin service CRUD case and a customer list case:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { connectWorkflowEngineTestDb, disconnectWorkflowEngineTestDb, resetWorkflowEngineTestDb } from './helpers/mongo-memory.js';

describe('spa admin routes', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-spa-admin-tests' });
  });

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('rejects admin service creation without an admin session', async () => {
    const server = await buildServer({ logger: false });
    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/spa/admin/services',
        payload: {
          name: 'New Service',
          categoryName: 'Manicures',
          price: 99,
          duration: '45 MINS',
        },
      });

      expect(response.statusCode).toBe(401);
    } finally {
      await server.close();
    }
  });
});
```

- [ ] **Step 2: Run the test and verify the route is still missing or unauthorized**

Run:

```bash
pnpm --filter @noxivo/workflow-engine test -- test/spa-admin-routes.test.ts
```

Expected: FAIL or partial failure because handlers are not implemented yet.

- [ ] **Step 3: Add customer projection service and admin handlers**

Create `customer-profile.service.ts` with a helper like:

```ts
export async function upsertSpaCustomerProjectionFromBooking(input: {
  memberId?: string | null;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  bookingStatus: string;
  bookingDateLabel: string;
}) {
  // increment bookingCount and update last-booking fields
}
```

Then extend `spa.routes.ts` with:

```ts
fastify.get('/api/v1/spa/admin/bookings', async (request, reply) => { /* admin only */ });
fastify.patch('/api/v1/spa/admin/bookings/:id', async (request, reply) => { /* admin only */ });
fastify.get('/api/v1/spa/admin/customers', async (request, reply) => { /* admin only */ });
fastify.get('/api/v1/spa/admin/services', async (request, reply) => { /* admin only */ });
fastify.post('/api/v1/spa/admin/services', async (request, reply) => { /* admin only */ });
fastify.put('/api/v1/spa/admin/services/:id', async (request, reply) => { /* admin only */ });
fastify.delete('/api/v1/spa/admin/services/:id', async (request, reply) => { /* admin only */ });
fastify.get('/api/v1/spa/admin/site-settings', async (request, reply) => { /* admin only */ });
fastify.put('/api/v1/spa/admin/site-settings', async (request, reply) => { /* admin only */ });
fastify.get('/api/v1/spa/admin/gallery', async (request, reply) => { /* admin only */ });
fastify.post('/api/v1/spa/admin/gallery', async (request, reply) => { /* admin only */ });
fastify.put('/api/v1/spa/admin/gallery/:id', async (request, reply) => { /* admin only */ });
fastify.delete('/api/v1/spa/admin/gallery/:id', async (request, reply) => { /* admin only */ });
fastify.get('/api/v1/spa/admin/ai-concierge', async (request, reply) => { /* admin only */ });
fastify.put('/api/v1/spa/admin/ai-concierge', async (request, reply) => { /* admin only */ });
```

- [ ] **Step 4: Re-run the admin route test and verify it passes**

Run:

```bash
pnpm --filter @noxivo/workflow-engine test -- test/spa-admin-routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the admin milestone**

```bash
git add apps/workflow-engine/src/modules/spa/customer-profile.service.ts apps/workflow-engine/src/routes/v1/spa.routes.ts apps/workflow-engine/test/spa-admin-routes.test.ts
git commit -m "feat: add spa admin routes"
```

### Task 6: Write API docs, run verification, and update handoff files

**Files:**
- Create: `docs/reference/spa-api.md`
- Modify: `TODO.md`
- Modify: `SESSION_HANDOFF.md`

- [ ] **Step 1: Write the API reference doc**

Create `docs/reference/spa-api.md` with sections for:

```md
# Spa API

## Auth
- POST /api/v1/spa/auth/sign-up
- POST /api/v1/spa/auth/sign-in
- POST /api/v1/spa/auth/sign-out
- GET /api/v1/spa/auth/me

## Public Catalog / CMS
- GET /api/v1/spa/catalog/services
- GET /api/v1/spa/catalog/categories
- GET /api/v1/spa/site-settings
- GET /api/v1/spa/gallery

## Member Account
- GET /api/v1/spa/account/profile
- PUT /api/v1/spa/account/profile
- GET /api/v1/spa/account/bookings

## Admin
- GET/POST/PUT/DELETE /api/v1/spa/admin/services
- GET/PATCH /api/v1/spa/admin/bookings
- GET /api/v1/spa/admin/customers
- GET/PUT /api/v1/spa/admin/site-settings
- GET/POST/PUT/DELETE /api/v1/spa/admin/gallery
- GET/PUT /api/v1/spa/admin/media-storage
- GET/PUT /api/v1/spa/admin/ai-concierge

## Media Providers
- s3
- google_drive
- imagekit
- cloudinary

Secrets are server-only and never returned by API responses.
```

- [ ] **Step 2: Run the focused spa test suite**

Run:

```bash
pnpm --filter @noxivo/workflow-engine test -- test/spa-auth-routes.test.ts test/spa-catalog-routes.test.ts test/spa-bookings-routes.test.ts test/spa-admin-routes.test.ts test/spa-media-url.service.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run workflow-engine lint**

Run:

```bash
pnpm --filter @noxivo/workflow-engine lint
```

Expected: PASS.

- [ ] **Step 4: Run workflow-engine build**

Run:

```bash
pnpm --filter @noxivo/workflow-engine build
```

Expected: PASS.

- [ ] **Step 5: Update handoff files**

Append concrete completion notes to `TODO.md` and `SESSION_HANDOFF.md`, including:

```md
- finished: spa backend auth/catalog/bookings/customers/settings/gallery/media-provider/ai routes
- verification: workflow-engine spa tests, lint, build
- next: connect Spa Tique frontend to new /api/v1/spa endpoints
- env: cookie domain assumptions, any storage-provider env used for backend-only secret management
```

- [ ] **Step 6: Commit docs and handoff updates**

```bash
git add docs/reference/spa-api.md TODO.md SESSION_HANDOFF.md
git commit -m "docs: add spa backend API reference"
```

---

## Self-Review

### Spec coverage
- Auth/session flow: covered in Task 2.
- Catalog/services/categories: covered in Tasks 1 and 3.
- Bookings/account/profile/customers: covered in Tasks 4 and 5.
- CMS/site settings/gallery/AI config: covered in Tasks 3 and 5.
- Media provider settings for S3/Google Drive/ImageKit/Cloudinary: covered in Tasks 1, 3, and 6.
- Docs/verification/handoff: covered in Task 6.

### Placeholder scan
- No `TODO`, `TBD`, or “implement later” steps remain in executable tasks.
- All commands are concrete and repo-specific.

### Type consistency
- Planned route prefix is consistently `/api/v1/spa`.
- Session cookie name is consistently `spa_member_session`.
- Media provider enum is consistently `s3 | google_drive | imagekit | cloudinary`.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-19-spa-backend-source-of-truth-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints
