import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxyDashboardRouteToWorkflowEngine } from '../lib/api/workflow-engine-proxy.js';

const { mockGetCurrentSession } = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn(),
}));

vi.mock('../lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession,
}));

describe('workflow-engine proxy helper', () => {
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

  it('returns 401 and does not call fetch when session is missing', async () => {
    mockGetCurrentSession.mockResolvedValueOnce(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await proxyDashboardRouteToWorkflowEngine(new Request('http://localhost/api/agencies'), {
      targetPath: '/agencies',
    });

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards method, query, headers, cookies and body to workflow-engine', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await proxyDashboardRouteToWorkflowEngine(
      new Request('http://localhost/api/workflows?status=active', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'noxivo_session=sess-1',
          'x-forwarded-for': '127.0.0.1',
        },
        body: JSON.stringify({ name: 'New Flow' }),
      }),
      { targetPath: '/workflows' }
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://workflow-engine.internal/api/v1/workflows?status=active');
    expect(init.method).toBe('POST');

    const headers = new Headers(init.headers);
    expect(headers.get('cookie')).toBe('noxivo_session=sess-1');
    expect(headers.get('content-type')).toContain('application/json');
    expect(headers.get('x-forwarded-for')).toBe('127.0.0.1');
    expect(init.body).toBeDefined();
  });
});
