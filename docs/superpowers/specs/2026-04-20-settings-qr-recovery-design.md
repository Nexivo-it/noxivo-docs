# Settings QR Recovery Design

## Overview

The WhatsApp pairing experience in dashboard settings currently has a contract mismatch between the passive page-load flow and the explicit login flow. On passive load, the dashboard can collapse a recoverable pairing state into `unavailable` with no QR value, and the UI stops polling because it only continues when the state is already `provisioning` or `available`. The result is a dead-end screen where the QR never appears even though the session may already be bootstrapping or waiting for scan.

This design fixes the settings QR flow without turning page load into a side-effect-heavy bootstrap action. The page remains passive for truly unlinked workspaces, but it must automatically continue recovery for already-existing sessions that are in a recoverable pending state such as `STARTING`, `SCAN_QR_CODE`, or equivalent provisioning states.

## Goals

- Keep the Settings page passive on first load when no usable WhatsApp session exists yet.
- Automatically continue QR recovery on page load when a session already exists and is in a recoverable pending state.
- Distinguish between `bootstrap required`, `preparing`, `qr ready`, `connected`, and `hard failure` instead of flattening all QR/status problems into `null`.
- Ensure the UI keeps polling while the provider is still starting and waiting for a QR token.
- Stop polling and show a real error only for explicit hard-failure states or repeated non-transient backend failures.
- Preserve the explicit login/regenerate action for creating or restarting sessions.

## Non-Goals

- Do not turn passive `GET /api/settings/qr` into unconditional bootstrap.
- Do not auto-restart `STOPPED`, `OFFLINE`, or unrelated failure states on page load.
- Do not redesign the admin pairing flow; this design is for the **settings** pairing flow.
- Do not change the inbox implementation in this spec.

## Approved Product Decisions

- Use the **hybrid** model: passive on first load, but auto-recover already-pending sessions.
- Auto-recover only `STARTING`, `SCAN_QR_CODE`, or equivalent provisioning states.
- If QR is not yet available while the session is still starting, show a **Preparing WhatsApp login...** state and continue polling.
- Stop auto-polling and show an error only for explicit hard failures (`FAILED`, auth/config failures, or repeated non-transient backend errors).

## Architecture

### Source of Truth

The settings QR flow should be driven by a single normalized pairing snapshot returned by the dashboard route `apps/dashboard/app/api/settings/qr/route.ts`. The UI should not infer pairing semantics from a loose combination of `status`, `qr`, and missing values. Instead, the route/helper combination should produce a stable contract that explains what the UI should do next.

The snapshot should include:
- `state`: one of `unlinked`, `preparing`, `qr_ready`, `connected`, `failed`
- `qrValue`: QR token string or `null`
- `reason`: machine-readable explanation such as `bootstrap_required`, `starting`, `scan_qr_code`, `already_connected`, `hard_failure`, `transient_qr_unavailable`
- `poll`: boolean telling the UI whether it should keep polling
- existing diagnostics/profile/session metadata as needed for rendering and support

This keeps behavior deterministic and removes the current ambiguity where `status='available'` but `qr=null` can still mean several very different things.

### Passive GET Behavior

`GET /api/settings/qr` must remain passive. It may inspect the existing engine/provider state, but it must not create a brand-new session just because the Settings page opened.

The passive route behavior should be:
- If there is **no binding and no recoverable live session**, return `state='unlinked'`, `reason='bootstrap_required'`, `poll=false`.
- If there is an existing session or binding and the provider reports a recoverable startup state, return `state='preparing'`, `poll=true`.
- If a QR token is available, return `state='qr_ready'`, `poll=true`.
- If the session is already connected, return `state='connected'`, `poll=false`.
- If the backend can prove a hard failure, return `state='failed'`, `poll=false`.

This preserves the product decision that a brand-new login must begin with an explicit user action, while still recovering correctly when there is already an active pairing attempt underway.

### Explicit POST Behavior

`POST /api/settings/qr` remains the action that creates, starts, or regenerates a session.

After bootstrap/start/restart, the route should request the same normalized pairing snapshot, but it should treat early provider startup as `preparing` rather than as an absence of QR. The POST path may still perform bootstrap recovery, but the response contract should match the same state model as GET so the UI can behave consistently.

