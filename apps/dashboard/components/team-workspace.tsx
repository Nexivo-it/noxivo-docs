'use client';

import React from 'react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, Send, Trash2, Users } from 'lucide-react';
import type { AgencyInvitationRecord, AgencyTeamRole, TeamMemberRecord } from '@noxivo/contracts';
import {
  Badge,
  EmptyWorkspaceState,
  WorkspaceHeader,
  WorkspaceMetricCard,
  WorkspacePanel,
  StatGroup,
  StatItem,
  badgeForInvitationStatus,
  badgeForMemberStatus,
  formatDateLabel,
  formatDateTimeLabel,
  formatRoleLabel,
} from './dashboard-workspace-ui';

interface TeamWorkspaceProps {
  agencyId: string;
  agencyName: string;
  agencyPlan: 'reseller_basic' | 'reseller_pro' | 'enterprise';
  actorRole: 'platform_admin' | 'agency_owner' | 'agency_admin' | 'agency_member' | 'viewer';
  members: TeamMemberRecord[];
  invitations: AgencyInvitationRecord[];
  tenantOptions: Array<{ id: string; name: string }>;
}

type InviteRole = Exclude<AgencyTeamRole, 'agency_owner'>;

const inviteableRoles: InviteRole[] = ['agency_admin', 'agency_member', 'viewer'];

function canManageTeam(role: TeamWorkspaceProps['actorRole']): boolean {
  return role === 'platform_admin' || role === 'agency_owner' || role === 'agency_admin';
}

async function readErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  const payload = await response.json().catch(() => null);

  if (payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string') {
    return (payload as { error: string }).error;
  }

  return fallbackMessage;
}

