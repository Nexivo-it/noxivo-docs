# Dashboard UI-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `apps/dashboard` UI-only by moving auth/session ownership into `apps/workflow-engine`, switching dashboard browser code to call workflow-engine directly, and deleting dashboard `app/api/**` auth/business routes after cutover.

**Architecture:** Add a dedicated workflow-engine auth/session module for dashboard users, expose credentialed browser-safe endpoints with explicit CORS/cookie behavior, then introduce a dashboard browser API client and migrate UI consumers off local Next route handlers one slice at a time. Delete the transitional proxy/app-api layer only after auth and feature consumers have all moved.

**Tech Stack:** Next.js App Router, React, Fastify, TypeScript, MongoDB/Mongoose, Vitest.

---

## File structure

- Create: `apps/workflow-engine/src/modules/dashboard-auth/service.ts`
  - Move/adapt dashboard auth business logic (`signupWithAgency`, `authenticateUser`, user mapping) into workflow-engine.
- Create: `apps/workflow-engine/src/modules/dashboard-auth/session.ts`
  - Own session cookie parsing/setting/clearing for direct browser auth.
- Create: `apps/workflow-engine/src/modules/dashboard-auth/routes/index.ts`
  - Register `POST /api/v1/dashboard-auth/login`, `POST /api/v1/dashboard-auth/signup`, `POST /api/v1/dashboard-auth/logout`, `GET /api/v1/dashboard-auth/session`.
- Modify: `apps/workflow-engine/src/server.ts`
  - Register dashboard auth routes and ensure they stay public where needed.
- Modify: `apps/workflow-engine/src/plugins/api-auth.plugin.ts`
  - Exclude `/api/v1/dashboard-auth/**` from API-key auth so browser cookie auth can reach the new public auth endpoints.
- Modify: `apps/workflow-engine/src/plugins/cors.plugin.ts`
  - Make credentialed dashboard browser calls explicit and stable.
- Create: `apps/workflow-engine/test/dashboard-auth-routes.test.ts`
  - Cover login/signup/logout/session plus cookie behavior.
- Create: `apps/dashboard/lib/api/workflow-engine-client.ts`
  - Shared browser-safe fetch wrapper using public workflow-engine base URL.
- Create: `apps/dashboard/lib/api/dashboard-auth-client.ts`
  - Auth-specific client helpers for login/signup/logout/session.
- Create: `apps/dashboard/lib/api/dashboard-api.ts`
  - Central typed wrappers for agencies/catalog/workflows/team-inbox/settings direct calls.
- Modify: `apps/dashboard/components/login-form.tsx`
  - Replace `/api/auth/login` call with workflow-engine direct auth client.
- Modify: `apps/dashboard/components/signup-form.tsx`
  - Replace `/api/auth/signup` call with workflow-engine direct auth client.
- Modify: `apps/dashboard/components/dashboard-shell.tsx`
  - Replace local `/api/notifications` and logout/session assumptions with direct workflow-engine routes.
- Create: `apps/workflow-engine/src/routes/v1/notifications.routes.ts`
  - Move dashboard notifications read/mark-read behavior into workflow-engine.
- Create: `apps/workflow-engine/src/routes/v1/imagekit-auth.routes.ts`
  - Move dashboard ImageKit auth signing route into workflow-engine if uploads must remain available to browser clients.
- Modify: `apps/dashboard/app/dashboard/agencies/agencies-client.tsx`
- Modify: `apps/dashboard/app/dashboard/workflows/workflows-client.tsx`
- Modify: `apps/dashboard/app/dashboard/workflows/templates/templates-client.tsx`
- Modify: `apps/dashboard/app/dashboard/catalog/page.tsx`
- Modify: `apps/dashboard/app/dashboard/catalog/import/page.tsx`
- Modify: `apps/dashboard/app/dashboard/catalog/linking/page.tsx`
- Modify: `apps/dashboard/app/dashboard/catalog/settings/page.tsx`
- Modify: `apps/dashboard/app/dashboard/catalog/preview/page.tsx`
- Modify: `apps/dashboard/app/dashboard/settings/settings-client.tsx`
- Modify: `apps/dashboard/app/dashboard/settings/integrations/integrations-client.tsx`
- Modify: `apps/dashboard/app/dashboard/settings/integrations/webhook-inbox-activation-panel.tsx`
- Modify: `apps/dashboard/app/dashboard/settings/integrations/webhook-inbox-sources-panel.tsx`
- Modify: `apps/dashboard/components/team-inbox/team-inbox-crm-panel.tsx`
  - Move known browser callers off `/api/...` URLs.
