# Settings QR Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the dashboard settings WhatsApp pairing flow so passive load stays passive for unlinked workspaces, but recoverable pending sessions automatically progress into preparing/QR-ready states instead of getting stranded with no QR.

**Architecture:** Normalize the QR contract in the dashboard helper and settings API route first, then update the settings UI to render from explicit pairing states instead of inferring behavior from loosely coupled `status` and `qr` fields. Keep the engine routes largely unchanged and interpret their outputs more precisely.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest.

---

## File structure

- Modify: `apps/dashboard/lib/api/messaging-session.ts`
  - Add a normalized pairing snapshot contract (`state`, `reason`, `poll`, `qrValue`) and stop flattening recoverable QR/status errors into opaque `null`.
- Modify: `apps/dashboard/app/api/settings/qr/route.ts`
  - Return the normalized pairing snapshot for GET/POST/DELETE.
- Modify: `apps/dashboard/app/api/settings/whatsapp-check/route.ts`
  - Reuse the normalized snapshot so passive status checks match the new QR semantics.
- Create: `apps/dashboard/app/dashboard/settings/qr-state.ts`
  - Small pure helper module that maps API pairing states into settings UI behavior (badge, polling eligibility, primary action copy).
- Modify: `apps/dashboard/app/dashboard/settings/settings-client.tsx`
  - Consume the normalized pairing snapshot and render/poll from the new state model.
- Test: `apps/dashboard/test/settings-qr-route.test.ts`
  - Update route contract expectations.
- Test: `apps/dashboard/test/settings-whatsapp-check-route.test.ts`
  - Align passive status expectations with the new normalized contract.
- Create: `apps/dashboard/test/settings-qr-state.test.ts`
  - Add focused tests for the extracted UI state helper.

---

### Task 1: Normalize the settings pairing snapshot contract

**Files:**
- Modify: `apps/dashboard/lib/api/messaging-session.ts`
- Modify: `apps/dashboard/app/api/settings/qr/route.ts`
- Modify: `apps/dashboard/app/api/settings/whatsapp-check/route.ts`
- Test: `apps/dashboard/test/settings-qr-route.test.ts`
- Test: `apps/dashboard/test/settings-whatsapp-check-route.test.ts`

- [ ] **Step 1: Write failing route tests for the new passive and recoverable states**

Update `apps/dashboard/test/settings-qr-route.test.ts` so the passive GET contract no longer expects the broken `unavailable` fallback when no binding exists.

Replace the current passive GET expectation:

```ts
expect(payload).toMatchObject({
  status: 'unavailable',
  qr: null,
  provisioning: false
});
```

with the normalized contract expectation:

```ts
expect(payload).toMatchObject({
  state: 'unlinked',
  reason: 'bootstrap_required',
  poll: false,
  qrValue: null,
  qr: null
});
```

Add a new recoverable-startup case in the same file:

```ts
it('returns preparing when an existing session is starting but QR is not ready yet', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.includes('/sessions/by-tenant?') && (!init?.method || init.method === 'GET')) {
      return new Response(JSON.stringify({ id: 'binding-id', name: 'owner-example-whatsapp' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (url.endsWith('/sessions/binding-id/status')) {
      return new Response(JSON.stringify({ status: 'STARTING', me: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (url.endsWith('/sessions/binding-id/qr')) {
      return new Response(JSON.stringify({ qr: '' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (url.endsWith('/sessions/binding-id/profile')) {
      return new Response('Not Found', { status: 404 });
    }

    return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  });

  vi.stubGlobal('fetch', fetchMock);

  const response = await getSettingsQr(makeRequest());
  const payload = await response.json() as {
    state: string;
    reason: string;
    poll: boolean;
    qrValue: string | null;
  };

  expect(response.status).toBe(200);
  expect(payload).toMatchObject({
    state: 'preparing',
    reason: 'starting',
    poll: true,
    qrValue: null
  });
});
```

Update `apps/dashboard/test/settings-whatsapp-check-route.test.ts` to match the same passive contract:

```ts
expect(payload).toMatchObject({
  agencyId,
  tenantId,
  state: 'unlinked',
  reason: 'bootstrap_required',
  poll: false,
  qrValue: null,
  qr: null
});
```