export function TeamWorkspace({
  agencyId,
  agencyName,
  agencyPlan,
  actorRole,
  members,
  invitations,
  tenantOptions,
}: TeamWorkspaceProps) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteRole>('agency_member');
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
  const [invitationActionId, setInvitationActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const manager = canManageTeam(actorRole);
  const pendingInvitations = useMemo(
    () => invitations.filter((invitation) => invitation.status === 'pending'),
    [invitations]
  );

  const accessNote = useMemo(() => {
    if (inviteRole === 'agency_admin') {
      return 'Agency admins automatically receive full tenant coverage.';
    }

    if (selectedTenantIds.length === 0) {
      return 'Select one or more tenants to scope this workspace member.';
    }

    return `${selectedTenantIds.length} tenant${selectedTenantIds.length === 1 ? '' : 's'} selected for this invite.`;
  }, [inviteRole, selectedTenantIds.length]);

  function toggleTenant(tenantId: string): void {
    setSelectedTenantIds((current) => (
      current.includes(tenantId)
        ? current.filter((value) => value !== tenantId)
        : [...current, tenantId]
    ));
  }

  async function handleInviteSubmit(event: { preventDefault(): void }): Promise<void> {
    event.preventDefault();

    if (!manager) {
      return;
    }

    setIsSubmittingInvite(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/agencies/${agencyId}/invitations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          fullName: inviteFullName || undefined,
          role: inviteRole,
          tenantIds: inviteRole === 'agency_admin' ? [] : selectedTenantIds,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Unable to send team invitation'));
      }

      setInviteEmail('');
      setInviteFullName('');
      setInviteRole('agency_member');
      setSelectedTenantIds([]);
      setFeedback({ tone: 'success', message: 'Invitation queued and ready for delivery.' });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to send team invitation',
      });
    } finally {
      setIsSubmittingInvite(false);
    }
  }

  async function handleRevokeInvitation(invitationId: string): Promise<void> {
    if (!manager) {
      return;
    }

    setInvitationActionId(invitationId);
    setFeedback(null);

    try {
      const response = await fetch(`/api/agencies/${agencyId}/invitations/${invitationId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Unable to revoke invitation'));
      }

      setFeedback({ tone: 'success', message: 'Invitation revoked.' });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to revoke invitation',
      });
    } finally {
      setInvitationActionId(null);
    }
  }

  return (
    <div className="space-y-8">
      <WorkspaceHeader
        eyebrow="Agency Team"
        title={`${agencyName} workspace access`}
        description="Keep agency member management separate from agency administration. Invite operators, review active access, and track pending seats from one team-focused workspace."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <WorkspaceMetricCard
          icon={Users}
          label="Active members"
          value={members.length.toString()}
          detail="Authenticated agency users with access to this workspace."
          delayIndex={1}
        />
        <WorkspaceMetricCard
          icon={Send}
          label="Pending invites"
          value={pendingInvitations.length.toString()}
          detail="Outstanding invitations waiting for teammates to accept."
          delayIndex={2}
        />
        <WorkspaceMetricCard
          icon={Mail}
          label="Tenant scopes"
          value={tenantOptions.length.toString()}
          detail="Assignable tenant workspaces available to agency members."
          delayIndex={3}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <WorkspacePanel
          title="Current team"
          description="Agency owners and admins can review who is active in the workspace and what tenant scope each teammate currently holds."
          delayIndex={4}
        >
          {members.length === 0 ? (
            <EmptyWorkspaceState
              icon={Users}
              title="No team members yet"
              description="Once teammates accept their invitations, they will appear here with their assigned access scope."
            />
          ) : (
            <div className="overflow-hidden rounded-[2rem] border border-border-ghost bg-surface-base/40">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border-ghost text-left">
                  <thead className="bg-surface-base/80 backdrop-blur-sm">
                    <tr className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-subtle/70">
                      <th className="px-8 py-5">Member identity</th>
                      <th className="px-8 py-5">Assigned Role</th>
                      <th className="px-8 py-5">Tenant scope</th>
                      <th className="px-8 py-5 text-center">Security Status</th>
                      <th className="px-8 py-5 text-right">Joined date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-ghost/50 text-sm">
                    {members.map((member) => {
                      const badge = badgeForMemberStatus(member.status);

                      return (
                        <tr key={member.id} className="group transition-all hover:bg-surface-base">
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-4">
                               <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary text-xs font-bold border border-primary/10">
                                {member.fullName.split(' ').map(n => n[0]).join('')}
                              </div>
                              <div className="space-y-1">
                                <p className="font-bold text-on-surface tracking-tight">{member.fullName}</p>
                                <p className="text-xs font-medium text-on-surface-subtle">{member.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            <span className="font-medium text-on-surface">{formatRoleLabel(member.role)}</span>
                          </td>
                          <td className="px-8 py-6">
                            <div className="max-w-[15rem] truncate text-xs font-medium text-on-surface-muted">
                              {member.tenantAccessSummary}
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            <div className="flex justify-center">
                              <Badge label={badge.label} tone={badge.tone} />
                            </div>
                          </td>
                          <td className="px-8 py-6 text-right font-medium text-on-surface-muted">
                            {formatDateLabel(member.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </WorkspacePanel>

        <WorkspacePanel
          title="Invite member"
          description={manager ? 'Invite a teammate into the agency workspace with the correct role and tenant scope.' : 'Your role can review membership, but only agency owners and admins can invite new teammates.'}
          delayIndex={5}
        >
          <form className="space-y-6" onSubmit={handleInviteSubmit}>
            {feedback ? (
              <div className={`rounded-2xl border px-5 py-4 text-sm font-medium animate-in fade-in slide-in-from-top-2 ${feedback.tone === 'success' ? 'border-success/20 bg-success/5 text-success' : 'border-error/20 bg-error/5 text-error'}`}>
                {feedback.message}
              </div>
            ) : null}

            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-subtle ml-1">Work email</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="operator@agency.com"
                disabled={!manager || isSubmittingInvite}
                className="w-full rounded-2xl border border-border-ghost bg-surface-base px-5 py-4 text-sm text-on-surface placeholder:text-on-surface-subtle transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none disabled:opacity-40"
                required
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-subtle ml-1">Full name</label>
              <input
                type="text"
                value={inviteFullName}
                onChange={(event) => setInviteFullName(event.target.value)}
                placeholder="Ari Morgan"
                disabled={!manager || isSubmittingInvite}
                className="w-full rounded-2xl border border-border-ghost bg-surface-base px-5 py-4 text-sm text-on-surface placeholder:text-on-surface-subtle transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none disabled:opacity-40"
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-subtle ml-1">Acess Role</label>
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as InviteRole)}
                disabled={!manager || isSubmittingInvite}
                className="w-full rounded-2xl border border-border-ghost bg-surface-base px-5 py-4 text-sm text-on-surface outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/5 disabled:opacity-40"
              >
                {inviteableRoles.map((role) => (
                  <option key={role} value={role}>
                    {formatRoleLabel(role)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-4 rounded-[1.5rem] border border-border-ghost bg-surface-base/50 p-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-subtle">Deployment scope</p>
                <p className="text-sm font-light leading-6 text-on-surface-muted">{accessNote}</p>
              </div>

              {inviteRole === 'agency_admin' ? null : tenantOptions.length === 0 ? (
                <div className="flex items-center gap-3 text-xs text-on-surface-subtle italic">
                   <Mail className="size-4 opacity-50" />
                   Add a tenant first to assign scoped team access.
                </div>
              ) : (
                <div className="grid gap-3 pt-2">
                  {tenantOptions.map((tenant) => {
                    const selected = selectedTenantIds.includes(tenant.id);

                    return (
                      <label
                        key={tenant.id}
                        className={`group flex items-center justify-between rounded-2xl border p-4 text-sm transition-all cursor-pointer ${selected ? 'border-primary/30 bg-primary/5 text-on-surface' : 'border-border-ghost bg-surface-base/40 text-on-surface-subtle filter grayscale hover:grayscale-0 hover:bg-surface-base'}`}
                      >
                        <span className="font-medium">{tenant.name}</span>
                        <div className={`flex h-6 w-6 items-center justify-center rounded-lg border transition-all ${selected ? 'bg-primary border-primary text-white' : 'border-border-ghost bg-surface-base'}`}>
                           <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleTenant(tenant.id)}
                            disabled={!manager || isSubmittingInvite}
                            className="hidden"
                          />
                          {selected && <Users className="size-3" />}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-[1.5rem] border border-primary/10 bg-primary/5 p-6 space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-primary/70">Plan Allocation</p>
              <p className="text-sm font-light leading-7 text-on-surface-muted">
                Seat planning follows the <span className="font-bold text-on-surface">{agencyPlan.replace('_', ' ')}</span> agency plan. Pending invitations count against your operational team footprint until they are accepted or revoked.
              </p>
            </div>

            <button
              type="submit"
              disabled={!manager || isSubmittingInvite || (inviteRole !== 'agency_admin' && tenantOptions.length > 0 && selectedTenantIds.length === 0)}
              className="relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-[1.5rem] bg-primary px-8 py-5 text-sm font-bold text-white shadow-primary-glow transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100 disabled:shadow-none"
            >
              {isSubmittingInvite ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              <span>{isSubmittingInvite ? 'Dispatching invitation…' : 'Send invitation'}</span>
            </button>
          </form>
        </WorkspacePanel>
      </div>

      <WorkspacePanel
        title="Pending invitations"
        description="Use this queue to track outstanding invites before teammates join the agency workspace."
        delayIndex={6}
      >
        {pendingInvitations.length === 0 ? (
          <EmptyWorkspaceState
            icon={Mail}
            title="No pending invitations"
            description="When you invite a new teammate, their access request will appear here until they complete signup."
          />
        ) : (
          <div className="grid gap-8 lg:grid-cols-2">
            {pendingInvitations.map((invitation) => {
              const badge = badgeForInvitationStatus(invitation.status);

              return (
                <article key={invitation.id} className="rounded-[2rem] border border-border-ghost bg-surface-base/50 p-8 transition-all hover:bg-surface-base hover:border-primary/20">
                  <div className="flex items-start justify-between gap-6">
                    <div className="space-y-4">
                      <Badge label={badge.label} tone={badge.tone} />
                      <div>
                        <h3 className="text-lg font-bold text-on-surface tracking-tight">{invitation.fullName ?? invitation.email}</h3>
                        <p className="text-sm font-medium text-on-surface-subtle">{invitation.email}</p>
                      </div>
                    </div>
                    {manager ? (
                      <button
                        type="button"
                        onClick={() => handleRevokeInvitation(invitation.id)}
                        disabled={invitationActionId === invitation.id}
                        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border-ghost bg-surface-base text-on-surface-subtle transition-all hover:border-error/20 hover:bg-error/5 hover:text-error disabled:opacity-40"
                        aria-label={`Revoke ${invitation.email} invitation`}
                      >
                        {invitationActionId === invitation.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-8 border-t border-border-ghost/50 pt-6">
                    <StatGroup>
                      <StatItem label="Acess Role" value={formatRoleLabel(invitation.role)} />
                      <StatItem label="Invited At" value={formatDateTimeLabel(invitation.invitedAt)} />
                      <StatItem label="Expiry" value={formatDateTimeLabel(invitation.expiresAt)} />
                    </StatGroup>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </WorkspacePanel>
    </div>
  );
}
