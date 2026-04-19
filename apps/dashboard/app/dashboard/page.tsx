import { 
  Zap, 
  CheckCircle, 
  Workflow, 
  CreditCard, 
  TrendingUp, 
  ArrowUpRight,
  MoreVertical,
  Activity,
  ArrowRight,
  Crown,
  Sparkles,
  BarChart3,
  Globe2,
  ZapOff
} from 'lucide-react';
import { requireCurrentSession } from '../../lib/auth/current-user';
import { queryDashboardOverview } from '../../lib/dashboard/queries';
import Link from 'next/link';
import { 
  WorkspaceHeader, 
  WorkspaceMetricCard, 
  WorkspacePanel,
  Badge,
} from '../../components/dashboard-workspace-ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await requireCurrentSession();
  const overview = await queryDashboardOverview(session);

  const stats = [
    { 
      label: 'Total Power', 
      value: overview.stats.totalUsageEvents.toLocaleString(), 
      trend: 'Automated actions this month', 
      icon: Zap, 
      active: true 
    },
    { 
      label: 'Health Score', 
      value: `${overview.stats.healthScore}%`, 
      trend: 'Workflow completion rate', 
      icon: CheckCircle, 
      active: false 
    },
    { 
      label: 'Active Workflows', 
      value: overview.stats.activeWorkflows.toString(), 
      trend: `${overview.stats.activeSessions} live sessions`, 
      icon: Workflow, 
      active: false 
    },
    { 
      label: 'Engine Uptime', 
      value: `${overview.stats.uptime}%`, 
      trend: 'Real-time availability', 
      icon: Activity, 
      active: false 
    },
  ];

  const showQuickStart = overview.stats.workflowCount === 0 && overview.stats.activeSessions > 0;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-10">
      <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <WorkspaceHeader
          eyebrow="Overview"
          title={`Welcome back, ${session.actor.fullName.split(' ')[0]}`}
          description="Monitor your conversations, automation workflows, and team performance across all connected WhatsApp accounts."
          actions={
            <div className="flex items-center gap-2.5 rounded-2xl border border-success/20 bg-success/5 px-5 py-2.5 text-success">
              <div className="size-2 rounded-full bg-success animate-pulse" />
              <span className="text-[12px] font-medium">All systems operational</span>
            </div>
          }
        />

        {showQuickStart && (
          <div className="lumina-card group relative overflow-hidden rounded-[2.5rem] border border-primary/15 bg-gradient-brand p-[1.5px] shadow-primary-glow">
            <div className="relative rounded-[calc(2.5rem-1px)] bg-surface-card p-10">
              <div className="absolute top-0 right-0 p-10 opacity-[0.03] scale-[4] text-primary pointer-events-none group-hover:scale-[4.2] transition-transform duration-700">
                <ZapOff className="size-12" />
              </div>
              <div className="flex items-start gap-6">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-primary-glow/10">
                  <Sparkles className="size-8" />
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-extrabold tracking-tight text-on-surface mb-3 glow-text-blue">
                    Quick Start Your Automation
                  </h3>
                  <p className="text-sm font-light leading-7 text-on-surface-muted mb-6">
                    You have {overview.stats.activeSessions} active WhatsApp session{overview.stats.activeSessions > 1 ? 's' : ''} but no workflows yet. Get started with pre-built templates.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <Link 
                      href="/dashboard/workflows/templates"
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-brand px-6 py-3.5 text-sm font-bold text-white shadow-glow transition hover:opacity-90"
                    >
                      <Zap className="size-4" />
                      <span>Browse Templates</span>
                      <ArrowRight className="size-4" />
                    </Link>
                    <Link 
                      href="/dashboard/workflows"
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border-ghost bg-surface-base px-6 py-3.5 text-sm font-semibold text-on-surface transition hover:bg-surface-card hover:border-primary/20"
                    >
                      <Workflow className="size-4" />
                      <span>Create Custom</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <WorkspaceMetricCard
              key={stat.label}
              icon={stat.icon}
              label={stat.label}
              value={stat.value}
              detail={stat.trend}
              delayIndex={i}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2">
            <WorkspacePanel
              title="Recent Activity"
              description="A real-time ledger of workflow executions and system events across your connected WhatsApp accounts."
              actions={
                <button className="flex items-center gap-2 group text-[12px] font-medium text-primary/80 hover:text-primary transition-colors">
                  <span>View all activity</span>
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                </button>
              }
            >
              <div className="space-y-8 py-2">
                {overview.recentActivity.length > 0 ? (
                  overview.recentActivity.map((activity) => (
                    <div key={activity.id} className="group relative flex items-start gap-6">
                      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-base border border-border-ghost transition-colors group-hover:border-primary/30 group-hover:bg-primary/5">
                        <Activity className="size-4 text-on-surface-subtle group-hover:text-primary transition-colors" />
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-on-surface tracking-tight leading-none">{activity.message}</p>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-subtle">{activity.timeLabel}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge label={activity.type} tone="brand" />
                          <Badge label={activity.status} tone={activity.status === 'success' ? 'success' : activity.status === 'failed' ? 'danger' : 'warning'} />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <Activity className="size-12 text-on-surface-subtle/20 mb-4" />
                    <p className="text-sm font-medium text-on-surface-subtle">No activity yet. Workflow events will appear here once your automations run.</p>
                  </div>
                )}
              </div>
            </WorkspacePanel>
          </div>

          <div className="space-y-10">
            <WorkspacePanel title="Active Pipelines">
              <div className="space-y-4">
                {overview.activeWorkflows.length > 0 ? (
                  overview.activeWorkflows.map((flow) => (
                    <button 
                      key={flow.id} 
                      className="flex w-full items-center justify-between p-6 rounded-[2rem] border border-border-ghost bg-surface-card hover:border-primary/40 hover:shadow-ambient group transition-all duration-500 text-left"
                    >
                      <div className="flex items-center gap-5">
                        <div className={`size-2 rounded-full ${flow.tone === 'success' ? 'bg-success' : 'bg-primary/30'} group-hover:shadow-primary-glow transition-all`} />
                        <span className="text-[13px] font-semibold text-on-surface opacity-80 group-hover:opacity-100">{flow.name}</span>
                      </div>
                      <Badge label={flow.status} tone={flow.tone as any} />
                    </button>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center space-y-3 opacity-50">
                    <Workflow className="size-8 text-on-surface-subtle" />
                    <p className="text-xs font-medium text-on-surface-subtle">No active workflows</p>
                  </div>
                )}
              </div>
            </WorkspacePanel>

            <div className="lumina-card group relative overflow-hidden rounded-[2.5rem] border border-primary/15 bg-gradient-brand p-[1.5px] shadow-primary-glow">
              <div className="relative rounded-[calc(2.5rem-1px)] bg-surface-card p-10">
                <div className="absolute top-0 right-0 p-10 opacity-[0.03] scale-[4] text-primary pointer-events-none group-hover:scale-[4.2] transition-transform duration-700">
                  <Crown className="size-12" />
                </div>
                <h3 className="text-2xl font-extrabold tracking-tight text-on-surface mb-3 glow-text-blue">
                  Noxivo Pro
                </h3>
                <p className="text-sm font-light leading-7 text-on-surface-muted mb-8">
                  Unlock multi-tenant management, white-label options, and advanced behavioral analytics.
                </p>
                <button className="flex w-full items-center justify-center gap-3 rounded-[1.5rem] bg-primary px-6 py-4 text-sm font-bold text-white shadow-primary-glow transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98]">
                  <span>Compare Plans</span>
                  <ArrowRight className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
