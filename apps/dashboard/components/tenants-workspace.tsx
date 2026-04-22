'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Globe, Loader2, Plus, Users } from 'lucide-react';
import type { AgencySummary } from '@noxivo/contracts';
import { dashboardApi } from '@/lib/api/dashboard-api';
import {
  Badge,
  EmptyWorkspaceState,
  WorkspaceHeader,
  WorkspaceMetricCard,
  WorkspacePanel,
  StatGroup,
  StatItem,
  formatBillingModeLabel,
  formatDateLabel,
  formatPlanLabel,
} from './dashboard-workspace-ui';

interface TenantListItem {
  id: string;
  agencyId: string;
  slug: string;
  name: string;
  region: string;
  status: string;
  billingMode: string;
  customDomain: string | null;
  createdAt: string;
}

interface TenantsWorkspaceProps {
  actorRole: 'platform_admin' | 'agency_owner' | 'agency_admin' | 'agency_member' | 'viewer';
  agency: AgencySummary;
  tenants: TenantListItem[];
}

const regionOptions = ['us-east-1', 'eu-west-1', 'me-central-1'] as const;
const billingModeOptions = ['agency_pays', 'tenant_pays'] as const;

function canManageTenants(role: TenantsWorkspaceProps['actorRole']): boolean {
  return role === 'platform_admin' || role === 'agency_owner' || role === 'agency_admin';
}

