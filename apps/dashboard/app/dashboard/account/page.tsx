import React from 'react';
import { KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react';
import {
  AccessRoleIcon,
  WorkspaceHeader,
  WorkspacePanel,
  formatRoleLabel,
} from '../../../components/dashboard-workspace-ui';
import { requireCurrentSession } from '../../../lib/auth/current-user';

export const dynamic = 'force-dynamic';

function getInitials(fullName: string): string {
  return fullName
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default async function AccountPage() {
  const session = await requireCurrentSession();
  const { actor } = session;

  return (
    <div className="space-y-8">
      <WorkspaceHeader
        eyebrow="Your account"
        title="Account settings"
        description="This space is for the logged-in user profile, sign-in details, and personal security controls. Agency configuration stays under the admin-only Settings workspace."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <WorkspacePanel
          title="Profile details"
          description="These details belong to your user account and follow you wherever you sign in."
        >
          <div className="flex flex-col gap-6 md:flex-row xl:flex-col 2xl:flex-row 2xl:items-start">
            <div className="flex w-full shrink-0 flex-col items-center gap-4 rounded-3xl border border-border-ghost bg-surface-base p-6 text-center md:w-[280px] xl:w-full 2xl:w-[280px]">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-brand text-2xl font-bold text-white shadow-glow">
                {getInitials(actor.fullName)}
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-on-surface">{actor.fullName}</h2>
                <p className="text-sm text-on-surface-muted">{actor.email}</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border-ghost bg-surface-card px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-muted">
                <AccessRoleIcon role={actor.role} />
                {formatRoleLabel(actor.role)}
              </div>
            </div>

            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-border-ghost bg-surface-base p-5">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <UserRound className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-subtle">Full name</p>
                <p className="mt-2 text-base font-semibold text-on-surface">{actor.fullName}</p>
              </div>

              <div className="rounded-3xl border border-border-ghost bg-surface-base p-5">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Mail className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-subtle">Email address</p>
                <p className="mt-2 text-base font-semibold text-on-surface">{actor.email}</p>
              </div>

              <div className="rounded-3xl border border-border-ghost bg-surface-base p-5">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-subtle">Access level</p>
                <p className="mt-2 text-base font-semibold text-on-surface">{formatRoleLabel(actor.role)}</p>
              </div>

              <div className="rounded-3xl border border-border-ghost bg-surface-base p-5">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <KeyRound className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-subtle">Password & sign-in</p>
                <p className="mt-2 text-sm leading-6 text-on-surface-muted">
                  Personal password updates and sign-in preferences belong here, separate from agency-level integrations and WhatsApp configuration.
                </p>
              </div>
            </div>
          </div>
        </WorkspacePanel>

        <WorkspacePanel
          title="Security scope"
          description="Use this mental model to keep personal account changes separate from workspace administration."
        >
          <div className="space-y-4">
            <div className="rounded-3xl border border-border-ghost bg-surface-base p-5">
              <p className="text-sm font-semibold text-on-surface">Personal account settings</p>
              <p className="mt-2 text-sm leading-6 text-on-surface-muted">
                Profile details, password changes, and sign-in preferences should live on this page for every authenticated user.
              </p>
            </div>
            <div className="rounded-3xl border border-primary/20 bg-primary/5 p-5">
              <p className="text-sm font-semibold text-on-surface">Agency settings</p>
              <p className="mt-2 text-sm leading-6 text-on-surface-muted">
                WhatsApp sessions, integration keys, and workspace controls remain under the sidebar Settings page for admin-capable roles only.
              </p>
            </div>
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}
