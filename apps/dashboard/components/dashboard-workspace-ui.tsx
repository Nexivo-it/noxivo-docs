import React from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  BadgeCheck,
  Building2,
  Building,
  Crown,
  ShieldCheck,
  UserRound,
  Users,
  Play,
  Pause,
} from 'lucide-react';
import type { AgencySummary, AgencyTeamRole, UserRole } from '@noxivo/contracts';

type BadgeTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

const badgeToneClasses: Record<BadgeTone, string> = {
  brand: 'border-primary/15 bg-primary/5 text-primary',
  success: 'border-success/15 bg-success/5 text-success',
  warning: 'border-warning/15 bg-warning/5 text-warning',
  danger: 'border-error/15 bg-error/5 text-error',
  neutral: 'border-border-ghost bg-surface-base text-on-surface-subtle',
};

const agencyStatusLabels: Record<AgencySummary['status'], { label: string; tone: BadgeTone }> = {
  active: { label: 'Active', tone: 'success' },
  trial: { label: 'Trial', tone: 'brand' },
  suspended: { label: 'Suspended', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

const memberStatusLabels: Record<'active' | 'suspended', { label: string; tone: BadgeTone }> = {
  active: { label: 'Active', tone: 'success' },
  suspended: { label: 'Suspended', tone: 'warning' },
};

const invitationStatusLabels: Record<'pending' | 'accepted' | 'expired' | 'revoked', { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pending', tone: 'brand' },
  accepted: { label: 'Accepted', tone: 'success' },
  expired: { label: 'Expired', tone: 'warning' },
  revoked: { label: 'Revoked', tone: 'danger' },
};

export function formatPlanLabel(plan: AgencySummary['plan']): string {
  switch (plan) {
    case 'reseller_basic':
      return 'Reseller Basic';
    case 'reseller_pro':
      return 'Reseller Pro';
    case 'enterprise':
      return 'Enterprise';
    default:
      return plan;
  }
}

export function formatRoleLabel(role: AgencyTeamRole | UserRole | 'platform_admin'): string {
  switch (role) {
    case 'platform_admin':
      return 'Platform Admin';
    case 'agency_owner':
      return 'Agency Owner';
    case 'agency_admin':
      return 'Agency Admin';
    case 'agency_member':
      return 'Agency Member';
    case 'viewer':
      return 'Viewer';
    default:
      return String(role).replace(/_/g, ' ');
  }
}

export function formatBillingModeLabel(value: string): string {
  return value === 'tenant_pays' ? 'Tenant Pays' : 'Agency Pays';
}

export function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatDateTimeLabel(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function badgeForAgencyStatus(status: AgencySummary['status']): { label: string; tone: BadgeTone } {
  const badge = agencyStatusLabels[status];
  if (badge) return badge;

  return {
    label: status ? String(status).charAt(0).toUpperCase() + String(status).slice(1) : 'Unknown',
    tone: 'neutral'
  };
}

export function badgeForMemberStatus(status: 'active' | 'suspended'): { label: string; tone: BadgeTone } {
  return memberStatusLabels[status];
}

export function badgeForInvitationStatus(status: 'pending' | 'accepted' | 'expired' | 'revoked'): { label: string; tone: BadgeTone } {
  return invitationStatusLabels[status];
}

export function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] leading-relaxed transition-all ${badgeToneClasses[tone]}`}>
      {label}
    </span>
  );
}

export function StatusToggle({
  status,
  onToggle,
  isLoading,
  disabled
}: {
  status: 'active' | 'paused';
  onToggle: () => void;
  isLoading: boolean;
  disabled?: boolean;
}) {
  const isActive = status === 'active';

  return (
    <div className="relative inline-flex items-center gap-1.5 rounded-2xl bg-surface-low p-1.5 border border-border-ghost transition-all duration-500 shadow-inner group/toggle">
      <button
        type="button"
        onClick={() => !isActive && !isLoading && onToggle()}
        disabled={disabled || isLoading}
        className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-500 ${
          isActive
            ? 'bg-gradient-brand text-white shadow-primary-glow scale-[1.02] z-10'
            : 'text-on-surface-subtle hover:text-on-surface hover:bg-surface-base'
        } ${isLoading && isActive ? 'cursor-wait' : ''}`}
      >
        {isLoading && isActive ? (
          <div className="size-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <Play size={14} fill={isActive ? "currentColor" : "none"} strokeWidth={2.5} />
        )}
        <span>Active</span>
      </button>

      <button
        type="button"
        onClick={() => isActive && !isLoading && onToggle()}
        disabled={disabled || isLoading}
        className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-500 ${
          !isActive
            ? 'bg-surface-card text-on-surface shadow-sm border border-border-ghost z-10'
            : 'text-on-surface-subtle hover:text-on-surface hover:bg-surface-base'
        } ${isLoading && !isActive ? 'cursor-wait' : ''}`}
      >
        {isLoading && !isActive ? (
          <div className="size-3 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        ) : (
          <Pause size={14} fill={!isActive ? "currentColor" : "none"} strokeWidth={2.5} />
        )}
        <span>Paused</span>
      </button>
    </div>
  );
}

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="lumina-header flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between pb-8">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="h-px w-6 bg-primary/40" />
          <span className="text-[12px] font-semibold text-primary/70">
            {eyebrow}
          </span>
        </div>
        <div className="space-y-3">
          <h1 className="text-4xl font-extrabold tracking-tight text-on-surface lg:text-5xl">{title}</h1>
          <p className="max-w-2xl text-sm leading-7 text-on-surface-muted lg:text-base">{description}</p>
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-4">{actions}</div> : null}
    </div>
  );
}

export function WorkspaceMetricCard({
  icon: Icon,
  label,
  value,
  detail,
  delayIndex = 0,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  delayIndex?: number;
}) {
  return (
    <div
      className="lumina-card glass-panel hover-float animate-float-in rounded-[2rem] p-8 flex flex-col justify-between"
      style={{ animationDelay: `${delayIndex * 75}ms` }}
    >
      <div className="mb-10 flex items-center justify-between gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-primary-glow">
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-[11px] font-semibold text-on-surface-subtle text-right leading-relaxed">{label}</span>
      </div>
      <div className="space-y-4">
        <div className="text-5xl lg:text-6xl font-extralight tracking-tighter text-on-surface leading-none">{value}</div>
        <p className="text-sm font-medium leading-relaxed text-on-surface-muted/80">{detail}</p>
      </div>
    </div>
  );
}

export function WorkspacePanel({
  title,
  description,
  actions,
  delayIndex = 0,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  delayIndex?: number;
  children: ReactNode;
}) {
  return (
    <section
      className="glass-panel animate-float-in fill-mode-both rounded-[2rem] p-8 lg:p-10"
      style={{ animationDelay: `${delayIndex * 75}ms` }}
    >
      <div className="mb-8 flex flex-col gap-6 border-b border-border-ghost pb-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <h2 className="text-2xl font-bold tracking-tight text-on-surface">{title}</h2>
          {description ? <p className="max-w-xl text-sm leading-7 text-on-surface-muted lg:text-base font-light">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-4">{actions}</div> : null}
      </div>
      <div className="relative">
        {children}
      </div>
    </section>
  );
}

export function EmptyWorkspaceState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-3xl border border-dashed border-border-ghost bg-surface-base px-6 py-10 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-on-surface">{title}</h3>
        <p className="max-w-md text-sm leading-6 text-on-surface-muted">{description}</p>
      </div>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function AccessRoleIcon({ role }: { role: AgencyTeamRole | UserRole | 'platform_admin' }) {
  switch (role) {
    case 'platform_admin':
      return <Crown className="h-4 w-4" />;
    case 'agency_owner':
      return <ShieldCheck className="h-4 w-4" />;
    case 'agency_admin':
      return <BadgeCheck className="h-4 w-4" />;
    case 'agency_member':
      return <Users className="h-4 w-4" />;
    case 'viewer':
      return <UserRound className="h-4 w-4" />;
    default:
      return <AlertCircle className="h-4 w-4" />;
  }
}

export function WorkspaceSpotlight({
  label,
  title,
  body,
  icon: Icon,
  delayIndex = 0,
}: {
  label: string;
  title: string;
  body: string;
  icon: LucideIcon;
  delayIndex?: number;
}) {
  return (
    <div
      className="rounded-[2.5rem] border border-primary/10 bg-gradient-brand p-[1.5px] shadow-primary-glow animate-float-in hover-float overflow-hidden"
      style={{ animationDelay: `${delayIndex * 75}ms` }}
    >
      <div className="rounded-[calc(1.5rem-1px)] bg-surface-card px-8 py-8 h-full relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] scale-[3] pointer-events-none">
          <Icon size={64} />
        </div>
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <span className="text-[12px] font-semibold text-primary">{label}</span>
        </div>
        <div className="space-y-3 pt-2">
          <h3 className="text-2xl font-bold text-on-surface">{title}</h3>
          <p className="text-sm leading-7 text-on-surface-muted font-light">{body}</p>
        </div>
      </div>
    </div>
  );
}

export function StatGroup({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {children}
    </div>
  );
}

export function StatItem({
  label,
  value,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string | number | ReactNode;
  icon?: LucideIcon;
  trend?: { value: string; positive: boolean };
}) {
  return (
    <div className="flex flex-col gap-2 p-1 group">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-on-surface-subtle group-hover:text-primary transition-colors" />}
        <span className="text-[11px] font-semibold text-on-surface-subtle">{label}</span>
      </div>
      <div className="flex items-baseline gap-3 mt-1">
        <div className="text-lg font-semibold text-on-surface tracking-tight">{value}</div>
        {trend && (
          <span className={`text-[10px] font-bold ${trend.positive ? 'text-success' : 'text-error'}`}>
            {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}

export function getAccessLabel(role: AgencyTeamRole | UserRole | 'platform_admin'): string {
  return formatRoleLabel(role);
}

export const WorkspaceIcons = {
  agency: Building2,
  team: Users,
  tenant: Building,
};