- Delete: `apps/dashboard/app/api/auth/login/route.ts`
- Delete: `apps/dashboard/app/api/auth/logout/route.ts`
- Delete: `apps/dashboard/app/api/auth/session/route.ts`
- Delete: `apps/dashboard/app/api/auth/signup/route.ts`
- Delete: `apps/dashboard/app/api/agencies/**`
- Delete: `apps/dashboard/app/api/catalog/**`
- Delete: `apps/dashboard/app/api/workflows/**`
- Delete: `apps/dashboard/app/api/team-inbox/**`
- Delete: `apps/dashboard/app/api/settings/**`
- Delete: `apps/dashboard/app/api/notifications/route.ts`
- Delete: `apps/dashboard/app/api/media/imagekit-auth/route.ts`
- Delete: `apps/dashboard/app/api/v1/agency/webhooks/**`
- Delete: `apps/dashboard/app/api/messaging-proxy/**`
- Delete: `apps/dashboard/app/api/memories/route.ts`
- Delete: `apps/dashboard/app/api/health/route.ts`
- Delete: `apps/dashboard/app/api/health/live/route.ts`
- Delete: `apps/dashboard/lib/api/workflow-engine-proxy.ts`
  - Remove transitional backend façade after all UI callers cut over.
- Modify: `apps/dashboard/test/*.test.ts` affected by auth/API migration
  - Replace proxy route tests with direct-client tests where needed.
- Modify: `TODO.md`
- Modify: `SESSION_HANDOFF.md`

---

### Task 1: Create clean implementation worktree and branch

**Files:**
- None (git workspace setup)

- [ ] **Step 1: Create dedicated worktree from current `main`**

Run:

```bash
mkdir -p .worktrees
GIT_MASTER=1 git worktree add .worktrees/dashboard-ui -b dashboard-ui main
```

- [ ] **Step 2: Verify branch and clean state**

Run:

```bash
GIT_MASTER=1 git status --short --branch
```

Expected:

```text
## dashboard-ui
```

- [ ] **Step 3: Record branch intent in handoff files before code changes**

Append concise notes to `TODO.md` and `SESSION_HANDOFF.md`:

```md
- [ ] Dashboard UI-only migration: move auth/session and remove dashboard app/api backend layer on branch `dashboard-ui`
```

- [ ] **Step 4: Commit branch bootstrap docs update**

Run:

```bash
git add TODO.md SESSION_HANDOFF.md
git commit -m "docs: start dashboard ui-only migration"
```

---

### Task 2: Add workflow-engine dashboard auth/session endpoints

**Files:**
- Create: `apps/workflow-engine/src/modules/dashboard-auth/service.ts`
- Create: `apps/workflow-engine/src/modules/dashboard-auth/session.ts`
- Create: `apps/workflow-engine/src/modules/dashboard-auth/routes/index.ts`
- Modify: `apps/workflow-engine/src/server.ts`
- Modify: `apps/workflow-engine/src/plugins/api-auth.plugin.ts`
- Modify: `apps/workflow-engine/src/plugins/cors.plugin.ts`
- Test: `apps/workflow-engine/test/dashboard-auth-routes.test.ts`

- [ ] **Step 1: Write failing workflow-engine auth route test**

Create `apps/workflow-engine/test/dashboard-auth-routes.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb,
} from './helpers/mongo-memory.js';

describe('dashboard auth routes on workflow-engine', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-dashboard-auth-routes' });
  });

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('supports signup, login, session lookup, and logout with cookie auth', async () => {
    const server = await buildServer({ logger: false });

    try {
      const signup = await server.inject({
        method: 'POST',
        url: '/api/v1/dashboard-auth/signup',
        payload: {
          email: 'owner@example.com',
          password: 'supersecret123',
          fullName: 'Owner User',
          agencyName: 'Acme Agency',
        },
      });

      expect(signup.statusCode).toBe(201);
      const cookie = signup.headers['set-cookie'];
      expect(cookie).toContain('noxivo_session=');

      const session = await server.inject({
        method: 'GET',
        url: '/api/v1/dashboard-auth/session',
        headers: { cookie },
      });

      expect(session.statusCode).toBe(200);
      expect(session.json()).toMatchObject({
        user: expect.objectContaining({ email: 'owner@example.com' }),
      });

      const logout = await server.inject({
        method: 'POST',
        url: '/api/v1/dashboard-auth/logout',
        headers: { cookie },
      });

      expect(logout.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });
});
```

- [ ] **Step 2: Run test to verify route is missing**

Run:

```bash
pnpm --filter @noxivo/workflow-engine exec vitest run test/dashboard-auth-routes.test.ts
```

Expected: FAIL with `404`/missing route behavior.

- [ ] **Step 3: Port dashboard auth business logic into workflow-engine service**

Create `apps/workflow-engine/src/modules/dashboard-auth/service.ts` with adapted dashboard logic:

