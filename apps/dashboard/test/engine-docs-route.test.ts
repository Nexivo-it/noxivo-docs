import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as openEngineDocs } from '../app/dashboard/engine-docs/route.js';

const { mockGetCurrentSession } = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn(),
}));

vi.mock('../lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession,
}));

describe('dashboard engine docs route', () => {
  beforeEach(() => {
    process.env.WORKFLOW_ENGINE_PUBLIC_BASE_URL = 'https://api-workflow-engine.noxivo.app';
    process.env.WORKFLOW_ENGINE_INTERNAL_PSK = 'shared-docs-secret';
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
    delete process.env.WORKFLOW_ENGINE_PUBLIC_BASE_URL;
    delete process.env.WORKFLOW_ENGINE_INTERNAL_PSK;
  });

  it('redirects anonymous users to dashboard login first', async () => {
    mockGetCurrentSession.mockResolvedValueOnce(null);

    const response = await openEngineDocs(new Request('http://localhost/dashboard/engine-docs'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/auth/login?next=%2Fdashboard%2Fengine-docs');
  });

  it('redirects signed-in dashboard users to workflow-engine docs authorization bridge', async () => {
    const response = await openEngineDocs(new Request('http://localhost/dashboard/engine-docs?returnTo=%2Fdocs%2Fjson'));

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();

    const url = new URL(location as string);
    expect(url.origin).toBe('https://api-workflow-engine.noxivo.app');
    expect(url.pathname).toBe('/docs/authorize');
    expect(url.searchParams.get('returnTo')).toBe('/docs/json');
    expect(url.searchParams.get('token')).toBeTruthy();
  });
});
