'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  Building2,
  Check,
  ChevronDown,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  UserRound,
  X,
} from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { AccessRoleIcon, formatPlanLabel, formatRoleLabel } from './dashboard-workspace-ui';
import { NoxivoLogo } from './noxivo-logo';
import { getDashboardNavigation } from '../lib/dashboard/navigation';
import { logoutFromWorkflowEngine } from '../lib/api/dashboard-auth-client';
import { dashboardApi } from '../lib/api/dashboard-api';

const COLLAPSE_KEY = 'nf_sidebar_collapsed';
const AGENCY_CONTEXT_KEY = 'nf_admin_agency_ctx';
const AGENCY_CONTEXT_COOKIE = 'nf_agency_context';
const TENANT_CONTEXT_KEY = 'nf_admin_tenant_ctx';
const TENANT_CONTEXT_COOKIE = 'nf_tenant_context';

export interface DashboardShellProps {
  user: {
    fullName: string;
    email: string;
    role: 'platform_admin' | 'agency_owner' | 'agency_admin' | 'agency_member' | 'viewer';
    scopeRole?: 'owner' | 'agency_admin' | 'client_admin' | 'agent';
    isClientContextActive?: boolean;
    memberships?: Array<{
      agencyId: string;
      role: 'platform_admin' | 'agency_owner' | 'agency_admin' | 'agency_member' | 'viewer';
      customRoleId?: string;
    }>;
  };
  agency: {
    id: string;
    name: string;
    slug: string;
    plan: 'reseller_basic' | 'reseller_pro' | 'enterprise';
  };
  allAgencies?: Array<{ id: string; name: string; slug: string; plan: 'reseller_basic' | 'reseller_pro' | 'enterprise'; }>;
  clientTenants?: Array<{ id: string; name: string; slug: string; status?: string }>;
  activeClientTenant?: { id: string; name: string; slug: string } | null;
  children: ReactNode;
}

