'use client';

import React from 'react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Building2, Globe, Loader2, Plus, Search, Users } from 'lucide-react';
import type { AgencySummary } from '@noxivo/contracts';
import {
  Badge,
  EmptyWorkspaceState,
  WorkspaceHeader,
  WorkspaceMetricCard,
  WorkspacePanel,
  badgeForAgencyStatus,
  formatDateLabel,
  formatPlanLabel,
} from '../../../components/dashboard-workspace-ui';

interface AgenciesClientPageProps {
  agencies: AgencySummary[];
}

export function AgenciesClientPage({ agencies }: AgenciesClientPageProps) {
  const [search, setSearch] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [plan, setPlan] = useState<'reseller_basic' | 'reseller_pro' | 'enterprise'>('reseller_basic');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerFullName, setOwnerFullName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const filteredAgencies = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return agencies;
    }

    return agencies.filter((agency) => (
      agency.name.toLowerCase().includes(normalizedSearch)
      || agency.slug.toLowerCase().includes(normalizedSearch)
      || (agency.supportEmail?.toLowerCase().includes(normalizedSearch) ?? false)
      || (agency.customDomain?.toLowerCase().includes(normalizedSearch) ?? false)
    ));
  }, [agencies, search]);

  const activeAgencies = agencies.filter((agency) => agency.status === 'active').length;
  const totalTenants = agencies.reduce((count, agency) => count + agency.tenantCount, 0);
  const totalTeamSeats = agencies.reduce((count, agency) => count + agency.teamCount, 0);

  async function handleCreateAgency(event: { preventDefault(): void }): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/agencies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          plan,
          ownerEmail: ownerEmail || undefined,
          ownerFullName: ownerFullName || undefined,
        }),
      });

      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Unable to create agency');
      }

      setFeedback({ tone: 'success', message: 'Agency created successfully. Refresh to see the newest directory entry.' });
      setName('');
      setSlug('');
      setPlan('reseller_basic');
      setOwnerEmail('');
      setOwnerFullName('');
      setShowCreateForm(false);
      window.location.reload();
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create agency',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-10">
      <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <WorkspaceHeader
        eyebrow="Platform"
        title="Agency administration"
        description="Platform admins get a dedicated agency directory here. Agency and team surfaces are split into their own workspaces so this page stays focused on agency-level administration only."
        actions={
          <button
            type="button"
            onClick={() => setShowCreateForm((current) => !current)}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-brand px-4 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            <span>{showCreateForm ? 'Close create agency' : 'Create Agency'}</span>
          </button>
        }
      />

      {showCreateForm ? (
        <WorkspacePanel
          title="Create agency"
          description="Provision a new agency workspace and optionally queue the first owner invitation without mixing it into the team-management surface."
        >
          <form className="grid gap-4 lg:grid-cols-2" onSubmit={handleCreateAgency}>
            {feedback ? (
              <div className={`lg:col-span-2 rounded-2xl border px-4 py-3 text-sm ${feedback.tone === 'success' ? 'border-success/20 bg-success/10 text-success' : 'border-error/20 bg-error/10 text-error'}`}>
                {feedback.message}
              </div>
            ) : null}
            <div className="space-y-2">
              <label className="text-sm font-medium text-on-surface">Agency name</label>
              <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-2xl border border-border-input bg-surface-base px-4 py-3 text-sm text-on-surface outline-none transition focus:border-focus" placeholder="Acme Agency" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-on-surface">Agency slug</label>
              <input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} className="w-full rounded-2xl border border-border-input bg-surface-base px-4 py-3 text-sm text-on-surface outline-none transition focus:border-focus" placeholder="acme-agency" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-on-surface">Plan</label>
              <select value={plan} onChange={(event) => setPlan(event.target.value as 'reseller_basic' | 'reseller_pro' | 'enterprise')} className="w-full rounded-2xl border border-border-input bg-surface-base px-4 py-3 text-sm text-on-surface outline-none transition focus:border-focus">
                <option value="reseller_basic">Reseller Basic</option>
                <option value="reseller_pro">Reseller Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-on-surface">First owner full name</label>
              <input value={ownerFullName} onChange={(event) => setOwnerFullName(event.target.value)} className="w-full rounded-2xl border border-border-input bg-surface-base px-4 py-3 text-sm text-on-surface outline-none transition focus:border-focus" placeholder="Taylor Rivers" />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <label className="text-sm font-medium text-on-surface">First owner email</label>
              <input value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} type="email" className="w-full rounded-2xl border border-border-input bg-surface-base px-4 py-3 text-sm text-on-surface outline-none transition focus:border-focus" placeholder="owner@agency.com" />
            </div>
            <div className="lg:col-span-2 flex justify-end">
              <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-brand px-4 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-90 disabled:opacity-60">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span>{isSubmitting ? 'Creating agency…' : 'Create agency'}</span>
              </button>
            </div>
          </form>
        </WorkspacePanel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <WorkspaceMetricCard
          icon={Building2}
          label="Agencies"
          value={agencies.length.toString()}
          detail="Total agency accounts visible to the authenticated platform admin."
        />
        <WorkspaceMetricCard
          icon={Globe}
          label="Tenant workspaces"
          value={totalTenants.toString()}
          detail="Client tenant environments distributed across all agencies."
        />
        <WorkspaceMetricCard
          icon={Users}
          label="Team seats"
          value={totalTeamSeats.toString()}
          detail="Agency users provisioned across the current platform footprint."
        />
      </div>

      <WorkspacePanel
        title="Agency directory"
        description="Review each agency without mixing tenant management or internal team controls into the platform-level list."
        actions={
          <div className="inline-flex items-center gap-2 rounded-2xl border border-border-ghost bg-surface-card px-4 py-3 text-sm text-on-surface-muted">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-success" />
            <span>{activeAgencies} active</span>
          </div>
        }
      >
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-subtle" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by agency, slug, email, or domain"
              className="w-full rounded-2xl border border-border-input bg-surface-base py-3 pl-11 pr-4 text-sm text-on-surface outline-none transition focus:border-focus"
            />
          </div>
          <div className="rounded-2xl border border-border-ghost bg-surface-base px-4 py-3 text-sm text-on-surface-muted">
            Showing {filteredAgencies.length} of {agencies.length} agencies
          </div>
        </div>

        {filteredAgencies.length === 0 ? (
          <EmptyWorkspaceState
            icon={Building2}
            title="No agencies match this filter"
            description="Adjust the directory search to find an agency by name, slug, contact email, or white-label domain."
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredAgencies.map((agency) => {
              const status = badgeForAgencyStatus(agency.status);

              return (
                <article key={agency.id} className="rounded-3xl border border-border-ghost bg-surface-base p-5 transition hover:bg-surface-card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <Badge label={status.label} tone={status.tone} />
                      <div>
                        <h3 className="text-lg font-semibold text-on-surface">{agency.name}</h3>
                        <p className="text-sm text-on-surface-muted">/{agency.slug}</p>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                      <Building2 className="h-5 w-5" />
                    </div>
                  </div>

                  <dl className="mt-5 grid gap-3 text-sm text-on-surface-muted sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-subtle">Plan</dt>
                      <dd className="mt-1 font-medium text-on-surface">{formatPlanLabel(agency.plan)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-subtle">Created</dt>
                      <dd className="mt-1">{formatDateLabel(agency.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-subtle">Support email</dt>
                      <dd className="mt-1">{agency.supportEmail ?? 'Not configured'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-subtle">Domain</dt>
                      <dd className="mt-1">{agency.customDomain ?? 'Shared Noxivo domain'}</dd>
                    </div>
                  </dl>

                  <div className="mt-5 grid gap-3 rounded-3xl border border-border-ghost bg-surface-card p-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-subtle">Team members</p>
                      <p className="mt-1 text-2xl font-semibold text-on-surface">{agency.teamCount}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-subtle">Tenant workspaces</p>
                      <p className="mt-1 text-2xl font-semibold text-on-surface">{agency.tenantCount}</p>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-end">
                    <Link
                      href={`/dashboard/agencies/${agency.id}`}
                      className="inline-flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-primary/15"
                    >
                      <span>View & manage</span>
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </WorkspacePanel>
      </div>
    </div>
  );
}
