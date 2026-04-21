import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as listAgencyTeam } from '../app/api/agencies/[agencyId]/team/route.js';
import { PATCH as patchAgencyUser, DELETE as deleteAgencyUser } from '../app/api/agencies/[agencyId]/team/[userId]/route.js';
import { GET as listAgencyInvitations, POST as createAgencyInvitation } from '../app/api/agencies/[agencyId]/invitations/route.js';

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

describe('team management routes proxy behavior', () => {
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

  it('forwards agency team list/update/delete requests to workflow-engine', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await listAgencyTeam(new Request('http://localhost/api/agencies/agency-123/team'), {
      params: Promise.resolve({ agencyId: 'agency-123' }),
    });
    await patchAgencyUser(
      new Request('http://localhost/api/agencies/agency-123/team/user-7', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'agency_admin' }),
      }),
      { params: Promise.resolve({ agencyId: 'agency-123', userId: 'user-7' }) }
    );
    await deleteAgencyUser(
      new Request('http://localhost/api/agencies/agency-123/team/user-7', { method: 'DELETE' }),
      { params: Promise.resolve({ agencyId: 'agency-123', userId: 'user-7' }) }
    );

    const calledUrls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(calledUrls).toEqual([
      'http://workflow-engine.internal/api/v1/agencies/agency-123/team',
      'http://workflow-engine.internal/api/v1/agencies/agency-123/team/user-7',
      'http://workflow-engine.internal/api/v1/agencies/agency-123/team/user-7',
    ]);
  });

  it('forwards invitation list/create routes to workflow-engine', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await listAgencyInvitations(new Request('http://localhost/api/agencies/agency-123/invitations?status=pending'), {
      params: Promise.resolve({ agencyId: 'agency-123' }),
    });
    await createAgencyInvitation(
      new Request('http://localhost/api/agencies/agency-123/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'member@example.com', role: 'agency_member' }),
      }),
      { params: Promise.resolve({ agencyId: 'agency-123' }) }
    );

    const calledUrls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(calledUrls).toEqual([
      'http://workflow-engine.internal/api/v1/agencies/agency-123/invitations?status=pending',
      'http://workflow-engine.internal/api/v1/agencies/agency-123/invitations',
    ]);
  });
});