function getInitials(fullName: string | null | undefined): string {
  if (!fullName || typeof fullName !== 'string') {
    return '??';
  }
  return fullName
    .split(' ')
    .map((part) => part?.[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function canAccessSettings(role: DashboardShellProps['user']['role']): boolean {
  return role === 'platform_admin' || role === 'agency_owner' || role === 'agency_admin';
}

export function DashboardShell({ user, agency, allAgencies, clientTenants, activeClientTenant, children }: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    title: string;
    message: string;
    severity: string;
    isRead: boolean;
    createdAt: string;
  }>>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    async function fetchNotifications() {
      try {
        const data = await dashboardApi.getNotifications();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      } catch {}
    }
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleMarkAsRead = async (id: string) => {
    await dashboardApi.markNotificationAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleMarkAllAsRead = async () => {
    await dashboardApi.markAllNotificationsAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };
  const navigationContext = useMemo(() => {
    type ScopeRole = NonNullable<DashboardShellProps['user']['scopeRole']>;
    const context: {
      role: DashboardShellProps['user']['role'];
      scopeRole?: ScopeRole;
      isClientContextActive?: boolean;
    } = { role: user.role };

    if (user.scopeRole) {
      context.scopeRole = user.scopeRole;
    }

    if (typeof user.isClientContextActive === 'boolean') {
      context.isClientContextActive = user.isClientContextActive;
    }

    return context;
  }, [user.isClientContextActive, user.role, user.scopeRole]);

  const navigation = useMemo(() => getDashboardNavigation(navigationContext), [navigationContext]);
  const activeNavigationItem = useMemo(
    () => navigation.find((item) => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))),
    [navigation, pathname]
  );
  const ActiveNavigationIcon = activeNavigationItem?.icon ?? Building2;

  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>(agency.id);
  const [selectedTenantId, setSelectedTenantId] = useState<string>(activeClientTenant?.id ?? '');
  const [agencySwitcherOpen, setAgencySwitcherOpen] = useState(false);
  const [clientSwitcherOpen, setClientSwitcherOpen] = useState(false);
  const [agencySearchQuery, setAgencySearchQuery] = useState('');
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const agencySwitcherRef = useRef<HTMLDivElement>(null);
  const clientSwitcherRef = useRef<HTMLDivElement>(null);

  const isPlatformAdmin = user.role === 'platform_admin';
  const scopeRole = user.scopeRole ?? (user.role === 'platform_admin'
    ? 'owner'
    : user.role === 'agency_admin' || user.role === 'agency_owner'
      ? 'agency_admin'
      : 'agent');
  const isLockedClientScope = scopeRole === 'client_admin' || scopeRole === 'agent';
  const canSwitchAgency = isPlatformAdmin;
  const canSwitchClient = !isLockedClientScope && (isPlatformAdmin || scopeRole === 'agency_admin');
  const agencyIdSet = useMemo(() => new Set((allAgencies ?? []).map((agencyOption) => agencyOption.id)), [allAgencies]);
  const clientTenantIdSet = useMemo(() => new Set((clientTenants ?? []).map((tenantOption) => tenantOption.id)), [clientTenants]);

  const clearAgencyContext = useCallback(() => {
    localStorage.removeItem(AGENCY_CONTEXT_KEY);
    document.cookie = `${AGENCY_CONTEXT_COOKIE}=; path=/; max-age=0; sameSite=lax`;
  }, []);

  const clearTenantContext = useCallback(() => {
    localStorage.removeItem(TENANT_CONTEXT_KEY);
    document.cookie = `${TENANT_CONTEXT_COOKIE}=; path=/; max-age=0; sameSite=lax`;
  }, []);

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    const saved = localStorage.getItem(COLLAPSE_KEY);
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    } else if (window.innerWidth < 1280) {
      setIsCollapsed(true);
    }

    if (canSwitchAgency && allAgencies?.length) {
      const savedContext = localStorage.getItem(AGENCY_CONTEXT_KEY);
      if (savedContext) {
        if (agencyIdSet.has(savedContext)) {
          setSelectedAgencyId(savedContext);
        } else {
          clearAgencyContext();
          setSelectedAgencyId(agency.id);
        }
      }
    } else {
      clearAgencyContext();
      setSelectedAgencyId(agency.id);
    }

    if (isLockedClientScope && activeClientTenant?.id) {
      setSelectedTenantId(activeClientTenant.id);
      clearTenantContext();
      return;
    }

    const savedTenantContext = localStorage.getItem(TENANT_CONTEXT_KEY);
    if (savedTenantContext) {
      if (clientTenantIdSet.has(savedTenantContext)) {
        setSelectedTenantId(savedTenantContext);
      } else {
        clearTenantContext();
        setSelectedTenantId(activeClientTenant?.id ?? '');
      }
    } else {
      setSelectedTenantId(activeClientTenant?.id ?? '');
    }
  }, [
    activeClientTenant?.id,
    agency.id,
    agencyIdSet,
    allAgencies,
    canSwitchAgency,
    clearAgencyContext,
    clearTenantContext,
    clientTenantIdSet,
    isLockedClientScope,
  ]);

  useEffect(() => {
    if (!agencyIdSet.has(selectedAgencyId)) {
      setSelectedAgencyId(agency.id);
    }
  }, [agency.id, agencyIdSet, selectedAgencyId]);

  useEffect(() => {
    if (!selectedTenantId) {
      return;
    }

    if (!clientTenantIdSet.has(selectedTenantId)) {
      setSelectedTenantId(activeClientTenant?.id ?? '');
      clearTenantContext();
    }
  }, [activeClientTenant?.id, clearTenantContext, clientTenantIdSet, selectedTenantId]);

  // Global Frontend Interceptor for X-Agency-Context + X-Tenant-Context
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as any).__nf_fetch_patched) return;

    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const agencyCtx = localStorage.getItem(AGENCY_CONTEXT_KEY);
      const tenantCtx = localStorage.getItem(TENANT_CONTEXT_KEY);

      if (agencyCtx || tenantCtx) {
        const [resource, config] = args;

        if (resource instanceof Request) {
          const newHeaders = new Headers(resource.headers);
          if (agencyCtx) {
            newHeaders.set('X-Agency-Context', agencyCtx);
          }
          if (tenantCtx) {
            newHeaders.set('X-Tenant-Context', tenantCtx);
          }
          try {
            // Need to recreate the request cautiously modifying headers
            args[0] = new Request(resource, { headers: newHeaders });
          } catch (e) {
            // Fallback for strict CORS/mode issues on Request recreation
            const newConfig = { ...config };
            const fallbackHeaders = new Headers(newConfig.headers || {});
            if (agencyCtx) {
              fallbackHeaders.set('X-Agency-Context', agencyCtx);
            }
            if (tenantCtx) {
              fallbackHeaders.set('X-Tenant-Context', tenantCtx);
            }
            newConfig.headers = fallbackHeaders;
            args[1] = newConfig;
          }
        } else {
          const newConfig = { ...config };
          const headers = new Headers(newConfig.headers || {});
          if (agencyCtx) {
            headers.set('X-Agency-Context', agencyCtx);
          }
          if (tenantCtx) {
            headers.set('X-Tenant-Context', tenantCtx);
          }
          newConfig.headers = headers;
          args[1] = newConfig;
        }
      }

      return originalFetch.apply(this, args as any);
    };
    (window as any).__nf_fetch_patched = true;
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (agencySwitcherRef.current && !agencySwitcherRef.current.contains(event.target as Node)) {
        setAgencySwitcherOpen(false);
      }
      if (clientSwitcherRef.current && !clientSwitcherRef.current.contains(event.target as Node)) {
        setClientSwitcherOpen(false);
      }
    }
    if (agencySwitcherOpen || clientSwitcherOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [agencySwitcherOpen, clientSwitcherOpen]);

  const handleSelectAgency = (id: string) => {
    if (!agencyIdSet.has(id)) return;

    setSelectedAgencyId(id);
    localStorage.setItem(AGENCY_CONTEXT_KEY, id);
    clearTenantContext();
    setSelectedTenantId('');

    // Set cookie for Server Component context awareness
    document.cookie = `${AGENCY_CONTEXT_COOKIE}=${id}; path=/; max-age=2592000; sameSite=lax`;

    setAgencySwitcherOpen(false);
    setAgencySearchQuery('');
    setClientSwitcherOpen(false);
    setClientSearchQuery('');
    router.refresh();
  };

  const handleSelectTenant = (id: string | null) => {
    if (id === null || id.length === 0) {
      setSelectedTenantId('');
      clearTenantContext();
      setClientSwitcherOpen(false);
      setClientSearchQuery('');
      router.refresh();
      return;
    }

    if (!clientTenantIdSet.has(id)) {
      return;
    }

    setSelectedTenantId(id);
    localStorage.setItem(TENANT_CONTEXT_KEY, id);
    document.cookie = `${TENANT_CONTEXT_COOKIE}=${id}; path=/; max-age=2592000; sameSite=lax`;
    setClientSwitcherOpen(false);
    setClientSearchQuery('');
    router.refresh();
  };

  const activeAgency = allAgencies?.find((a) => a.id === selectedAgencyId) ?? agency;
  const filteredAgencies = (allAgencies ?? []).filter((a) =>
    a.name.toLowerCase().includes(agencySearchQuery.toLowerCase()) ||
    a.slug.toLowerCase().includes(agencySearchQuery.toLowerCase())
  );
  const filteredClients = (clientTenants ?? []).filter((client) =>
    client.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
    client.slug.toLowerCase().includes(clientSearchQuery.toLowerCase())
  );
  const activeClient = (clientTenants ?? []).find((tenant) => tenant.id === selectedTenantId)
    ?? activeClientTenant
    ?? null;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((current) => {
      const next = !current;
      localStorage.setItem(COLLAPSE_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) {
        setDrawerOpen(false);
      }
    };

    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  async function handleLogout(): Promise<void> {
    setIsLoggingOut(true);

    try {
      await logoutFromWorkflowEngine();
    } catch (error) {
      console.error('Dashboard logout failed, proceeding with local cleanup', error);
    } finally {
      router.push('/auth/login');
      router.refresh();
      setIsLoggingOut(false);
    }
  }

  const renderSidebarContent = (collapsed: boolean, isMobile = false) => (
    <div className="flex h-full flex-col py-6">
      <div className={`mb-8 flex shrink-0 items-center px-8 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        <div className="flex min-w-0 items-center gap-4 overflow-hidden">
          <div className="flex h-12 shrink-0 items-center justify-center rounded-2xl border border-border-ghost bg-surface-card px-4 shadow-ambient backdrop-blur-md">
            <NoxivoLogo alt="Noxivo" height={28} priority variant="auto" width={108} />
          </div>
          <div
            className={`min-w-0 overflow-hidden transition-all duration-700 ${collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}
          >
            <p className="text-[17px] font-bold tracking-tight text-on-surface leading-none">Noxivo</p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.3em] text-on-surface-subtle/70">Core Sync</p>
          </div>
        </div>

        {!isMobile && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden rounded-2xl border border-border-ghost bg-surface-card p-2.5 text-on-surface-muted transition-all hover:border-primary/40 hover:text-primary hover:shadow-ambient active:scale-90 lg:inline-flex"
            title={collapsed ? 'Expand Nexus' : 'Contract Nexus'}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}

        {isMobile && (
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="inline-flex rounded-2xl border border-border-ghost bg-surface-card p-3.5 text-on-surface-muted transition-all hover:border-primary/40 hover:text-primary active:scale-90"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col pb-4">
        <nav className="space-y-2 px-5 mt-2">
          {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`group relative flex items-center gap-5 rounded-[1.25rem] px-4 py-4 text-[13px] transition-all duration-500 overflow-hidden ${collapsed ? 'justify-center' : ''} ${isActive ? 'bg-primary/10 text-primary font-semibold shadow-ambient ring-1 ring-primary/20' : 'text-on-surface-subtle font-medium hover:bg-surface-card hover:text-on-surface'}`}
            >
              <div className={`absolute inset-0 bg-gradient-brand opacity-0 transition-opacity duration-500 ${isActive ? 'opacity-[0.05]' : 'group-hover:opacity-[0.02]'}`} />
              {isActive ? <span className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-primary shadow-primary-glow animate-pulse" /> : null}
              <Icon className={`h-5 w-5 shrink-0 transition-all duration-500 ${isActive ? 'scale-110 shadow-primary-glow text-primary drop-shadow-[0_0_8px_rgba(var(--primary-rgb),0.4)]' : 'group-hover:scale-110 group-hover:text-primary'}`} />
              <span className={`whitespace-nowrap transition-all duration-700 leading-none ${collapsed ? 'absolute w-0 overflow-hidden opacity-0' : 'relative opacity-100'}`}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>

      {!collapsed ? (
        <div className="mx-4 my-6 shrink-0 space-y-3">
          {canSwitchAgency && allAgencies ? (
            <div className="relative group/sidebar-card" ref={agencySwitcherRef}>
              <button
                onClick={() => setAgencySwitcherOpen((open) => !open)}
                className="w-full relative overflow-hidden rounded-3xl bg-surface-card p-5 border border-border-ghost hover:border-primary/20 hover:shadow-ambient transition-all duration-700 text-left"
              >
                <div className="absolute -right-4 -top-4 opacity-[0.03] pointer-events-none group-hover/sidebar-card:text-primary group-hover/sidebar-card:opacity-[0.05] transition-all duration-700">
                  <Building2 size={120} strokeWidth={1} />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="relative mb-0 flex flex-col min-w-0">
                    <p className="text-[10px] font-bold text-on-surface-subtle/70 mb-1.5 uppercase tracking-widest leading-none">Agency Context</p>
                    <p className="text-[15px] font-bold text-on-surface leading-tight tracking-tight truncate" title={activeAgency.name}>{activeAgency.name}</p>
                  </div>
                  <ChevronDown size={16} className={`mt-1 flex-shrink-0 text-on-surface-muted transition-transform ${agencySwitcherOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {agencySwitcherOpen ? (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-surface-card border border-border-ghost rounded-2xl shadow-ambient z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="p-3 border-b border-border-ghost bg-surface-base/50">
                    <input
                      type="text"
                      placeholder="Search agencies..."
                      autoFocus
                      className="w-full px-3 py-2 text-[13px] font-medium bg-surface-base border border-border-ghost rounded-xl outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all text-on-surface placeholder:text-on-surface-subtle"
                      value={agencySearchQuery}
                      onChange={(e) => setAgencySearchQuery(e.target.value)}
                    />
                  </div>
                  <ul className="max-h-64 overflow-y-auto p-1.5 space-y-0.5 scrollbar-hide">
                    {filteredAgencies.length === 0 ? (
                      <li className="px-3 py-4 text-[13px] font-medium text-center text-on-surface-muted">No agencies found</li>
                    ) : filteredAgencies.map((agencyOption) => (
                      <li key={agencyOption.id}>
                        <button
                          onClick={() => handleSelectAgency(agencyOption.id)}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-[13px] font-medium rounded-xl hover:bg-surface-base transition-colors group text-left"
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <span className="w-8 h-8 flex-shrink-0 rounded-lg bg-primary/10 text-[11px] font-black tracking-wider text-primary flex items-center justify-center">
                              {agencyOption.name.slice(0, 2).toUpperCase()}
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className="truncate text-on-surface leading-tight">{agencyOption.name}</span>
                              <span className="text-[10px] uppercase tracking-widest text-on-surface-subtle truncate mt-0.5">{agencyOption.slug}</span>
                            </div>
                          </div>
                          {agencyOption.id === activeAgency.id ? <Check size={14} className="text-primary flex-shrink-0 ml-3" /> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {canSwitchClient ? (
            <div className="relative group/sidebar-card" ref={clientSwitcherRef}>
              <button
                onClick={() => setClientSwitcherOpen((open) => !open)}
                className="w-full relative overflow-hidden rounded-3xl bg-surface-card p-5 border border-border-ghost hover:border-primary/20 hover:shadow-ambient transition-all duration-700 text-left"
              >
                <div className="absolute -right-4 -top-4 opacity-[0.03] pointer-events-none group-hover/sidebar-card:text-primary group-hover/sidebar-card:opacity-[0.05] transition-all duration-700">
                  <Building2 size={120} strokeWidth={1} />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="relative mb-0 flex flex-col min-w-0">
                    <p className="text-[10px] font-bold text-on-surface-subtle/70 mb-1.5 uppercase tracking-widest leading-none">Client Context</p>
                    <p className="text-[15px] font-bold text-on-surface leading-tight tracking-tight truncate" title={activeClient?.name ?? 'All Clients'}>
                      {activeClient?.name ?? 'All Clients'}
                    </p>
                  </div>
                  <ChevronDown size={16} className={`mt-1 flex-shrink-0 text-on-surface-muted transition-transform ${clientSwitcherOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {clientSwitcherOpen ? (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-surface-card border border-border-ghost rounded-2xl shadow-ambient z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="p-3 border-b border-border-ghost bg-surface-base/50">
                    <input
                      type="text"
                      placeholder="Search clients..."
                      autoFocus
                      className="w-full px-3 py-2 text-[13px] font-medium bg-surface-base border border-border-ghost rounded-xl outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all text-on-surface placeholder:text-on-surface-subtle"
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                    />
                  </div>
                  <ul className="max-h-64 overflow-y-auto p-1.5 space-y-0.5 scrollbar-hide">
                    <li>
                      <button
                        onClick={() => handleSelectTenant('')}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-[13px] font-medium rounded-xl hover:bg-surface-base transition-colors text-left"
                      >
                        <span className="truncate text-on-surface leading-tight">All Clients</span>
                        {selectedTenantId.length === 0 ? <Check size={14} className="text-primary flex-shrink-0 ml-3" /> : null}
                      </button>
                    </li>
                    {filteredClients.length === 0 ? (
                      <li className="px-3 py-4 text-[13px] font-medium text-center text-on-surface-muted">No clients found</li>
                    ) : filteredClients.map((client) => (
                      <li key={client.id}>
                        <button
                          onClick={() => handleSelectTenant(client.id)}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-[13px] font-medium rounded-xl hover:bg-surface-base transition-colors text-left"
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <span className="w-8 h-8 flex-shrink-0 rounded-lg bg-primary/10 text-[11px] font-black tracking-wider text-primary flex items-center justify-center">
                              {client.name.slice(0, 2).toUpperCase()}
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className="truncate text-on-surface leading-tight">{client.name}</span>
                              <span className="text-[10px] uppercase tracking-widest text-on-surface-subtle truncate mt-0.5">{client.slug}</span>
                            </div>
                          </div>
                          {client.id === selectedTenantId ? <Check size={14} className="text-primary flex-shrink-0 ml-3" /> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {!canSwitchAgency && !canSwitchClient ? (
            <div className="relative overflow-hidden rounded-3xl bg-surface-card p-5 border border-border-ghost hover:border-primary/20 hover:shadow-ambient transition-all duration-700">
              <div className="absolute -right-4 -top-4 opacity-[0.03] pointer-events-none group-hover/sidebar-card:text-primary group-hover/sidebar-card:opacity-[0.05] transition-all duration-700">
                <Building2 size={120} strokeWidth={1} />
              </div>
              <div className="flex items-center gap-3 mb-5">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-brand flex items-center justify-center text-[10px] font-black text-white shadow-primary-glow">
                  {getInitials(activeClient?.name ?? agency.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold text-on-surface-subtle/70 mb-1 uppercase tracking-widest leading-none">
                    {isLockedClientScope ? 'Active Client' : 'Active Agency'}
                  </p>
                  <p className="text-[14px] font-bold text-on-surface leading-tight tracking-tight truncate" title={activeClient?.name ?? agency.name}>
                    {activeClient?.name ?? agency.name}
                  </p>
                </div>
              </div>
              <div className="relative flex flex-col gap-2">
                <span className="inline-flex w-fit max-w-full items-center rounded-xl border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[10px] font-bold text-primary truncate">
                  {formatPlanLabel(agency.plan)}
                </span>
                <span className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-xl border border-border-ghost bg-surface-base px-2.5 py-1.5 text-[10px] font-bold text-on-surface-muted truncate">
                  <span className="shrink-0">
                    <AccessRoleIcon role={user.role} />
                  </span>
                  <span className="truncate uppercase">{formatRoleLabel(user.role)}</span>
                </span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      </div>

      <div className="mt-auto px-3 shrink-0">
        <div className="relative border-t border-border-ghost pt-3">
          {collapsed ? (
            <div className="flex flex-col items-center gap-5">
              <button
                type="button"
                onClick={() => setProfileOpen((current) => !current)}
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-brand text-[10px] font-black text-white shadow-primary-glow lumina-glow transition-transform hover:scale-110 active:scale-90"
              >
                {getInitials(user.fullName)}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="inline-flex rounded-2xl border border-border-ghost bg-surface-card p-3 text-on-surface-subtle transition-all hover:border-status-error/40 hover:bg-status-error/5 hover:text-status-error disabled:opacity-30 active:scale-90"
              >
                <LogOut className={`h-4.5 w-4.5 ${isLoggingOut ? 'animate-pulse' : ''}`} />
              </button>
            </div>
          ) : (
            <div className="flex w-full items-center gap-3 rounded-[2rem] border border-transparent p-3 transition-all hover:border-border-ghost hover:bg-surface-card group/account relative overflow-hidden">
              <button
                type="button"
                onClick={() => setProfileOpen((current) => !current)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-brand text-[10px] font-black text-white shadow-primary-glow lumina-glow transition-all group-hover/account:scale-105 active:scale-90"
                title="Profile Settings"
              >
                {getInitials(user.fullName)}
              </button>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-on-surface tracking-tight leading-none mb-1.5" title={user.fullName || ''}>{user.fullName}</p>
                <p className="truncate text-[10px] font-bold uppercase tracking-widest text-on-surface-subtle opacity-60 leading-none" title={user.email || ''}>{user.email}</p>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                title="Log Out"
                className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-border-ghost bg-surface-base p-3 text-on-surface-subtle transition-all hover:border-status-error/40 hover:bg-status-error/5 hover:text-status-error disabled:opacity-30 active:scale-90"
              >
                <LogOut className={`h-4.5 w-4.5 ${isLoggingOut ? 'animate-pulse' : ''}`} />
              </button>
            </div>
          )}

          {profileOpen ? (
            <div className={`absolute z-50 w-full ${collapsed ? 'bottom-14 left-1/2 -translate-x-1/2 max-w-[12rem]' : 'bottom-full left-0 mb-3'}`}>
              <div className="glass-panel overflow-hidden rounded-3xl">
                <div className="border-b border-border-ghost bg-surface-card px-4 py-4">
                  <p className="text-sm font-semibold text-on-surface">{user.fullName}</p>
                  <p className="mt-1 text-xs text-on-surface-muted">{user.email}</p>
                </div>
                <div className="p-2">
                  <Link
                    href="/dashboard/account"
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-on-surface-muted transition hover:bg-surface-card hover:text-on-surface"
                  >
                    <UserRound className="h-4 w-4" />
                    <span>Account settings</span>
                  </Link>

                  {canAccessSettings(user.role) ? (
                    <Link
                      href="/dashboard/settings"
                      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-on-surface-muted transition hover:bg-surface-card hover:text-on-surface"
                    >
                      <Settings className="h-4 w-4" />
                      <span>Agency settings</span>
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-surface-base text-on-surface font-display">

      <div className="relative z-10 flex h-screen overflow-hidden">
        <div
          className={`fixed inset-0 z-40 bg-surface-base/40 backdrop-blur-md transition-opacity duration-500 lg:hidden ${drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />

        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[320px] transform sidebar-glass transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) lg:hidden ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          {renderSidebarContent(false, true)}
        </aside>

        <aside
          className={`hidden shrink-0 flex-col sidebar-glass transition-all duration-300 ease-out lg:flex ${isCollapsed ? 'w-20' : 'w-72'}`}
        >
          {renderSidebarContent(isCollapsed)}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="glass-panel sticky top-0 z-30 flex h-20 items-center justify-between border-b border-border-ghost bg-surface-base/80 px-6 backdrop-blur-xl lg:px-10">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="inline-flex rounded-xl border border-border-ghost bg-surface-card p-2.5 text-on-surface-subtle transition-all hover:border-primary/20 hover:text-on-surface lg:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/8 text-primary">
                  <ActiveNavigationIcon className="h-[18px] w-[18px]" />
                </div>
                <div className="hidden sm:block">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-on-surface-subtle leading-none mb-1">
                    {isLockedClientScope && activeClient ? activeClient.name : activeAgency.name}
                  </p>
                  <p className="text-[20px] font-semibold tracking-tight text-on-surface leading-none">{activeNavigationItem?.name ?? 'Dashboard'}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="relative inline-flex rounded-xl border border-border-ghost bg-surface-card p-2.5 text-on-surface-subtle transition-all hover:border-primary/20 hover:text-on-surface"
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-error text-[10px] font-bold text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                {notificationsOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-border-ghost bg-surface-card shadow-float">
                    <div className="flex items-center justify-between border-b border-border-ghost p-4">
                      <h3 className="font-bold text-on-surface">Notifications</h3>
                      {unreadCount > 0 && (
                        <button onClick={handleMarkAllAsRead} className="text-xs font-medium text-primary hover:underline">
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="p-4 text-center text-sm text-on-surface-subtle">No notifications</p>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => !n.isRead && handleMarkAsRead(n.id)}
                            className={`cursor-pointer border-b border-border-ghost p-4 transition hover:bg-surface-base ${
                              !n.isRead ? 'bg-primary/5' : ''
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                                n.severity === 'error' || n.severity === 'critical' ? 'bg-error' :
                                n.severity === 'warning' ? 'bg-warning' : 'bg-primary'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-on-surface truncate">{n.title}</p>
                                <p className="text-xs text-on-surface-subtle line-clamp-2">{n.message}</p>
                                <p className="mt-1 text-[10px] text-on-surface-subtle">
                                  {new Date(n.createdAt).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide">
            <div className="min-h-full">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