- [ ] **Step 2: Run the route tests to confirm they fail first**

Run:

```bash
pnpm --filter @noxivo/dashboard exec vitest run test/settings-qr-route.test.ts test/settings-whatsapp-check-route.test.ts
```

Expected: FAIL because the current routes return `status`-based snapshots like `unavailable`/`available` and do not include `state`, `reason`, or `poll`.

- [ ] **Step 3: Implement the normalized pairing snapshot in the helper and routes**

In `apps/dashboard/lib/api/messaging-session.ts`, add the explicit snapshot types near the current `DashboardMessagingSessionSnapshot` definition:

```ts
export type DashboardPairingState = 'unlinked' | 'preparing' | 'qr_ready' | 'connected' | 'failed';

export type DashboardPairingReason =
  | 'bootstrap_required'
  | 'starting'
  | 'scan_qr_code'
  | 'transient_qr_unavailable'
  | 'already_connected'
  | 'hard_failure';

export type DashboardMessagingSessionSnapshot = {
  sessionName: string;
  state: DashboardPairingState;
  reason: DashboardPairingReason;
  poll: boolean;
  qr: string | null;
  qrValue: string | null;
  profile: EngineSessionProfile;
  diagnostics: Record<string, unknown> | null;
  provisioning: boolean;
  syncedAt: string;
};
```

Change `getSessionQr()` so it preserves recoverable failure information instead of swallowing everything to bare `null`:

```ts
async function getSessionQr(sessionId: string): Promise<
  | { kind: 'ok'; qrValue: string | null }
  | { kind: 'recoverable_error'; message: string }
> {
  try {
    const payload = await fetchEngineJson<{ qr?: string | null; qrValue?: string | null; value?: string | null; code?: string | null }>(
      `/sessions/${encodeURIComponent(sessionId)}/qr`
    );

    const qrValue = payload.qr ?? payload.qrValue ?? payload.value ?? payload.code ?? null;
    return { kind: 'ok', qrValue: qrValue && qrValue.trim().length > 0 ? qrValue : null };
  } catch (error) {
    return {
      kind: 'recoverable_error',
      message: error instanceof Error ? error.message : 'Unknown QR fetch error'
    };
  }
}
```

Refactor `readSnapshot()` to map recoverable pending states explicitly:

```ts
const [statusPayload, qrResult] = await Promise.all([
  getSessionStatus(sessionId),
  getSessionQr(sessionId),
]);

const rawStatus = statusPayload?.status?.trim().toUpperCase();
const qrValue = qrResult.kind === 'ok' ? qrResult.qrValue : null;

if (connected) {
  return { state: 'connected', reason: 'already_connected', poll: false, qr: null, qrValue: null, ...base };
}

if (qrValue) {
  return { state: 'qr_ready', reason: 'scan_qr_code', poll: true, qr: qrValue, qrValue, ...base };
}

if (rawStatus === 'STARTING' || rawStatus === 'CONNECTING' || rawStatus === 'LOADING' || rawStatus === 'PROVISIONING' || rawStatus === 'SCAN_QR_CODE') {
  return {
    state: 'preparing',
    reason: rawStatus === 'SCAN_QR_CODE' ? 'scan_qr_code' : 'starting',
    poll: true,
    qr: null,
    qrValue: null,
    ...base,
  };
}

if (rawStatus === 'FAILED' || rawStatus === 'ERROR') {
  return { state: 'failed', reason: 'hard_failure', poll: false, qr: null, qrValue: null, ...base };
}
```

And change the missing-binding return value to the passive unlinked state:

```ts
if (!binding) {
  return {
    sessionName: `unlinked-${agencyId.slice(-6)}-${tenantId.slice(-6)}`,
    state: 'unlinked',
    reason: 'bootstrap_required',
    poll: false,
    qr: null,
    qrValue: null,
    profile: null,
    diagnostics: {
      status: 'UNLINKED',
      me: null,
      engine: { name: 'MessagingProvider' }
    },
    provisioning: false,
    syncedAt: new Date().toISOString()
  };
}
```

In both `apps/dashboard/app/api/settings/qr/route.ts` and `apps/dashboard/app/api/settings/whatsapp-check/route.ts`, return the normalized fields directly:

```ts
return NextResponse.json({
  sessionName: data.sessionName,
  state: data.state,
  reason: data.reason,
  poll: data.poll,
  status: data.state,
  qr: data.qr,
  qrValue: data.qrValue,
  profile: data.profile,
  diagnostics: data.diagnostics,
  provisioning: data.provisioning,
  syncedAt: data.syncedAt
});
```

- [ ] **Step 4: Run the route tests again and confirm they pass**

Run:

```bash
pnpm --filter @noxivo/dashboard exec vitest run test/settings-qr-route.test.ts test/settings-whatsapp-check-route.test.ts
```

Expected: PASS. The GET routes now return `unlinked` for truly passive no-binding cases and `preparing` for recoverable startup states.

- [ ] **Step 5: Commit the normalized contract change if commits were explicitly requested in this session**

```bash
git add apps/dashboard/lib/api/messaging-session.ts apps/dashboard/app/api/settings/qr/route.ts apps/dashboard/app/api/settings/whatsapp-check/route.ts apps/dashboard/test/settings-qr-route.test.ts apps/dashboard/test/settings-whatsapp-check-route.test.ts
git commit -m "fix(dashboard): normalize settings QR recovery states"
```

---

### Task 2: Update the settings UI to render and poll from the new pairing states

**Files:**
- Create: `apps/dashboard/app/dashboard/settings/qr-state.ts`
- Modify: `apps/dashboard/app/dashboard/settings/settings-client.tsx`
- Create: `apps/dashboard/test/settings-qr-state.test.ts`

- [ ] **Step 1: Write failing tests for the pairing state helper**

Create `apps/dashboard/test/settings-qr-state.test.ts` with focused tests:

```ts
import { describe, expect, it } from 'vitest';
import { mapPairingSnapshotToUi, shouldPollPairingState } from '../app/dashboard/settings/qr-state.js';

describe('settings qr state helper', () => {
  it('treats preparing as a polling state', () => {
    expect(shouldPollPairingState('preparing')).toBe(true);
  });

  it('treats qr_ready as a polling state', () => {
    expect(shouldPollPairingState('qr_ready')).toBe(true);
  });

  it('treats unlinked as a non-polling state', () => {
    expect(shouldPollPairingState('unlinked')).toBe(false);
  });

  it('maps qr_ready snapshot into a renderable QR state', () => {
    expect(mapPairingSnapshotToUi({
      state: 'qr_ready',
      qrValue: 'token',
      reason: 'scan_qr_code',
      poll: true,
      sessionName: 'owner-example-whatsapp',
      profile: null,
      diagnostics: null,
      syncedAt: null,
      error: null
    })).toMatchObject({
      status: 'qr_ready',
      qrValue: 'token',
      error: null
    });
  });
});
```

- [ ] **Step 2: Run the new helper test to confirm it fails**

Run:

```bash
pnpm --filter @noxivo/dashboard exec vitest run test/settings-qr-state.test.ts
```

Expected: FAIL because `qr-state.ts` does not exist yet.

- [ ] **Step 3: Create the helper and wire the settings screen to it**

Create `apps/dashboard/app/dashboard/settings/qr-state.ts`:

```ts
export type PairingUiStatus = 'loading' | 'unlinked' | 'preparing' | 'qr_ready' | 'connected' | 'failed';

export type PairingSnapshot = {
  state: 'unlinked' | 'preparing' | 'qr_ready' | 'connected' | 'failed';
  reason: string | null;
  poll: boolean;
  qrValue: string | null;
  sessionName: string | null;
  profile: Record<string, unknown> | null;
  diagnostics: Record<string, unknown> | null;
  syncedAt: string | null;
  error: string | null;
};

export function shouldPollPairingState(state: PairingUiStatus): boolean {
  return state === 'preparing' || state === 'qr_ready';
}

export function mapPairingSnapshotToUi(snapshot: PairingSnapshot) {
  return {
    status: snapshot.state,
    qrValue: snapshot.qrValue,
    error: snapshot.state === 'failed' ? snapshot.error ?? 'WhatsApp pairing failed' : snapshot.error,
    sessionName: snapshot.sessionName,
    profile: snapshot.profile,
    diagnostics: snapshot.diagnostics,
    syncedAt: snapshot.syncedAt,
  };
}
```

