'use client';

import { 
  CreditCard, 
  Check, 
  TrendingUp, 
  ArrowUpRight, 
  Clock, 
  Download,
  AlertCircle,
  Plus,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { 
  WorkspaceHeader, 
  WorkspacePanel, 
  Badge,
} from '../../../components/dashboard-workspace-ui';
import type { BillingPageData } from '../../../lib/dashboard/queries';

interface BillingClientProps {
  data: BillingPageData;
}

export function BillingClient({ data }: BillingClientProps) {
  const messagePercentage = Math.min(100, Math.round((data.usage.messaging.current / data.usage.messaging.limit) * 100));
  const workflowPercentage = Math.min(100, Math.round((data.usage.workflows.current / data.usage.workflows.limit) * 100));

  const nextBillingDate = new Date(data.plan.nextBillingDate).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div className="space-y-12 pb-20">
      <WorkspaceHeader
        eyebrow="Financial Operations"
        title="Billing & Subscription"
        description="Manage your platform footprint, review resource utilization, and update payment protocols for your agency workspace."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-10">
          <WorkspacePanel
            title="Premium Subscription"
            description="Your current active plan and billing cycle overview."
            delayIndex={1}
          >
            <div className="rounded-[2.5rem] overflow-hidden border border-border-ghost bg-surface-base/40">
              <div className="bg-primary/5 border-b border-border-ghost p-10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                  <div className="space-y-4">
                    <Badge label={data.plan.status === 'active' ? 'Active' : 'Suspended'} tone={data.plan.status === 'active' ? 'success' : 'danger'} />
                    <div>
                      <h2 className="text-4xl font-bold text-on-surface tracking-tighter flex items-center gap-3">
                        {data.plan.name}
                        <Zap className="size-6 text-primary animate-pulse" />
                      </h2>
                      <p className="text-sm font-medium text-on-surface-subtle h-6 flex items-center gap-2 mt-1">
                        <Clock className="size-4" />
                        Next billing cycle: {nextBillingDate}
                      </p>
                    </div>
                  </div>
                  <div className="text-left md:text-right space-y-2">
                    <div className="text-5xl font-bold text-on-surface tracking-tighter">
                      ${data.plan.price}<span className="text-xl text-on-surface-subtle font-light">/mo</span>
                    </div>
                    <button className="text-sm font-bold text-primary px-6 py-2 rounded-full border border-primary/20 hover:bg-primary/5 transition-all">
                      Upgrade plan
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-16">
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <div className="space-y-1">
                       <h3 className="text-xs font-bold text-on-surface-subtle uppercase tracking-[0.2em]">Messaging footprint</h3>
                       <p className="text-2xl font-bold text-on-surface tracking-tight">
                         {data.usage.messaging.current.toLocaleString()} <span className="text-sm font-medium text-on-surface-subtle tracking-normal">/ {(data.usage.messaging.limit / 1000).toFixed(0)}k</span>
                       </p>
                    </div>
                  </div>
                  <div className="h-2.5 bg-surface-base rounded-full overflow-hidden border border-border-ghost">
                    <div 
                      className="h-full bg-primary rounded-full shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)] transition-all duration-1000" 
                      style={{ width: `${messagePercentage}%` }}
                    />
                  </div>
                  <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${messagePercentage > 90 ? 'text-danger bg-danger/5' : 'text-success bg-success/5'} w-fit px-3 py-2 rounded-lg border ${messagePercentage > 90 ? 'border-danger/10' : 'border-success/10'}`}>
                    {messagePercentage > 90 ? <AlertCircle className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                    <span>{messagePercentage > 90 ? 'Approaching Limit' : 'Utilization Optimal'}</span>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <div className="space-y-1">
                       <h3 className="text-xs font-bold text-on-surface-subtle uppercase tracking-[0.2em]">Workflow execution</h3>
                       <p className="text-2xl font-bold text-on-surface tracking-tight">
                         {data.usage.workflows.current.toLocaleString()} <span className="text-sm font-medium text-on-surface-subtle tracking-normal">/ {(data.usage.workflows.limit / 1000).toFixed(1)}k</span>
                       </p>
                    </div>
                  </div>
                  <div className="h-2.5 bg-surface-base rounded-full overflow-hidden border border-border-ghost">
                    <div 
                      className="h-full bg-cyan-500 rounded-full shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all duration-1000" 
                      style={{ width: `${workflowPercentage}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-subtle bg-surface-base w-fit px-3 py-2 rounded-lg border border-border-ghost">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Usage Resets Monthly</span>
                  </div>
                </div>
              </div>
            </div>
          </WorkspacePanel>

          <WorkspacePanel
            title="Registry of Payment"
            description="Manage your authenticated payment instruments and billing defaults."
            delayIndex={2}
          >
            <div className="grid gap-6">
               <div className="flex items-center justify-between p-8 bg-surface-base/50 border border-primary/20 rounded-[2rem] group transition-all hover:bg-surface-base">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-surface-base border border-border-ghost rounded-2xl flex items-center justify-center text-on-surface-subtle shadow-inner">
                    <CreditCard className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-on-surface tracking-tight">Visa Platinum •••• 4242</p>
                    <p className="text-xs font-bold text-on-surface-subtle uppercase tracking-widest">Expires 12/28</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                   <Badge label="Primary" tone="brand" />
                   <button className="text-xs font-bold text-on-surface-subtle hover:text-on-surface px-4 py-2">Edit</button>
                </div>
              </div>

               <button className="flex items-center justify-center gap-3 p-6 border-2 border-dashed border-border-ghost rounded-[2rem] text-on-surface-subtle font-bold text-sm hover:border-primary/30 hover:text-primary transition-all">
                <Plus className="size-5" />
                Add secure payment method
              </button>
            </div>
          </WorkspacePanel>
        </div>

        <div className="space-y-10">
          <WorkspacePanel
            title="Plan inclusions"
            description="Premium features available on the Nexus Scale blueprint."
            delayIndex={3}
          >
            <ul className="space-y-5">
              {[
                'Unlimited WhatsApp Numbers',
                'Advanced Flow Builder',
                'Priority Processing',
                'White-label Agency Portal',
                'Extended Data Retention'
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-4 text-sm font-medium text-on-surface-muted">
                  <div className="w-6 h-6 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0 border border-success/20">
                    <Check className="w-3.5 h-3.5 text-success" />
                  </div>
                  {feature}
                </li>
              ))}
            </ul>
            <div className="mt-10 pt-8 border-t border-border-ghost">
              <div className="flex items-start gap-4 p-6 bg-primary/5 border border-primary/10 rounded-2xl text-on-surface-muted text-sm leading-7">
                <ShieldCheck className="size-6 text-primary shrink-0" />
                <p>Enterprise requirements? Contact our solutions desk for <button className="font-extrabold text-primary underline underline-offset-4 decoration-primary/30">Custom SLAs</button>.</p>
              </div>
            </div>
          </WorkspacePanel>

          <WorkspacePanel
            title="Operational tasks"
            description="Quick access to financial exports and audit logs."
            delayIndex={4}
          >
            <div className="grid gap-4">
              <button className="w-full flex items-center justify-between p-6 bg-surface-base/50 hover:bg-surface-base border border-border-ghost rounded-2xl transition-all group">
                <span className="text-sm font-bold text-on-surface">Download Last Invoice</span>
                <Download className="w-5 h-5 text-on-surface-subtle group-hover:text-primary group-hover:translate-y-1 transition-all" />
              </button>
              <button className="w-full flex items-center justify-between p-6 bg-surface-base/50 hover:bg-surface-base border border-border-ghost rounded-2xl transition-all group">
                <span className="text-sm font-bold text-on-surface">Historical Audit</span>
                <ArrowUpRight className="w-5 h-5 text-on-surface-subtle group-hover:text-primary group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
              </button>
            </div>
          </WorkspacePanel>
        </div>
      </div>
    </div>
  );
}