```ts
import { parseLoginInput, parseSignupInput, type LoginInput, type SignupInput } from '@noxivo/contracts';
import { AgencyInvitationModel, AgencyModel, TenantModel, UserModel } from '@noxivo/database';
import { createHash, randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { dbConnect } from '../../lib/mongodb.js';
import { hashPassword, verifyPassword } from '../../modules/spa/password.js';

export type DashboardAuthenticatedUser = {
  id: string;
  agencyId: string;
  tenantId: string;
  tenantIds: string[];
  email: string;
  fullName: string;
  role: 'platform_admin' | 'agency_owner' | 'agency_admin' | 'agency_member' | 'viewer';
  status: 'active' | 'suspended';
};

function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function mapAuthenticatedUser(user: {
  _id: mongoose.Types.ObjectId;
  agencyId?: mongoose.Types.ObjectId;
  defaultTenantId?: mongoose.Types.ObjectId;
  tenantIds?: mongoose.Types.ObjectId[];
  email: string;
  fullName: string;
  role: string;
  status: 'active' | 'suspended';
}): DashboardAuthenticatedUser {
  return {
    id: user._id.toString(),
    agencyId: user.agencyId?.toString() ?? '',
    tenantId: user.defaultTenantId?.toString() ?? user.tenantIds?.[0]?.toString() ?? '',
    tenantIds: (user.tenantIds ?? []).map((tenantId) => tenantId.toString()),
    email: user.email,
    fullName: user.fullName,
    role: user.role as DashboardAuthenticatedUser['role'],
    status: user.status,
  };
}

export async function dashboardSignupWithAgency(input: SignupInput): Promise<DashboardAuthenticatedUser> {
  await dbConnect();
  const parsed = parseSignupInput(input);
  const existingUser = await UserModel.findOne({ email: parsed.email }).select({ _id: 1 }).lean();
  if (existingUser) {
    throw new Error('An account with this email already exists');
  }

  const agencyId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const passwordHash = await hashPassword(parsed.password);

  await AgencyModel.create({
    _id: agencyId,
    name: parsed.agencyName,
    slug: parsed.agencyName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    plan: 'reseller_basic',
    billingStripeCustomerId: null,
    billingStripeSubscriptionId: null,
    billingOwnerUserId: userId,
    whiteLabelDefaults: {
      customDomain: null,
      logoUrl: null,
      primaryColor: null,
      supportEmail: parsed.email,
      hidePlatformBranding: false,
    },
    usageLimits: { tenants: 5, activeSessions: 25 },
    status: 'trial',
  });

  await TenantModel.create({
    _id: tenantId,
    agencyId,
    slug: `${parsed.agencyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-main`,
    name: `${parsed.agencyName} Workspace`,
    region: 'us-east-1',
    status: 'trial',
    billingMode: 'agency_pays',
    whiteLabelOverrides: {},
    effectiveBrandingCache: {},
  });

  const user = await UserModel.create({
    _id: userId,
    agencyId,
    defaultTenantId: tenantId,
    tenantIds: [tenantId],
    email: parsed.email,
    fullName: parsed.fullName,
    passwordHash,
    role: 'agency_owner',
    status: 'active',
    lastLoginAt: new Date(),
  });

  return mapAuthenticatedUser(user);
}

export async function dashboardAuthenticateUser(input: LoginInput): Promise<DashboardAuthenticatedUser> {
  await dbConnect();
  const parsed = parseLoginInput(input);
  const user = await UserModel.findOne({ email: parsed.email });
  if (!user || user.status !== 'active') {
    throw new Error('Invalid email or password');
  }

  const isValidPassword = await verifyPassword(parsed.password, user.passwordHash);
  if (!isValidPassword) {
    throw new Error('Invalid email or password');
  }

  return mapAuthenticatedUser(user as never);
}
```

- [ ] **Step 4: Add workflow-engine-owned session helpers**

Create `apps/workflow-engine/src/modules/dashboard-auth/session.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';
import { AuthSessionModel, UserModel } from '@noxivo/database';
import { dbConnect } from '../../lib/mongodb.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const AUTH_SESSION_COOKIE_NAME = 'noxivo_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createDashboardSession(input: {
  userId: string;
  agencyId: string;
  tenantId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  await dbConnect();
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await AuthSessionModel.create({
    userId: input.userId,
    agencyId: input.agencyId,
    tenantId: input.tenantId,
    sessionTokenHash: hashSessionToken(token),
    expiresAt,
    lastSeenAt: new Date(),
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });
  await UserModel.findByIdAndUpdate(input.userId, { lastLoginAt: new Date() }).exec();
  return { token, expiresAt };
}

export function setDashboardSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(AUTH_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export function clearDashboardSessionCookie(reply: FastifyReply): void {
  reply.setCookie(AUTH_SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  });
}

export async function deleteDashboardSessionByCookie(request: FastifyRequest): Promise<void> {
  await dbConnect();
  const token = request.cookies[AUTH_SESSION_COOKIE_NAME];
  if (!token) {
    return;
  }
  await AuthSessionModel.deleteOne({ sessionTokenHash: hashSessionToken(token) }).exec();
}

export async function getDashboardSessionFromRequest(request: FastifyRequest) {
  await dbConnect();
  const token = request.cookies[AUTH_SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }
  const authSession = await AuthSessionModel.findOne({
    sessionTokenHash: hashSessionToken(token),
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!authSession) {
    return null;
  }
  const user = await UserModel.findById(authSession.userId).lean();
  if (!user) {
    return null;
  }
  return { actor: mapAuthenticatedUser(user as never), expiresAt: authSession.expiresAt };
}
```

- [ ] **Step 5: Register auth routes and explicit credentialed CORS support**

Create `apps/workflow-engine/src/modules/dashboard-auth/routes/index.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { dashboardAuthenticateUser, dashboardSignupWithAgency } from '../service.js';
import {
  createDashboardSession,
  deleteDashboardSessionByCookie,
  getDashboardSessionFromRequest,
  setDashboardSessionCookie,
  clearDashboardSessionCookie,
} from '../session.js';

export async function dashboardAuthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/v1/dashboard-auth/login', async (request, reply) => {
    const user = await dashboardAuthenticateUser(request.body as never);
    const { token, expiresAt } = await createDashboardSession({
      userId: user.id,
      agencyId: user.agencyId,
      tenantId: user.tenantId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });
    setDashboardSessionCookie(reply, token, expiresAt);
    return reply.status(200).send({ user });
  });

  fastify.post('/api/v1/dashboard-auth/signup', async (request, reply) => {
    const user = await dashboardSignupWithAgency(request.body as never);
    const { token, expiresAt } = await createDashboardSession({
      userId: user.id,
      agencyId: user.agencyId,
      tenantId: user.tenantId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });
    setDashboardSessionCookie(reply, token, expiresAt);
    return reply.status(201).send({ user });
  });

  fastify.get('/api/v1/dashboard-auth/session', async (request, reply) => {
    const session = await getDashboardSessionFromRequest(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    return reply.status(200).send({ user: session.actor });
  });

  fastify.post('/api/v1/dashboard-auth/logout', async (request, reply) => {
    await deleteDashboardSessionByCookie(request);
    clearDashboardSessionCookie(reply);
    return reply.status(200).send({ ok: true });
  });
}
```

Modify `apps/workflow-engine/src/server.ts` and `apps/workflow-engine/src/plugins/cors.plugin.ts`:

```ts
// server.ts
import { dashboardAuthRoutes } from './modules/dashboard-auth/routes/index.js';
import { agencyRoutes } from './modules/agency/routes/index.js';
import { catalogRoutes } from './modules/catalog/routes/index.js';
await fastify.register(dashboardAuthRoutes);
```

```ts
// cors.plugin.ts
allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'X-Requested-With', 'Accept', 'x-agency-context', 'x-tenant-context'],
```

Modify `apps/workflow-engine/src/plugins/api-auth.plugin.ts` so the new auth routes stay public:

```ts
const isExcluded = requestPath.startsWith('/api/v1/admin/') ||
  requestPath.startsWith('/api/v1/spa/') ||
  requestPath.startsWith('/api/v1/catalog/') ||
  requestPath === '/api/v1/catalog' ||
  requestPath.startsWith('/api/v1/team-inbox/') ||
  requestPath === '/api/v1/team-inbox' ||
  requestPath.startsWith('/api/v1/workflows/') ||
  requestPath === '/api/v1/workflows' ||
  requestPath.startsWith('/api/v1/settings/') ||
  requestPath === '/api/v1/settings' ||
  requestPath.startsWith('/api/v1/dashboard-auth/') ||
  requestPath === '/api/v1/dashboard-auth' ||
  requestPath === '/api/v1/agencies' ||
  requestPath.startsWith('/api/v1/agencies/') ||
  requestPath.startsWith('/v1/internal/') ||
  requestPath.startsWith('/v1/webhooks/');
```

- [ ] **Step 6: Re-run auth route test and then full backend verification**

Run:

```bash
pnpm --filter @noxivo/workflow-engine exec vitest run test/dashboard-auth-routes.test.ts
pnpm --filter @noxivo/workflow-engine lint
pnpm --filter @noxivo/workflow-engine build
```

Expected: all PASS.

- [ ] **Step 7: Commit backend auth module**

Run:

```bash
git add apps/workflow-engine/src/modules/dashboard-auth apps/workflow-engine/src/server.ts apps/workflow-engine/src/plugins/api-auth.plugin.ts apps/workflow-engine/src/plugins/cors.plugin.ts apps/workflow-engine/test/dashboard-auth-routes.test.ts
git commit -m "feat(workflow-engine): add dashboard auth endpoints"
```

---

### Task 3: Introduce direct browser API clients in dashboard

**Files:**
- Create: `apps/dashboard/lib/api/workflow-engine-client.ts`
- Create: `apps/dashboard/lib/api/dashboard-auth-client.ts`
- Create: `apps/dashboard/lib/api/dashboard-api.ts`
- Test: `apps/dashboard/test/workflow-engine-client.test.ts`

- [ ] **Step 1: Write failing test for direct client URL/credentials behavior**

Create `apps/dashboard/test/workflow-engine-client.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildWorkflowEngineUrl } from '../lib/api/workflow-engine-client.js';

describe('workflow engine client', () => {
  it('builds public workflow-engine urls from frontend-safe config', () => {
    expect(buildWorkflowEngineUrl('/api/v1/dashboard-auth/session', 'https://api-workflow-engine.noxivo.app'))
      .toBe('https://api-workflow-engine.noxivo.app/api/v1/dashboard-auth/session');
  });
});
```

- [ ] **Step 2: Run test to verify helper does not exist yet**

Run:

```bash
pnpm --filter @noxivo/dashboard exec vitest run test/workflow-engine-client.test.ts
```

Expected: FAIL because helper file is missing.

- [ ] **Step 3: Add shared workflow-engine client**

Create `apps/dashboard/lib/api/workflow-engine-client.ts`:

```ts
const publicBaseUrl = process.env.NEXT_PUBLIC_WORKFLOW_ENGINE_BASE_URL ?? '';

export function buildWorkflowEngineUrl(path: string, overrideBaseUrl = publicBaseUrl): string {
  const base = overrideBaseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export async function workflowEngineFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildWorkflowEngineUrl(path), {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Workflow engine request failed');
  }
  return payload as T;
}
```

- [ ] **Step 4: Add auth client and feature client entrypoints**

Create `apps/dashboard/lib/api/dashboard-auth-client.ts`:

```ts
import { workflowEngineFetch } from './workflow-engine-client';

export function loginWithWorkflowEngine(input: { email: string; password: string }) {
  return workflowEngineFetch<{ user: unknown }>('/api/v1/dashboard-auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function signupWithWorkflowEngine(input: Record<string, unknown>) {
  return workflowEngineFetch<{ user: unknown }>('/api/v1/dashboard-auth/signup', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function logoutFromWorkflowEngine() {
  return workflowEngineFetch<{ ok: true }>('/api/v1/dashboard-auth/logout', { method: 'POST' });
}

export function getWorkflowEngineSession() {
  return workflowEngineFetch<{ user: unknown }>('/api/v1/dashboard-auth/session');
}
```

Create `apps/dashboard/lib/api/dashboard-api.ts` with one wrapper per migrated domain root:

```ts
import { workflowEngineFetch } from './workflow-engine-client';

export const dashboardApi = {
  getAgencies: () => workflowEngineFetch('/api/v1/agencies'),
  getWorkflows: () => workflowEngineFetch('/api/v1/workflows'),
  getCatalog: () => workflowEngineFetch('/api/v1/catalog'),
  getTeamInbox: () => workflowEngineFetch('/api/v1/team-inbox'),
  getSettingsCredentials: () => workflowEngineFetch('/api/v1/settings/credentials'),
};
```

- [ ] **Step 5: Re-run client test**

Run:

```bash
pnpm --filter @noxivo/dashboard exec vitest run test/workflow-engine-client.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit dashboard API clients**

Run:

```bash
git add apps/dashboard/lib/api/workflow-engine-client.ts apps/dashboard/lib/api/dashboard-auth-client.ts apps/dashboard/lib/api/dashboard-api.ts apps/dashboard/test/workflow-engine-client.test.ts
git commit -m "feat(dashboard): add direct workflow-engine clients"
```

---

### Task 4: Cut dashboard auth UI over to workflow-engine direct calls

**Files:**
- Modify: `apps/dashboard/components/login-form.tsx`
- Modify: `apps/dashboard/components/signup-form.tsx`
- Modify: `apps/dashboard/components/dashboard-shell.tsx`
- Modify: `apps/dashboard/lib/auth/current-user.ts`
- Test: `apps/dashboard/test/auth-routes.test.ts`
- Test: `apps/dashboard/test/dashboard-shell-rbac.test.tsx`

- [ ] **Step 1: Write failing auth UI test for direct client usage**

In `apps/dashboard/test/auth-routes.test.ts`, replace local route assumptions with auth-client mocking:

```ts
vi.mock('../lib/api/dashboard-auth-client', () => ({
  loginWithWorkflowEngine: vi.fn(),
  signupWithWorkflowEngine: vi.fn(),
  logoutFromWorkflowEngine: vi.fn(),
  getWorkflowEngineSession: vi.fn(),
}));
```

Add expectation that login/signup success path no longer depends on `/api/auth/*` route handlers.

- [ ] **Step 2: Run auth-focused dashboard tests and confirm they fail**

Run:

```bash
pnpm --filter @noxivo/dashboard exec vitest run test/auth-routes.test.ts test/dashboard-shell-rbac.test.tsx
```

Expected: FAIL because components still call `/api/auth/*` directly.

- [ ] **Step 3: Replace login/signup fetch calls with auth client helpers**

Modify `apps/dashboard/components/login-form.tsx`:

```ts
import { loginWithWorkflowEngine } from '../lib/api/dashboard-auth-client';
async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  setError('');
  setIsLoading(true);

  try {
    await loginWithWorkflowEngine({ email, password });
    router.push('/dashboard');
    router.refresh();
  } catch (error) {
    setError(error instanceof Error ? error.message : 'Unable to sign in');
  } finally {
    setIsLoading(false);
  }
}
```

Modify `apps/dashboard/components/signup-form.tsx`:

```ts
import { signupWithWorkflowEngine } from '../lib/api/dashboard-auth-client';
async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  setError('');

  if (formData.password !== formData.confirmPassword) {
    setError('Passwords do not match');
    return;
  }

  setIsLoading(true);

  try {
    await signupWithWorkflowEngine({
      email: formData.email,
      password: formData.password,
      fullName: formData.fullName,
      agencyName: invitationToken ? undefined : formData.agencyName,
      invitationToken: invitationToken ?? undefined,
    });
    router.push('/dashboard');
    router.refresh();
  } catch (error) {
    setError(error instanceof Error ? error.message : 'Unable to create account');
  } finally {
    setIsLoading(false);
  }
}
```

- [ ] **Step 4: Replace dashboard shell logout/session assumptions**

Modify `apps/dashboard/components/dashboard-shell.tsx` logout behavior to use auth client:

```ts
import { logoutFromWorkflowEngine } from '../lib/api/dashboard-auth-client';
async function handleLogout() {
  await logoutFromWorkflowEngine();
  router.push('/auth/login');
  router.refresh();
}
```

Modify `apps/dashboard/lib/auth/current-user.ts` to use `getWorkflowEngineSession()` instead of dashboard local session route.

- [ ] **Step 5: Re-run auth-focused dashboard tests**

Run:

```bash
pnpm --filter @noxivo/dashboard exec vitest run test/auth-routes.test.ts test/dashboard-shell-rbac.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit auth cutover**

Run:

```bash
git add apps/dashboard/components/login-form.tsx apps/dashboard/components/signup-form.tsx apps/dashboard/components/dashboard-shell.tsx apps/dashboard/lib/auth/current-user.ts apps/dashboard/test/auth-routes.test.ts apps/dashboard/test/dashboard-shell-rbac.test.tsx
git commit -m "refactor(dashboard): move auth ui to workflow-engine"
```

---

### Task 5: Migrate dashboard feature callers off local `/api/**`

**Files:**
- Modify: `apps/dashboard/app/dashboard/agencies/agencies-client.tsx`
- Modify: `apps/dashboard/app/dashboard/workflows/workflows-client.tsx`
- Modify: `apps/dashboard/app/dashboard/workflows/templates/templates-client.tsx`
- Modify: `apps/dashboard/app/dashboard/catalog/page.tsx`
- Modify: `apps/dashboard/app/dashboard/catalog/import/page.tsx`
- Modify: `apps/dashboard/app/dashboard/catalog/linking/page.tsx`
- Modify: `apps/dashboard/app/dashboard/catalog/settings/page.tsx`
- Modify: `apps/dashboard/app/dashboard/catalog/preview/page.tsx`
- Modify: `apps/dashboard/app/dashboard/settings/settings-client.tsx`
- Modify: `apps/dashboard/app/dashboard/settings/integrations/integrations-client.tsx`
- Modify: `apps/dashboard/app/dashboard/settings/integrations/webhook-inbox-activation-panel.tsx`
- Modify: `apps/dashboard/app/dashboard/settings/integrations/webhook-inbox-sources-panel.tsx`
- Modify: `apps/dashboard/components/team-inbox/team-inbox-crm-panel.tsx`
- Test: affected `apps/dashboard/test/*.test.ts`

- [ ] **Step 1: Write failing feature-consumer test for one direct-call slice**

Pick one existing dashboard consumer test, for example `apps/dashboard/test/team-inbox-crm-routes.test.ts`, and change it to mock `dashboardApi` helpers instead of route handlers:

```ts
vi.mock('../lib/api/dashboard-api', () => ({
  dashboardApi: {
    getTeamInboxCrm: vi.fn(),
    patchTeamInboxCrm: vi.fn(),
  },
}));
```

- [ ] **Step 2: Run focused consumer tests to verify they fail first**

Run:

```bash
pnpm --filter @noxivo/dashboard exec vitest run test/team-inbox-crm-routes.test.ts test/settings-credentials-route.test.ts test/agency-management-routes.test.ts
```

Expected: FAIL because UI code still points at `/api/...` URLs.

- [ ] **Step 3: Replace direct `/api/...` fetches with `dashboardApi` wrappers**

Use this conversion pattern in each known caller file:

```ts
// before
const response = await fetch('/api/workflows');

// after
import { dashboardApi } from '../../../lib/api/dashboard-api';
const response = await dashboardApi.getWorkflows();
```

For POST/PATCH/DELETE calls, route through helper methods instead of inline URL strings:

```ts
await dashboardApi.updateWebhookInboxSource(sourceId, payload);
await dashboardApi.createAgency(payload);
await dashboardApi.cloneWorkflow(payload);
```

Extend `apps/dashboard/lib/api/dashboard-api.ts` as each UI caller is migrated. Do not leave mixed direct-URL and helper usage in the same feature slice.

- [ ] **Step 4: Re-run migrated dashboard test subset**

Run:

```bash
pnpm --filter @noxivo/dashboard test
```

Expected: PASS (current baseline is 33 files passed, 1 skipped; update as needed).

- [ ] **Step 5: Commit feature-call migration**

Run:

```bash
git add apps/dashboard/app/dashboard apps/dashboard/components/team-inbox/team-inbox-crm-panel.tsx apps/dashboard/lib/api/dashboard-api.ts apps/dashboard/test
git commit -m "refactor(dashboard): call workflow-engine from browser"
```

---

### Task 6: Move remaining dashboard-only API endpoints off dashboard

**Files:**
- Create: `apps/workflow-engine/src/routes/v1/notifications.routes.ts`
- Create: `apps/workflow-engine/src/routes/v1/imagekit-auth.routes.ts`
- Modify: `apps/workflow-engine/src/server.ts`
- Modify: `apps/dashboard/components/dashboard-shell.tsx`
- Modify: any dashboard UI caller still using `/api/notifications` or `/api/media/imagekit-auth`
- Test: `apps/dashboard/test/smoke-tests.test.ts`

- [ ] **Step 1: Write failing test for notifications/media direct backend usage**

Add to `apps/dashboard/test/smoke-tests.test.ts`:

```ts
vi.mock('../lib/api/dashboard-api', () => ({
  dashboardApi: {
    getNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    getImageKitAuth: vi.fn(),
  },
}));
```

- [ ] **Step 2: Run smoke test to confirm current local-route dependency fails**

Run:

```bash
pnpm --filter @noxivo/dashboard exec vitest run test/smoke-tests.test.ts
```

Expected: FAIL because shell and upload flows still hit dashboard-local notification/media routes.

- [ ] **Step 3: Add workflow-engine routes for notifications and ImageKit auth**

Create `apps/workflow-engine/src/routes/v1/notifications.routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { NotificationModel } from '@noxivo/database';
import { getDashboardSessionFromRequest } from '../../modules/dashboard-auth/session.js';
import { dbConnect } from '../../lib/mongodb.js';

export async function registerNotificationsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/v1/notifications', async (request, reply) => {
    const session = await getDashboardSessionFromRequest(request);
    if (!session) return reply.status(401).send({ error: 'Unauthorized' });
    await dbConnect();
    const { agencyId, tenantId } = session.actor;
    const notifications = await NotificationModel.find({ agencyId, tenantId }).sort({ createdAt: -1 }).limit(50).lean();
    const unreadCount = await NotificationModel.countDocuments({ agencyId, tenantId, isRead: false });
    return reply.send({ notifications, unreadCount });
  });
}
```

Create `apps/workflow-engine/src/routes/v1/imagekit-auth.routes.ts` with the ImageKit auth signing logic currently in dashboard `app/api/media/imagekit-auth/route.ts`, but using workflow-engine session lookup instead of dashboard session lookup.

```ts
import type { FastifyInstance } from 'fastify';
import ImageKit from '@imagekit/nodejs';
import { MediaStorageConfigModel } from '@noxivo/database';
import { dbConnect } from '../../lib/mongodb.js';
import { getDashboardSessionFromRequest } from '../../modules/dashboard-auth/session.js';

export async function registerImagekitAuthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/v1/media/imagekit-auth', async (request, reply) => {
    const session = await getDashboardSessionFromRequest(request);
    if (!session) return reply.status(401).send({ error: 'Unauthorized' });

    await dbConnect();
    const storageConfig = await MediaStorageConfigModel.findOne({
      agencyId: session.actor.agencyId,
      provider: 'imagekit',
      isActive: true,
    }).lean();

    if (!storageConfig || !storageConfig.secretConfig?.privateKey) {
      return reply.status(404).send({ error: 'ImageKit is not configured for this agency' });
    }

    const imagekit = new ImageKit({
      privateKey: storageConfig.secretConfig.privateKey,
      baseURL: storageConfig.publicBaseUrl ?? '',
    });

    return reply.send({
      ...imagekit.helper.getAuthenticationParameters(),
      publicKey: storageConfig.publicConfig?.publicKey ?? '',
    });
  });
}
```

- [ ] **Step 4: Register routes and update dashboard callers**

Modify `apps/workflow-engine/src/server.ts`:

```ts
import { registerNotificationsRoutes } from './routes/v1/notifications.routes.js';
import { registerImagekitAuthRoutes } from './routes/v1/imagekit-auth.routes.js';
import { registerStatusRoutes } from './routes/v1/status.routes.js';
await registerNotificationsRoutes(fastify);
await registerImagekitAuthRoutes(fastify);
```

Update dashboard callers to use `dashboardApi.getNotifications()` and `dashboardApi.getImageKitAuth()` instead of local `/api/...` URLs.

- [ ] **Step 5: Re-run smoke test and commit**

Run:

```bash
pnpm --filter @noxivo/dashboard exec vitest run test/smoke-tests.test.ts
git add apps/workflow-engine/src/routes/v1/notifications.routes.ts apps/workflow-engine/src/routes/v1/imagekit-auth.routes.ts apps/workflow-engine/src/server.ts apps/dashboard/components/dashboard-shell.tsx apps/dashboard/test/smoke-tests.test.ts apps/dashboard/lib/api/dashboard-api.ts
git commit -m "feat(workflow-engine): move dashboard support routes"
```

---

### Task 7: Delete dashboard route layer and transitional proxy helper

**Files:**
- Delete: `apps/dashboard/app/api/auth/login/route.ts`
- Delete: `apps/dashboard/app/api/auth/logout/route.ts`
- Delete: `apps/dashboard/app/api/auth/session/route.ts`
- Delete: `apps/dashboard/app/api/auth/signup/route.ts`
- Delete: `apps/dashboard/app/api/agencies/**`
- Delete: `apps/dashboard/app/api/catalog/**`
- Delete: `apps/dashboard/app/api/workflows/**`
- Delete: `apps/dashboard/app/api/team-inbox/**`
- Delete: `apps/dashboard/app/api/settings/**`
- Delete: `apps/dashboard/lib/api/workflow-engine-proxy.ts`
- Modify: `apps/dashboard/test/*` to remove remaining proxy-route-only tests

- [ ] **Step 1: Write failing cleanup test that proves no UI consumer still imports the proxy helper**

Add a temporary assertion in `apps/dashboard/test/workflow-engine-client.test.ts`:

```ts
import { existsSync } from 'node:fs';
import path from 'node:path';

it('no longer depends on dashboard workflow-engine proxy helper', () => {
  expect(existsSync(path.join(process.cwd(), 'lib/api/workflow-engine-proxy.ts'))).toBe(false);
});
```

- [ ] **Step 2: Run cleanup test and verify it fails while proxy helper still exists**

Run:

```bash
pnpm --filter @noxivo/dashboard exec vitest run test/workflow-engine-client.test.ts
```

Expected: FAIL because proxy helper still exists.

- [ ] **Step 3: Delete transitional route layer**

Remove all now-unused dashboard API route files and proxy helper:

```bash
rm -rf apps/dashboard/app/api/agencies
rm -rf apps/dashboard/app/api/catalog
rm -rf apps/dashboard/app/api/workflows
rm -rf apps/dashboard/app/api/team-inbox
rm -rf apps/dashboard/app/api/settings
rm -f apps/dashboard/app/api/auth/login/route.ts
rm -f apps/dashboard/app/api/auth/logout/route.ts
rm -f apps/dashboard/app/api/auth/session/route.ts
rm -f apps/dashboard/app/api/auth/signup/route.ts
rm -f apps/dashboard/lib/api/workflow-engine-proxy.ts
```

Then remove obsolete proxy-route tests:

```bash
rm -f apps/dashboard/test/phase7-dashboard-proxy-routes.test.ts
rm -f apps/dashboard/test/workflow-engine-proxy-helper.test.ts
```

- [ ] **Step 4: Re-run dashboard tests and build**

Run:

```bash
pnpm --filter @noxivo/dashboard test
pnpm --filter @noxivo/dashboard build
```

Expected: PASS.

- [ ] **Step 5: Commit dashboard UI-only cleanup**

Run:

```bash
git add apps/dashboard
git commit -m "refactor(dashboard): remove app api backend layer"
```

---

### Task 8: Final verification, docs, and branch handoff

**Files:**
- Modify: `TODO.md`
- Modify: `SESSION_HANDOFF.md`

- [ ] **Step 1: Run full project verification for migrated boundary**

Run:

```bash
pnpm --filter @noxivo/dashboard test
pnpm --filter @noxivo/dashboard build
pnpm --filter @noxivo/workflow-engine lint
pnpm --filter @noxivo/workflow-engine build
pnpm --filter @noxivo/workflow-engine test
```

Expected: all PASS.

- [ ] **Step 2: Update handoff files with exact migration outcome**

Append concrete notes:

```md
## Dashboard UI-only migration
- workflow-engine now owns dashboard auth/session endpoints
- dashboard browser calls workflow-engine directly
- deleted dashboard app/api backend layer
- branch: dashboard-ui
```

- [ ] **Step 3: Commit docs/handoff update**

Run:

```bash
git add TODO.md SESSION_HANDOFF.md
git commit -m "docs: record dashboard ui-only migration"
```

- [ ] **Step 4: Prepare branch for review**

Run:

```bash
GIT_MASTER=1 git status --short --branch
GIT_MASTER=1 git log --oneline main..HEAD
```

Expected:

```text
## dashboard-ui
<clean working tree>
```

---

## Spec coverage self-review

- Dashboard UI-only boundary covered by Tasks 3, 4, 5, and 6.
- Auth/session move to workflow-engine covered by Task 2 and Task 4.
- Direct browser → workflow-engine contract covered by Tasks 2, 3, and 5.
- Deletion of dashboard `app/api/**` covered by Task 6.
- Branch `dashboard-ui` covered by Task 1 and Task 7.
- Cross-origin/CORS/cookie risk covered by Task 2 verification and final verification in Task 7.

No placeholder markers (`TBD`, `TODO`, “implement later”) left in task steps.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-21-dashboard-ui-only-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