Then update `apps/dashboard/app/dashboard/settings/settings-client.tsx`:

- replace `QRStatus` with the new UI status type:

```ts
import { mapPairingSnapshotToUi, shouldPollPairingState, type PairingUiStatus } from './qr-state';

type QRStatus = PairingUiStatus;
```

- in `fetchQR()`, read the normalized response contract instead of inferring from `status`:

```ts
const state = readString(data.state) as QRStatus | null;
const qrValue = readString(data.qrValue ?? data.qr);
const poll = data.poll === true;

if (!res.ok || state === 'failed') {
  setQrState({
    status: 'failed',
    qrValue: null,
    error: error ?? 'WhatsApp pairing failed',
    sessionName,
    profile,
    diagnostics,
    syncedAt,
  });
  return { ok: false, status: 'failed', error: error ?? 'WhatsApp pairing failed' };
}

if (!state) {
  setQrState({
    status: 'failed',
    qrValue: null,
    error: 'Invalid pairing snapshot',
    sessionName,
    profile,
    diagnostics,
    syncedAt,
  });
  return { ok: false, status: 'failed', error: 'Invalid pairing snapshot' };
}

setQrState(mapPairingSnapshotToUi({
  state,
  reason: readString(data.reason),
  poll,
  qrValue,
  sessionName,
  profile,
  diagnostics,
  syncedAt,
  error,
}));
```

- change polling to use the helper:

```ts
useEffect(() => {
  if (!shouldPollPairingState(qrState.status)) {
    return;
  }

  const interval = window.setInterval(() => {
    void fetchQR('background');
  }, qrState.status === 'qr_ready' ? 5000 : 3000);

  return () => window.clearInterval(interval);
}, [qrState.status]);
```

- change the render branches so QR rendering keys off `qr_ready`, preparing keys off `preparing`, and error keys off `failed`:

```tsx
{qrState.status === 'loading' || qrState.status === 'preparing' ? (
  // preparing panel
) : qrState.status === 'connected' ? (
  // connected panel
) : qrState.status === 'failed' ? (
  // failed panel
) : qrState.status === 'qr_ready' && qrState.qrValue ? (
  // qr panel
) : (
  // unlinked standby panel
)}
```

- update labels to match the new names:

```ts
const isQrReady = qrState.status === 'qr_ready' && Boolean(qrState.qrValue);
const isSessionBusy = qrState.status === 'loading' || qrState.status === 'preparing';
```

- [ ] **Step 4: Run the helper test and the route tests together**

Run:

```bash
pnpm --filter @noxivo/dashboard exec vitest run test/settings-qr-state.test.ts test/settings-qr-route.test.ts test/settings-whatsapp-check-route.test.ts
```

Expected: PASS. The helper exists, the settings client polls on `preparing`/`qr_ready`, and passive `unlinked` no longer masquerades as a polling failure.

- [ ] **Step 5: Commit the UI state-machine change if commits were explicitly requested in this session**

```bash
git add apps/dashboard/app/dashboard/settings/qr-state.ts apps/dashboard/app/dashboard/settings/settings-client.tsx apps/dashboard/test/settings-qr-state.test.ts
git commit -m "fix(dashboard): recover whatsapp qr pairing states"
```

---

### Task 3: Run focused verification and clean up remaining QR regressions

**Files:**
- Modify: `apps/dashboard/test/settings-qr-route.test.ts`
- Modify: `apps/dashboard/test/settings-whatsapp-check-route.test.ts`
- Modify: `apps/dashboard/app/dashboard/settings/settings-client.tsx`

- [ ] **Step 1: Add one final failing test for the connected-with-empty-QR case**

In `apps/dashboard/test/settings-qr-route.test.ts`, add:

```ts
it('returns connected when provider reports a connected session with no qr token', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.includes('/sessions/by-tenant?') && (!init?.method || init.method === 'GET')) {
      return new Response(JSON.stringify({ id: 'binding-id', name: 'owner-example-whatsapp' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (url.endsWith('/sessions/binding-id/status')) {
      return new Response(JSON.stringify({ status: 'WORKING', me: { id: '84961566302@c.us', name: 'Owner' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (url.endsWith('/sessions/binding-id/qr')) {
      return new Response(JSON.stringify({ qr: '' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (url.endsWith('/sessions/binding-id/profile')) {
      return new Response(JSON.stringify({ id: '84961566302@c.us', name: 'Owner' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  });

  vi.stubGlobal('fetch', fetchMock);

  const response = await getSettingsQr(makeRequest());
  const payload = await response.json() as { state: string; poll: boolean; qrValue: string | null };

  expect(response.status).toBe(200);
  expect(payload).toMatchObject({
    state: 'connected',
    poll: false,
    qrValue: null
  });
});
```

- [ ] **Step 2: Run the focused QR verification suite and confirm the new case fails first**

Run:

```bash
pnpm --filter @noxivo/dashboard exec vitest run test/settings-qr-route.test.ts test/settings-whatsapp-check-route.test.ts test/settings-qr-state.test.ts && pnpm --filter @noxivo/dashboard lint
```

Expected: the first run may fail until the connected/no-QR normalization and any remaining UI type updates are fully finished.

- [ ] **Step 3: Finish the connected/no-QR normalization and final UI copy cleanup**

Ensure `apps/dashboard/lib/api/messaging-session.ts` sets connected state before QR readiness when profile/me/raw status prove the session is working:

```ts
const connected = profileConnected || meConnected || rawStatus === 'WORKING';

if (connected) {
  return {
    sessionName,
    state: 'connected',
    reason: 'already_connected',
    poll: false,
    qr: null,
    qrValue: null,
    profile: profileForUi,
    diagnostics,
    provisioning: false,
    syncedAt: new Date().toISOString(),
  };
}
```

And update the copy in `settings-client.tsx` so the standby/error messages align with the new contract:

```ts
const sessionPanelCopy = hasLinkedProfile
  ? 'This workspace is linked to the live WhatsApp profile shown above. Log out below whenever you want to require a fresh login.'
  : qrState.status === 'qr_ready'
    ? 'Scan the secure QR code above in WhatsApp to finish login, or regenerate it below if you need a fresh token.'
    : qrState.status === 'preparing'
      ? 'We are preparing a secure WhatsApp login channel. The QR code will appear here as soon as the session is ready.'
      : qrState.status === 'failed'
        ? 'The login channel hit a hard failure. Retry after reviewing the error below.'
        : 'Start WhatsApp login below to generate a secure QR code for this workspace.';
```

- [ ] **Step 4: Run the full focused verification suite and confirm it passes**

Run:

```bash
pnpm --filter @noxivo/dashboard exec vitest run test/settings-qr-route.test.ts test/settings-whatsapp-check-route.test.ts test/settings-qr-state.test.ts
pnpm --filter @noxivo/dashboard lint
```

Expected:
- all three test files PASS
- dashboard lint/typecheck PASS

- [ ] **Step 5: Commit the final QR verification cleanup if commits were explicitly requested in this session**

```bash
git add apps/dashboard/lib/api/messaging-session.ts apps/dashboard/app/dashboard/settings/settings-client.tsx apps/dashboard/test/settings-qr-route.test.ts apps/dashboard/test/settings-whatsapp-check-route.test.ts apps/dashboard/test/settings-qr-state.test.ts
git commit -m "test(dashboard): cover whatsapp qr recovery edge cases"
```

---

## Self-review

### Spec coverage
- Passive GET remains passive: covered in Task 1.
- Recoverable pending sessions auto-progress into preparing/QR-ready: covered in Tasks 1 and 2.
- Hard failures stop polling: covered in Tasks 1 and 2.
- Connected/no-QR case is explicit: covered in Task 3.

### Placeholder scan
- No `TODO`, `TBD`, or “implement later” markers remain.
- All tasks include concrete file paths, commands, and code snippets.

### Type consistency
- Pairing state vocabulary is consistent across plan tasks: `unlinked`, `preparing`, `qr_ready`, `connected`, `failed`.
- The route/helper/UI contract uses `state`, `reason`, `poll`, `qrValue` consistently.
