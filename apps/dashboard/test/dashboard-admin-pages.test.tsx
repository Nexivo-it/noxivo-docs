import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const { mockRequireCurrentSession } = vi.hoisted(() => ({
  mockRequireCurrentSession: vi.fn(),
}));

const { mockQueryAgencies, mockQueryAgencyOverview, mockQueryTeamManagement, mockQueryDashboardOverview } = vi.hoisted(() => ({
  mockQueryAgencies: vi.fn(),
  mockQueryAgencyOverview: vi.fn(),
  mockQueryTeamManagement: vi.fn(),
  mockQueryDashboardOverview: vi.fn(),
}));

const { mockRedirect } = vi.hoisted(() => ({
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

const { mockUseRouter } = vi.hoisted(() => ({
  mockUseRouter: vi.fn(() => ({
    refresh: vi.fn(),
    push: vi.fn(),
  })),
}));

vi.mock('../lib/auth/current-user', () => ({
  requireCurrentSession: mockRequireCurrentSession,
}));

vi.mock('../lib/dashboard/queries', () => ({
  queryAgencies: mockQueryAgencies,
  queryAgencyOverview: mockQueryAgencyOverview,
  queryTeamManagement: mockQueryTeamManagement,
  queryDashboardOverview: mockQueryDashboardOverview,
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
  useRouter: mockUseRouter,
}));

import AgenciesPage from '../app/dashboard/agencies/page.js';
import AccountPage from '../app/dashboard/account/page.js';
import { AgenciesClientPage } from '../app/dashboard/agencies/agencies-client.js';
import SettingsPage from '../app/dashboard/settings/page.js';
import { TeamWorkspace } from '../components/team-workspace.js';

describe('dashboard admin pages', () => {
  it('/dashboard/agencies content renders the agency list for platform admins', () => {
    const markup = renderToStaticMarkup(createElement(AgenciesClientPage, {
      agencies: [
        {
          id: 'agency-1',
          name: 'Acme Agency',
          slug: 'acme-agency',
          customDomain: null,
          supportEmail: 'ops@acme.test',
          primaryColor: '#6366F1',
          plan: 'reseller_basic',
          status: 'active',
          tenantCount: 2,
          teamCount: 3,
          createdAt: '2026-04-10T10:00:00.000Z',
        },
      ],
    }));

    expect(markup).toContain('Agency administration');
    expect(markup).toContain('Create Agency');
    expect(markup).toContain('Acme Agency');
  });

  it('/dashboard/agencies redirects agency admins away from the global list', async () => {
    mockRequireCurrentSession.mockResolvedValue({
      actor: {
        role: 'agency_admin',
      },
    });

    await expect(AgenciesPage()).rejects.toThrow('REDIRECT:/dashboard/agency');
  });

  it('/dashboard/account renders personal account settings for authenticated non-admin users', async () => {
    mockRequireCurrentSession.mockResolvedValue({
      actor: {
        fullName: 'Member User',
        email: 'member@acme.test',
        role: 'agency_member',
      },
    });

    const markup = renderToStaticMarkup(await AccountPage());

    expect(markup).toContain('Account settings');
    expect(markup).toContain('Member User');
    expect(markup).toContain('member@acme.test');
    expect(markup).toContain('Agency Member');
  });

  it('/dashboard/settings redirects authenticated non-admin users away from agency settings', async () => {
    mockRequireCurrentSession.mockResolvedValue({
      actor: {
        role: 'agency_member',
      },
    });

    await expect(SettingsPage()).rejects.toThrow('REDIRECT:/dashboard');
  });

  it('/dashboard/team content renders the dedicated invite/member workspace', () => {
    const markup = renderToStaticMarkup(createElement(TeamWorkspace, {
      agencyId: 'agency-1',
      agencyName: 'Acme Agency',
      agencyPlan: 'reseller_pro',
      actorRole: 'agency_owner',
      members: [
        {
          id: 'user-1',
          userId: 'user-1',
          email: 'owner@acme.test',
          fullName: 'Owner User',
          role: 'agency_owner',
          status: 'active',
          tenantIds: ['tenant-1'],
          defaultTenantId: 'tenant-1',
          createdAt: '2026-04-10T10:00:00.000Z',
          tenantAccessSummary: 'All tenants',
        },
      ],
      invitations: [
        {
          id: 'invite-1',
          agencyId: 'agency-1',
          email: 'invitee@acme.test',
          fullName: 'Invitee User',
          role: 'agency_member',
          status: 'pending',
          tenantIds: ['tenant-1'],
          invitedAt: '2026-04-10T11:00:00.000Z',
          expiresAt: '2026-04-17T11:00:00.000Z',
        },
      ],
      tenantOptions: [{ id: 'tenant-1', name: 'Acme Main' }],
    }));

    expect(markup).toContain('workspace access');
    expect(markup).toContain('Invite member');
    expect(markup).toContain('Pending invitations');
    expect(markup).toContain('Seat planning follows');
  });
});