function getTenantStatusBadge(status: string): { label: string; tone: 'success' | 'warning' | 'danger' | 'brand' | 'neutral' } {
  switch (status) {
    case 'active':
      return { label: 'Active', tone: 'success' };
    case 'trial':
      return { label: 'Trial', tone: 'brand' };
    case 'suspended':
      return { label: 'Suspended', tone: 'warning' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'danger' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

export function TenantsWorkspace({ actorRole, agency, tenants }: TenantsWorkspaceProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [region, setRegion] = useState<(typeof regionOptions)[number]>('us-east-1');
  const [billingMode, setBillingMode] = useState<(typeof billingModeOptions)[number]>('agency_pays');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const manager = canManageTenants(actorRole);
  const activeTenants = useMemo(() => tenants.filter((tenant) => tenant.status === 'active').length, [tenants]);

  async function handleCreateTenant(event: { preventDefault(): void }): Promise<void> {
    event.preventDefault();

    if (!manager) {
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      await dashboardApi.createAgencyTenant(agency.id, {
        name,
        slug,
        region,
        billingMode,
      });

      setName('');
      setSlug('');
      setRegion('us-east-1');
      setBillingMode('agency_pays');
      setFeedback({ tone: 'success', message: 'Tenant workspace created.' });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create tenant workspace',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <WorkspaceHeader
        eyebrow="Tenants"
        title={`${agency.name} client workspaces`}
        description="Separate tenant and client management from internal agency team operations. Review live tenant coverage, keep billing ownership visible, and spin up additional client workspaces when the agency is ready."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <WorkspaceMetricCard
          icon={Building2}
          label="Total tenants"
          value={tenants.length.toString()}
          detail="Client workspaces provisioned under this agency account."
          delayIndex={1}
        />
        <WorkspaceMetricCard
          icon={Users}
          label="Active tenants"
          value={activeTenants.toString()}
          detail="Tenant workspaces currently marked active and ready for operators."
          delayIndex={2}
        />
        <WorkspaceMetricCard
          icon={Globe}
          label="Agency plan"
          value={formatPlanLabel(agency.plan)}
          detail="Tenant growth stays anchored to the current agency subscription." 
          delayIndex={3}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <WorkspacePanel
          title="Tenant directory"
          description="Every tenant remains scoped to the authenticated agency context, with billing responsibility and deployment region kept explicit."
          delayIndex={4}
        >
          {tenants.length === 0 ? (
            <EmptyWorkspaceState
              icon={Building2}
              title="No tenants provisioned"
              description="Create the first tenant workspace to separate client operations from internal agency administration."
            />
          ) : (
            <div className="grid gap-6 xl:grid-cols-2">
              {tenants.map((tenant) => {
                const badge = getTenantStatusBadge(tenant.status);

                return (
                  <article key={tenant.id} className="rounded-[2rem] border border-border-ghost bg-surface-base/50 p-8 transition-all hover:bg-surface-base hover:border-primary/20">
                    <div className="flex items-start justify-between gap-6">
                      <div className="space-y-4">
                        <Badge label={badge.label} tone={badge.tone} />
                        <div>
                          <h3 className="text-lg font-bold text-on-surface tracking-tight">{tenant.name}</h3>
                          <p className="text-sm font-medium text-on-surface-subtle">/{tenant.slug}</p>
                        </div>
                      </div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Building2 className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="mt-8 border-t border-border-ghost/50 pt-6">
                      <StatGroup>
                        <StatItem label="Region" value={tenant.region} />
                        <StatItem label="Billing" value={formatBillingModeLabel(tenant.billingMode)} />
                        <StatItem label="Domain" value={tenant.customDomain ?? 'Inherited'} />
                        <StatItem label="Created" value={formatDateLabel(tenant.createdAt)} />
                      </StatGroup>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </WorkspacePanel>

        <WorkspacePanel
          title="Create tenant"
          description={manager ? 'Provision a new client workspace without mixing it into team-member administration.' : 'Your role can review tenant workspaces, but only agency owners and admins can provision new ones.'}
          delayIndex={5}
        >
          <form className="space-y-6" onSubmit={handleCreateTenant}>
            {feedback ? (
              <div className={`rounded-2xl border px-5 py-4 text-sm font-medium animate-in fade-in slide-in-from-top-2 ${feedback.tone === 'success' ? 'border-success/20 bg-success/5 text-success' : 'border-error/20 bg-error/5 text-error'}`}>
                {feedback.message}
              </div>
            ) : null}

            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-subtle ml-1">Tenant name</label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Acme Client Workspace"
                disabled={!manager || isSubmitting}
                className="w-full rounded-2xl border border-border-ghost bg-surface-base px-5 py-4 text-sm text-on-surface placeholder:text-on-surface-subtle transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none disabled:opacity-40"
                required
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-subtle ml-1">Tenant slug</label>
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-on-surface-subtle font-medium text-sm">/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  placeholder="acme-client"
                  disabled={!manager || isSubmitting}
                  className="w-full rounded-2xl border border-border-ghost bg-surface-base pl-8 pr-5 py-4 text-sm text-on-surface placeholder:text-on-surface-subtle transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none disabled:opacity-40"
                  required
                />
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-subtle ml-1">Region</label>
                <div className="relative">
                  <select
                    value={region}
                    onChange={(event) => setRegion(event.target.value as (typeof regionOptions)[number])}
                    disabled={!manager || isSubmitting}
                    className="w-full appearance-none rounded-2xl border border-border-ghost bg-surface-base px-5 py-4 text-sm text-on-surface outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/5 disabled:opacity-40"
                  >
                    {regionOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-subtle ml-1">Billing mode</label>
                <div className="relative">
                  <select
                    value={billingMode}
                    onChange={(event) => setBillingMode(event.target.value as (typeof billingModeOptions)[number])}
                    disabled={!manager || isSubmitting}
                    className="w-full appearance-none rounded-2xl border border-border-ghost bg-surface-base px-5 py-4 text-sm text-on-surface outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/5 disabled:opacity-40"
                  >
                    {billingModeOptions.map((option) => (
                      <option key={option} value={option}>
                        {formatBillingModeLabel(option)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-border-ghost bg-surface-base/50 p-6">
              <div className="flex gap-4">
                <div className="h-5 w-5 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                   <Globe className="size-3" />
                </div>
                <p className="text-sm font-light leading-7 text-on-surface-muted">
                  New tenant workspaces inherit the agency branding baseline unless explicit tenant overrides are added later.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={!manager || isSubmitting}
              className="relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-[1.5rem] bg-primary px-8 py-5 text-sm font-bold text-white shadow-primary-glow transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100 disabled:shadow-none"
            >
              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
              <span>{isSubmitting ? 'Creating tenant…' : 'Create tenant workspace'}</span>
            </button>
          </form>
        </WorkspacePanel>
      </div>
    </div>
  );
}
