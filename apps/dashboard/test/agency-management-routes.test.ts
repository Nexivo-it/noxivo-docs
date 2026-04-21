import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as listAgencies, POST as createAgency } from '../app/api/agencies/route.js';
import { GET as getAgency, PATCH as patchAgency } from '../app/api/agencies/[agencyId]/route.js';
import { GET as listAgencyTenants, POST as createAgencyTenant } from '../app/api/agencies/[agencyId]/tenants/route.js';
import { GET as getAgencyTenant } from '../app/api/agencies/[agencyId]/tenants/[tenantId]/route.js';
import { GET as listAgencyTeam } from '../app/api/agencies/[agencyId]/team/route.js';
import { PATCH as patchAgencyUser, DELETE as deleteAgencyUser } from '../app/api/agencies/[agencyId]/team/[userId]/route.js';
import { GET as listAgencyInvitations, POST as createAgencyInvitation } from '../app/api/agencies/[agencyId]/invitations/route.js';
import {
  PATCH as patchAgencyInvitation,
  DELETE as deleteAgencyInvitation,
} from '../app/api/agencies/[agencyId]/invitations/[invitationId]/route.js';

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

describe('agency management routes proxy to workflow-engine', () => {
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

  it('forwards GET /api/agencies to /api/v1/agencies with query + cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse([{ id: 'a-1' }]));
    vi.stubGlobal('fetch', fetchMock);

    const response = await listAgencies(
      new Request('http://localhost/api/agencies?includeInactive=true', {
        headers: { cookie: 'noxivo_session=sess-1' },
      })
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://workflow-engine.internal/api/v1/agencies?includeInactive=true');
    expect(init.method).toBe('GET');
    const headers = new Headers(init.headers);
    expect(headers.get('cookie')).toBe('noxivo_session=sess-1');
  });

  it('forwards agency subtree methods with params and json body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await createAgency(
      new Request('http://localhost/api/agencies', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'noxivo_session=sess-1',
        },
        body: JSON.stringify({ name: 'Acme Agency' }),
      })
    );
    await getAgency(new Request('http://localhost/api/agencies/agency-123'), {
      params: Promise.resolve({ agencyId: 'agency-123' }),
    });
    await patchAgency(
      new Request('http://localhost/api/agencies/agency-123', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      }),
      { params: Promise.resolve({ agencyId: 'agency-123' }) }
    );

    await listAgencyTenants(new Request('http://localhost/api/agencies/agency-123/tenants'), {
      params: Promise.resolve({ agencyId: 'agency-123' }),
    });
    await createAgencyTenant(
      new Request('http://localhost/api/agencies/agency-123/tenants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Tenant A' }),
      }),
      { params: Promise.resolve({ agencyId: 'agency-123' }) }
    );
    await getAgencyTenant(new Request('http://localhost/api/agencies/agency-123/tenants/tenant-42'), {
      params: Promise.resolve({ agencyId: 'agency-123', tenantId: 'tenant-42' }),
    });

    await listAgencyTeam(new Request('http://localhost/api/agencies/agency-123/team'), {
      params: Promise.resolve({ agencyId: 'agency-123' }),
    });
    await patchAgencyUser(
      new Request('http://localhost/api/agencies/agency-123/team/user-42', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'agency_admin' }),
      }),
      { params: Promise.resolve({ agencyId: 'agency-123', userId: 'user-42' }) }
    );
    await deleteAgencyUser(new Request('http://localhost/api/agencies/agency-123/team/user-42', { method: 'DELETE' }), {
      params: Promise.resolve({ agencyId: 'agency-123', userId: 'user-42' }),
    });

    await listAgencyInvitations(new Request('http://localhost/api/agencies/agency-123/invitations'), {
      params: Promise.resolve({ agencyId: 'agency-123' }),
    });
    await createAgencyInvitation(
      new Request('http://localhost/api/agencies/agency-123/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'invite@example.com', role: 'agency_member' }),
      }),
      { params: Promise.resolve({ agencyId: 'agency-123' }) }
    );
    await patchAgencyInvitation(
      new Request('http://localhost/api/agencies/agency-123/invitations/inv-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'agency_admin' }),
      }),
      { params: Promise.resolve({ agencyId: 'agency-123', invitationId: 'inv-1' }) }
    );
    await deleteAgencyInvitation(new Request('http://localhost/api/agencies/agency-123/invitations/inv-1', { method: 'DELETE' }), {
      params: Promise.resolve({ agencyId: 'agency-123', invitationId: 'inv-1' }),
    });

    const calledUrls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(calledUrls).toEqual([
      'http://workflow-engine.internal/api/v1/agencies',
      'http://workflow-engine.internal/api/v1/agencies/agency-123',
      'http://workflow-engine.internal/api/v1/agencies/agency-123',
      'http://workflow-engine.internal/api/v1/agencies/agency-123/tenants',
      'http://workflow-engine.internal/api/v1/agencies/agency-123/tenants',
      'http://workflow-engine.internal/api/v1/agencies/agency-123/tenants/tenant-42',
      'http://workflow-engine.internal/api/v1/agencies/agency-123/team',
      'http://workflow-engine.internal/api/v1/agencies/agency-123/team/user-42',
      'http://workflow-engine.internal/api/v1/agencies/agency-123/team/user-42',
      'http://workflow-engine.internal/api/v1/agencies/agency-123/invitations',
      'http://workflow-engine.internal/api/v1/agencies/agency-123/invitations',
      'http://workflow-engine.internal/api/v1/agencies/agency-123/invitations/inv-1',
      'http://workflow-engine.internal/api/v1/agencies/agency-123/invitations/inv-1',
    ]);
  });
});
