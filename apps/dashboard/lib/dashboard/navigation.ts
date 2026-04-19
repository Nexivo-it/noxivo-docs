import type { LucideIcon } from 'lucide-react';
import {
  Building,
  Building2,
  CreditCard,
  Crown,
  LayoutDashboard,
  MessageSquareMore,
  Settings,
  Users,
  Waypoints,
} from 'lucide-react';

export interface DashboardNavigationItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

const sharedNavigation: DashboardNavigationItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Conversations', href: '/dashboard/conversations', icon: MessageSquareMore },
  { name: 'Leads', href: '/dashboard/leads', icon: Users },
  { name: 'Catalog', href: '/dashboard/catalog', icon: Waypoints },
  { name: 'Workflows', href: '/dashboard/workflows', icon: Waypoints },
  { name: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

const dashboardNavigationItem: DashboardNavigationItem = { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard };
const secondarySharedNavigation = sharedNavigation.slice(1);

const platformNavigation: DashboardNavigationItem[] = [
  { name: 'Agencies', href: '/dashboard/agencies', icon: Crown },
];

const agencyNavigation: DashboardNavigationItem[] = [
  { name: 'Agency', href: '/dashboard/agency', icon: Building2 },
  { name: 'Team', href: '/dashboard/team', icon: Users },
  { name: 'Clients', href: '/dashboard/tenants', icon: Building },
];

export type DashboardRole = 'platform_admin' | 'agency_owner' | 'agency_admin' | 'agency_member' | 'viewer';
export type DashboardScopeRole = 'owner' | 'agency_admin' | 'client_admin' | 'agent';

export interface DashboardNavigationContext {
  role: DashboardRole;
  scopeRole?: DashboardScopeRole;
  isClientContextActive?: boolean;
}

function resolveScopeRole(context: DashboardNavigationContext): DashboardScopeRole {
  if (context.scopeRole) {
    return context.scopeRole;
  }

  switch (context.role) {
    case 'platform_admin':
      return 'owner';
    case 'agency_owner':
    case 'agency_admin':
      return 'agency_admin';
    default:
      return 'agent';
  }
}

function normalizeContext(input: DashboardRole | DashboardNavigationContext): DashboardNavigationContext {
  if (typeof input === 'string') {
    return { role: input };
  }

  return input;
}

function hasAgencyAdminAccess(context: DashboardNavigationContext): boolean {
  const scopeRole = resolveScopeRole(context);
  return scopeRole === 'owner' || scopeRole === 'agency_admin';
}

function isClientContext(context: DashboardNavigationContext): boolean {
  if (context.isClientContextActive) {
    return true;
  }

  const scopeRole = resolveScopeRole(context);
  return scopeRole === 'client_admin' || scopeRole === 'agent';
}

export function getDashboardNavigation(input: DashboardRole | DashboardNavigationContext): DashboardNavigationItem[] {
  const context = normalizeContext(input);
  const role = context.role;
  const clientContext = isClientContext(context);
  const agencyControlAllowed = hasAgencyAdminAccess(context) && !clientContext;

  const navigation = role === 'platform_admin'
    ? [dashboardNavigationItem, ...platformNavigation, ...secondarySharedNavigation]
    : [dashboardNavigationItem, ...agencyNavigation, ...secondarySharedNavigation];

  return navigation.filter((item) => {
    if (item.href === '/dashboard/agencies') {
      return role === 'platform_admin' && !clientContext;
    }

    if (item.href === '/dashboard/agency' || item.href === '/dashboard/team' || item.href === '/dashboard/tenants') {
      return agencyControlAllowed;
    }

    if (item.href === '/dashboard/settings') {
      return agencyControlAllowed;
    }

    if (item.href === '/dashboard/billing') {
      return agencyControlAllowed;
    }

    return true;
  });
}
