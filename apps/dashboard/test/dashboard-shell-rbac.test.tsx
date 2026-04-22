/** @vitest-environment jsdom */

import React, { createElement } from 'react';
import * as ReactNamespace from 'react';
import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DashboardShell } from '../components/dashboard-shell';

const { pushMock, refreshMock, logoutFromWorkflowEngineMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  logoutFromWorkflowEngineMock: vi.fn(),
}));

// Mock Next.js hooks
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/dashboard'),
  useRouter: vi.fn(() => ({
    refresh: refreshMock,
    push: pushMock,
  })),
}));

vi.mock('../lib/api/dashboard-auth-client', () => ({
  logoutFromWorkflowEngine: logoutFromWorkflowEngineMock,
}));

vi.mock('../components/theme-toggle', () => ({
  ThemeToggle: () => createElement('div', { 'data-testid': 'theme-toggle' })
}));

// Mock Lucide icons to simplify markup
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual as any,
    // Just return a simple tag for icons to keep markup clean
    Building2: () => createElement('svg', { 'data-testid': 'icon-building' }),
    ChevronDown: () => createElement('svg', { 'data-testid': 'icon-chevron' }),
  };
});

describe('DashboardShell RBAC UI', () => {
  beforeAll(() => {
    vi.stubGlobal('React', ReactNamespace);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    logoutFromWorkflowEngineMock.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  const mockAgency = {
    id: 'agency-1',
    name: 'Primary Agency',
    slug: 'primary',
    plan: 'reseller_pro' as const
  };

  const allAgencies = [
    { id: 'agency-1', name: 'Primary Agency', slug: 'primary', plan: 'reseller_pro' as const },
    { id: 'agency-2', name: 'Secondary Agency', slug: 'secondary', plan: 'reseller_basic' as const }
  ];

  it('renders Agency Switcher for platform_admin', () => {
    const markup = renderToStaticMarkup(createElement(DashboardShell, {
      user: { fullName: 'Admin', email: 'admin@test.com', role: 'platform_admin', scopeRole: 'owner' },
      agency: mockAgency,
      allAgencies,
      clientTenants: [
        { id: 'tenant-1', name: 'Client A', slug: 'client-a' },
        { id: 'tenant-2', name: 'Client B', slug: 'client-b' }
      ],
      children: createElement('div', null, 'Content')
    }));

    expect(markup).toContain('Agency Context');
    expect(markup).toContain('Client Context');
    expect(markup).toContain('Primary Agency');
    // Check for switcher indicator (chevron)
    expect(markup).toContain('data-testid="icon-chevron"');
  });

  it('renders Agency Switcher for multi-agency user', () => {
    const markup = renderToStaticMarkup(createElement(DashboardShell, {
      user: { 
        fullName: 'Multi User', 
        email: 'multi@test.com', 
        role: 'platform_admin',
        scopeRole: 'owner',
        memberships: [
          { agencyId: 'agency-1', role: 'agency_admin' },
          { agencyId: 'agency-2', role: 'agency_member' }
        ]
      },
      agency: mockAgency,
      allAgencies,
      clientTenants: [
        { id: 'tenant-1', name: 'Client A', slug: 'client-a' },
        { id: 'tenant-2', name: 'Client B', slug: 'client-b' }
      ],
      children: createElement('div', null, 'Content')
    }));

    expect(markup).toContain('Agency Context');
    expect(markup).toContain('Client Context');
    expect(markup).toContain('Primary Agency');
    expect(markup).toContain('data-testid="icon-chevron"');
  });

  it('renders locked client breadcrumb for client_admin', () => {
    const markup = renderToStaticMarkup(createElement(DashboardShell, {
      user: { 
        fullName: 'Client User', 
        email: 'client@test.com', 
        role: 'agency_member',
        scopeRole: 'client_admin',
        memberships: [{ agencyId: 'agency-1', role: 'agency_owner' }]
      },
      agency: mockAgency,
      activeClientTenant: { id: 'tenant-1', name: 'Client A', slug: 'client-a' },
      allAgencies: [mockAgency],
      children: createElement('div', null, 'Content')
    }));

    expect(markup).toContain('Active Client');
    expect(markup).toContain('Client A');
    expect(markup).not.toContain('Agency Context');
    expect(markup).not.toContain('Client Context');
  });

  it('renders Billing tab only for agency_owner or agency_admin', () => {
    const ownerMarkup = renderToStaticMarkup(createElement(DashboardShell, {
      user: { fullName: 'Owner', email: 'owner@test.com', role: 'agency_owner' },
      agency: mockAgency,
      children: null
    }));
    expect(ownerMarkup).toContain('Billing');

    const agentMarkup = renderToStaticMarkup(createElement(DashboardShell, {
      user: { fullName: 'Agent', email: 'agent@test.com', role: 'agency_member' },
      agency: mockAgency,
      children: null
    }));
    expect(agentMarkup).not.toContain('Billing');
  });

  it('logs out via workflow-engine auth client', async () => {
    logoutFromWorkflowEngineMock.mockResolvedValue({ ok: true });

    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn()
    });

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 0 })
    })));

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(DashboardShell, {
        user: { fullName: 'Owner', email: 'owner@test.com', role: 'agency_owner' },
        agency: mockAgency,
        children: createElement('div', null, 'Content')
      }));
    });

    const logoutButton = container.querySelector('button[title="Log Out"]');
    expect(logoutButton).toBeTruthy();

    await act(async () => {
      logoutButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(logoutFromWorkflowEngineMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith('/auth/login');
    expect(refreshMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
