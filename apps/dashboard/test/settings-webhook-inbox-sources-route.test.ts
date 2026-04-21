import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GET as listWebhookInboxSources,
  POST as createWebhookInboxSource,
} from '../app/api/settings/webhook-inbox-sources/route.js';
import { PATCH as patchWebhookInboxSource } from '../app/api/settings/webhook-inbox-sources/[sourceId]/route.js';

const { mockGetCurrentSession } = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn(),
}));

vi.mock('../lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession,
}));

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('settings webhook inbox sources route proxy behavior', () => {
  beforeEach(() => {
    process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL = 'http://workflow-engine.internal';
    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: 'user-1',
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        email: 'owner@example.com',
        fullName: 'Owner',
        role: 'agency_owner',
        status: 'active',
      },
      expiresAt: new Date(Date.now() + 60_000),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL;
  });

  it('forwards list and create requests to workflow-engine', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ sources: [] }))
      .mockResolvedValueOnce(createJsonResponse({ source: { id: 'src-1' } }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await listWebhookInboxSources(new Request('http://localhost/api/settings/webhook-inbox-sources?status=active'));
    await createWebhookInboxSource(
      new Request('http://localhost/api/settings/webhook-inbox-sources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Website Chat' }),
      })
    );

    const calledUrls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(calledUrls).toEqual([
      'http://workflow-engine.internal/api/v1/settings/webhook-inbox-sources?status=active',
      'http://workflow-engine.internal/api/v1/settings/webhook-inbox-sources',
    ]);
  });

  it('encodes sourceId and forwards PATCH to workflow-engine', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ source: { id: 'src-1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const rawSourceId = 'source/id with spaces';
    await patchWebhookInboxSource(
      new Request('http://localhost/api/settings/webhook-inbox-sources/source-id', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'disabled' }),
      }),
      { params: Promise.resolve({ sourceId: rawSourceId }) }
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `http://workflow-engine.internal/api/v1/settings/webhook-inbox-sources/${encodeURIComponent(rawSourceId)}`
    );
    expect(init.method).toBe('PATCH');
  });
});
