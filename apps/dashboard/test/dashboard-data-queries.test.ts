import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbConnect,
  mockAgencyFindById,
  mockConversationCountDocuments,
  mockTenantCountDocuments,
  mockTenantFind,
  mockWorkflowCountDocuments,
  mockWorkflowFind,
  mockWorkflowRunAggregate,
  mockWorkflowRunCountDocuments,
  mockWorkflowExecutionFind,
  mockUsageAggregate,
  mockBindingCountDocuments,
  mockConversationFind,
  mockUserCountDocuments,
  mockListAccessibleAgencies,
  mockGetAgencyAdministrationDetail,
  mockListAgencyTeam,
} = vi.hoisted(() => ({
  mockDbConnect: vi.fn(),
  mockAgencyFindById: vi.fn(),
  mockConversationCountDocuments: vi.fn(),
  mockTenantCountDocuments: vi.fn(),
  mockTenantFind: vi.fn(),
  mockWorkflowCountDocuments: vi.fn(),
  mockWorkflowFind: vi.fn(),
  mockWorkflowRunAggregate: vi.fn(),
  mockWorkflowRunCountDocuments: vi.fn(),
  mockWorkflowExecutionFind: vi.fn(),
  mockUsageAggregate: vi.fn(),
  mockBindingCountDocuments: vi.fn(),
  mockConversationFind: vi.fn(),
  mockUserCountDocuments: vi.fn(),
  mockListAccessibleAgencies: vi.fn(),
  mockGetAgencyAdministrationDetail: vi.fn(),
  mockListAgencyTeam: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({
  default: mockDbConnect,
}));

vi.mock('@noxivo/database', () => ({
  AgencyModel: { findById: mockAgencyFindById },
  ConversationModel: {
    countDocuments: mockConversationCountDocuments,
    find: mockConversationFind,
  },
  TenantModel: {
    countDocuments: mockTenantCountDocuments,
    find: mockTenantFind,
  },
  UserModel: { countDocuments: mockUserCountDocuments },
  MessagingSessionBindingModel: { countDocuments: mockBindingCountDocuments },
  WorkflowDefinitionModel: {
    countDocuments: mockWorkflowCountDocuments,
    find: mockWorkflowFind,
  },
  WorkflowRunModel: {
    aggregate: mockWorkflowRunAggregate,
    countDocuments: mockWorkflowRunCountDocuments,
  },
  WorkflowExecutionEventModel: { find: mockWorkflowExecutionFind },
  UsageMeterEventModel: { aggregate: mockUsageAggregate },
}));

vi.mock('../lib/dashboard/agency-admin', () => ({
  listAccessibleAgencies: mockListAccessibleAgencies,
  getAgencyAdministrationDetail: mockGetAgencyAdministrationDetail,
}));

vi.mock('../lib/dashboard/team-admin', () => ({
  listAgencyTeam: mockListAgencyTeam,
}));

import {
  queryAgencies,
  queryAgencyCounts,
  queryAgencyOverview,
  queryDashboardOverview,
  queryDashboardShellData,
  queryTeamManagement,
} from '../lib/dashboard/queries.js';

describe('dashboard data queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAgencyFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: { toString: () => 'agency-1' },
        name: 'Acme Agency',
        slug: 'acme-agency',
        plan: 'reseller_basic',
        status: 'active',
      }),
    });

    mockConversationCountDocuments.mockResolvedValue(1);
    mockTenantCountDocuments.mockResolvedValue(2);
    mockWorkflowCountDocuments.mockResolvedValue(1);
    mockWorkflowRunCountDocuments.mockResolvedValue(6);
    mockWorkflowRunAggregate.mockResolvedValue([{ total: 10, completed: 8 }]);
    mockUsageAggregate.mockResolvedValue([{ total: 24 }]);
    mockBindingCountDocuments.mockResolvedValue(1);
    mockUserCountDocuments.mockResolvedValue(3);
    mockTenantFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: { toString: () => 'tenant-1' },
            name: 'Acme Main',
            slug: 'acme-main',
            status: 'active',
          },
          {
            _id: { toString: () => 'tenant-2' },
            name: 'Acme East',
            slug: 'acme-east',
            status: 'active',
          },
        ]),
      }),
    });
    mockConversationFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              _id: { toString: () => 'conversation-1' },
              contactId: '15550001111',
              contactName: 'Test Contact',
              lastMessageContent: 'Hello world',
              lastMessageAt: new Date(),
            },
          ]),
        }),
      }),
    });
    mockWorkflowExecutionFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              _id: { toString: () => 'event-1' },
              nodeId: 'node-1',
              status: 'completed',
              startedAt: new Date(),
            },
          ]),
        }),
      }),
    });
    mockWorkflowFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              _id: { toString: () => 'wf-1' },
              key: 'welcome-flow',
              name: 'Welcome Flow',
              isActive: true,
            },
          ]),
        }),
      }),
    });
    mockListAccessibleAgencies.mockResolvedValue([
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
      {
        id: 'agency-2',
        name: 'Northwind Agency',
        slug: 'northwind-agency',
        customDomain: 'northwind.test',
        supportEmail: 'ops@northwind.test',
        primaryColor: '#4F46E5',
        plan: 'enterprise',
        status: 'trial',
        tenantCount: 1,
        teamCount: 2,
        createdAt: '2026-04-11T10:00:00.000Z',
      },
    ]);
    mockGetAgencyAdministrationDetail.mockResolvedValue({
      agency: {
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
      tenantCount: 2,
      teamCount: 3,
      tenants: [
        {
          id: 'tenant-1',
          agencyId: 'agency-1',
          slug: 'acme-main',
          name: 'Acme Main',
          region: 'us-east-1',
          status: 'active',
          billingMode: 'agency_pays',
          customDomain: null,
          createdAt: '2026-04-10T10:00:00.000Z',
        },
      ],
    });
    mockListAgencyTeam.mockResolvedValue({
      members: [
        {
          id: 'user-1',
          userId: 'user-1',
          email: 'owner@example.com',
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
          email: 'invitee@example.com',
          fullName: 'Invitee User',
          role: 'agency_member',
          status: 'pending',
          tenantIds: ['tenant-1'],
          invitedAt: '2026-04-10T11:00:00.000Z',
          expiresAt: '2026-04-17T11:00:00.000Z',
        },
      ],
    });
  });

  it('returns authenticated shell and overview data from read models', async () => {
    const session = {
      id: 'session-id',
      actor: {
        userId: 'user-id',
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        tenantIds: ['tenant-1'],
        email: 'owner@example.com',
        fullName: 'Owner User',
        role: 'agency_owner' as const,
        status: 'active' as const,
      },
      expiresAt: new Date(Date.now() + 60000),
    };

    const [shell, overview, agencies, agencyOverview, teamManagement, counts] = await Promise.all([
      queryDashboardShellData(session),
      queryDashboardOverview(session),
      queryAgencies(session),
      queryAgencyOverview(session),
      queryTeamManagement(session),
      queryAgencyCounts(session),
    ]);

    expect(mockDbConnect).toHaveBeenCalled();
    expect(shell.agency.name).toBe('Acme Agency');
    expect(shell.user.role).toBe('agency_owner');
    expect(shell.clientTenants).toHaveLength(2);
    expect(shell.activeClientTenant?.id).toBe('tenant-1');
    expect(overview.stats.conversations).toBe(1);
    expect(overview.stats.totalUsageEvents).toBe(24);
    expect(agencies).toHaveLength(2);
    expect(agencyOverview.agency.slug).toBe('acme-agency');
    expect(teamManagement.members).toHaveLength(1);
    expect(teamManagement.invitations).toHaveLength(1);
    expect(counts.teamCount).toBe(3);
    expect(counts.tenantCount).toBe(2);
  });
});
