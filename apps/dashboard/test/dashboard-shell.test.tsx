import { describe, expect, it } from 'vitest';
import { getDashboardNavigation } from '../lib/dashboard/navigation.js';

describe('dashboard shell navigation', () => {
  it('shows the platform agency directory only for platform admins', () => {
    const platformNavigation = getDashboardNavigation('platform_admin').map((item) => item.name);
    expect(platformNavigation).toContain('Agencies');
    expect(platformNavigation).toContain('Settings');
    expect(platformNavigation).not.toContain('Agency');
    expect(platformNavigation).not.toContain('Team');
    expect(platformNavigation).not.toContain('Tenants');
  });

  it('shows agency, team, and tenants navigation for agency users', () => {
    const agencyNavigation = getDashboardNavigation('agency_admin').map((item) => item.name);
    expect(agencyNavigation).toContain('Agency');
    expect(agencyNavigation).toContain('Team');
    expect(agencyNavigation).toContain('Clients');
    expect(agencyNavigation).toContain('Settings');
    expect(agencyNavigation).not.toContain('Agencies');
  });

  it('hides agency settings navigation from non-admin agency roles', () => {
    const memberNavigation = getDashboardNavigation('agency_member').map((item) => item.name);
    const viewerNavigation = getDashboardNavigation('viewer').map((item) => item.name);

    expect(memberNavigation).not.toContain('Settings');
    expect(viewerNavigation).not.toContain('Settings');
  });

  it('hides billing when agency admin switches into client context', () => {
    const clientContextNav = getDashboardNavigation({
      role: 'agency_admin',
      scopeRole: 'agency_admin',
      isClientContextActive: true
    }).map((item) => item.name);

    expect(clientContextNav).not.toContain('Billing');
    expect(clientContextNav).not.toContain('Settings');
    expect(clientContextNav).not.toContain('Agency');
    expect(clientContextNav).not.toContain('Tenants');
    expect(clientContextNav).toContain('Conversations');
    expect(clientContextNav).toContain('Workflows');
  });
});