Expected POST outcomes:
- session just created or restarting and provider still booting → `preparing`, `poll=true`
- provider already returned QR token → `qr_ready`, `poll=true`
- provider already connected → `connected`, `poll=false`
- true failure → `failed`, `poll=false`

### Dashboard Helper Changes

The main normalization work belongs in `apps/dashboard/lib/api/messaging-session.ts`.

Current problems:
- `getSessionStatus()`, `getSessionQr()`, and `getSessionProfile()` swallow all errors and return `null`
- `readSnapshot()` can infer `available` from `SCAN_QR_CODE` even when no QR token exists
- passive GET with `allowBootstrapRecovery: false` can strand the UI in a non-polling `unavailable` state

The helper should be changed so that:
- transient fetch failures from the QR endpoint are preserved as **reasons**, not erased into bare `null`
- `SCAN_QR_CODE` with no QR token yet becomes `preparing` unless a QR token is actually present
- empty QR + confirmed connected state becomes `connected`, not “missing QR”
- missing binding on passive GET becomes `unlinked`, not a generic `unavailable`

### UI State Machine

The settings screen in `apps/dashboard/app/dashboard/settings/settings-client.tsx` should render from the normalized `state` instead of loosely derived booleans.

Required state behavior:
- `unlinked` → show “Log in to WhatsApp”, no polling
- `preparing` → show “Preparing WhatsApp login...”, poll every 3s
- `qr_ready` → render QR, poll every 5s
- `connected` → show linked profile, no polling
- `failed` → show error, no polling

The UI should not require both a legacy `status === 'available'` check and a truthy QR value to decide whether the pairing flow is working. The backend contract should already tell it whether QR is ready or whether the system is still preparing.

## Engine Contract Interpretation

The engine routes can stay mostly the same:
- `GET /api/v1/sessions/:id/status`
- `GET /api/v1/sessions/:id/qr`
- `GET /api/v1/sessions/:id/profile`

But the dashboard must interpret them more carefully:
- upstream/provider startup states should map to `preparing`
- upstream `422` / empty QR when already connected should map to `connected`
- repeated non-transient request failures should map to `failed`

If small engine-side clarifications are needed later, they should only make the returned reason/state easier to distinguish; they should not be the primary fix.

## Test Strategy

### Dashboard route tests

Update and extend `apps/dashboard/test/settings-qr-route.test.ts` to cover:
- passive GET with no binding returns `unlinked` + `bootstrap_required`
- passive GET with recoverable startup state returns `preparing` + `poll=true`
- POST bootstrap with delayed QR returns `preparing` first, not a dead-end `unavailable`
- QR token available returns `qr_ready`
- connected/no-QR case returns `connected`
- hard-failure case returns `failed`

### Helper-level behavior

If helper extraction becomes complex, add focused tests around the normalization logic in `apps/dashboard/lib/api/messaging-session.ts` so the meaning of `STARTING`, `SCAN_QR_CODE`, empty QR, and swallowed request failures stays explicit.

### UI behavior

Update settings UI tests, or add them if missing, to verify:
- polling starts for `preparing`
- QR renders only for `qr_ready`
- passive `unlinked` does not poll
- `failed` shows error and stops polling

## Risks and Constraints

- The existing test suite currently locks in part of the broken passive GET behavior, so tests must change with the contract.
- Overcorrecting by making GET auto-bootstrap would introduce hidden side effects and polling churn on page load; avoid that.
- Simply polling more without fixing state semantics would preserve the ambiguity and make debugging harder.

## File Targets

Primary files expected to change:
- `apps/dashboard/app/api/settings/qr/route.ts`
- `apps/dashboard/lib/api/messaging-session.ts`
- `apps/dashboard/app/dashboard/settings/settings-client.tsx`
- `apps/dashboard/test/settings-qr-route.test.ts`

Potential supporting files if needed:
- `apps/dashboard/app/api/settings/whatsapp-check/route.ts`
- engine route tests if a small contract clarification is introduced there

## Expected Outcome

After this design is implemented, the Settings page will no longer get stranded in a no-QR dead state when an existing pairing flow is already underway. Brand-new sessions will still require an explicit login click, but once a recoverable pairing attempt exists, the screen will automatically continue into `preparing` and then `qr_ready` until the QR appears or a real hard failure is confirmed.
