'use client';

import React from 'react';
import { 
  Zap, 
  Activity, 
  Clock, 
  ArrowLeft, 
  Play, 
  Pause, 
  Settings, 
  History,
  TrendingUp,
  AlertCircle,
  Database,
  Cpu
} from 'lucide-react';
import VisualBuilder from '../../../../components/workflows/visual-builder';
import Link from 'next/link';
import { 
  WorkspaceHeader, 
  WorkspacePanel, 
  Badge,
  StatGroup,
  StatItem 
} from '../../../../components/dashboard-workspace-ui';
import { useParams } from 'next/navigation';

export default function WorkflowDetailPage() {
  const { workflowId } = useParams();
  
  return (
    <div className="space-y-12 pb-20">
      <div className="flex items-center gap-4 mb-2">
        <Link 
          href="/dashboard/workflows" 
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-ghost bg-surface-base text-on-surface-subtle transition-all hover:border-primary/30 hover:text-primary hover:bg-primary/5"
        >
          <ArrowLeft size={18} />
        </Link>
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-on-surface-subtle">Management Console</span>
      </div>

      <WorkspaceHeader
        eyebrow={`Workflow ID: ${workflowId}`}
        title="Revenue Recovery Protocol"
        description="Automated orchestration for handling failed payment events via intelligent WhatsApp retry loops and CRM synchronization."
        actions={
          <div className="flex items-center gap-4">
            <Badge label="Active" tone="success" />
            <div className="h-4 w-px bg-border-ghost" />
            <button className="flex h-12 px-6 items-center justify-center gap-3 rounded-2xl bg-gradient-brand text-white font-bold text-sm shadow-primary-glow hover:scale-[1.02] active:scale-[0.98] transition-all">
              <Zap className="size-4 fill-white" />
              Test Execution
            </button>
          </div>
        }
      />

      <StatGroup>
        <StatItem 
          label="Execution Success" 
          value="98.2%" 
          icon={Activity}
          trend={{ value: "+2.4%", positive: true }} 
        />
        <StatItem 
          label="Avg. Latency" 
          value="1.2s" 
          icon={Clock}
          trend={{ value: "-120ms", positive: true }} 
        />
        <StatItem 
          label="Data Processed" 
          value="45.2 GB" 
          icon={Database}
        />
      </StatGroup>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-10">
          <WorkspacePanel
            title="Flux Graph Editor"
            description="Visual orchestration engine powered by Noxivo DAG compiler."
            delayIndex={1}
            actions={
              <button className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary bg-primary/5 px-4 py-2 rounded-lg border border-primary/20">
                <Settings size={14} />
                Configure Core
              </button>
            }
          >
            <div className="relative rounded-[2.5rem] border border-border-ghost bg-surface-base/30 p-1 lg:p-1 overflow-hidden h-[600px] group">
              <VisualBuilder workflowId={workflowId as string} />
            </div>
          </WorkspacePanel>

          <WorkspacePanel
            title="Historical Executions"
            description="Deep audit trail of recent workflow invocations and state transitions."
            delayIndex={2}
          >
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between p-6 bg-surface-base/40 border border-border-ghost rounded-2xl group hover:border-primary/20 transition-all">
                  <div className="flex items-center gap-5">
                    <div className="size-10 rounded-xl bg-success/10 flex items-center justify-center text-success border border-success/10">
                      <Play size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-on-surface">Execution #8274{i}</p>
                      <p className="text-xs text-on-surface-subtle font-medium">Completed in 1.4s • {4+i} mins ago</p>
                    </div>
                  </div>
                  <button className="text-xs font-bold text-on-surface-subtle hover:text-primary transition-colors">View logs</button>
                </div>
              ))}
              <button className="w-full py-4 text-xs font-black uppercase tracking-widest text-on-surface-subtle hover:text-on-surface transition-colors">
                View entire history →
              </button>
            </div>
          </WorkspacePanel>
        </div>

        <div className="space-y-10">
          <WorkspacePanel
            title="Infrastructure"
            description="System health and resource allocation for this protocol."
            delayIndex={3}
          >
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-on-surface-subtle">
                  <span>Engine Load</span>
                  <span className="text-primary">24%</span>
                </div>
                <div className="h-2 bg-surface-base rounded-full overflow-hidden border border-border-ghost">
                  <div className="h-full bg-primary w-[24%] rounded-full shadow-primary-glow" />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-on-surface-subtle">
                  <span>Memory Isolation</span>
                  <span className="text-cyan-500">128MB</span>
                </div>
                <div className="h-2 bg-surface-base rounded-full overflow-hidden border border-border-ghost">
                  <div className="h-full bg-cyan-500 w-[60%] rounded-full shadow-primary-glow" />
                </div>
              </div>

              <div className="pt-4 space-y-6">
                <div className="flex items-start gap-4 p-5 bg-primary/5 rounded-2xl border border-primary/10">
                  <Zap size={20} className="text-primary shrink-0" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-on-surface">Edge Runtime Enabled</p>
                    <p className="text-[11px] leading-relaxed text-on-surface-muted">This workflow runs on global points of presence for minimum latency.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4 p-5 bg-warning/5 rounded-2xl border border-warning/10">
                  <AlertCircle size={20} className="text-warning shrink-0" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-on-surface">Idempotency Guard</p>
                    <p className="text-[11px] leading-relaxed text-on-surface-muted">Retry logic is limited to 3 attempts within a 5-minute sliding window.</p>
                  </div>
                </div>
              </div>
            </div>
          </WorkspacePanel>

          <WorkspacePanel
            title="Configurations"
            delayIndex={4}
          >
             <div className="grid gap-3">
                <button className="flex items-center justify-between p-5 bg-surface-base/50 border border-border-ghost rounded-xl text-sm font-bold text-on-surface hover:bg-surface-base transition-all group">
                  Webhook Endpoints
                  <Settings size={14} className="text-on-surface-subtle group-hover:rotate-45 transition-transform" />
                </button>
                <button className="flex items-center justify-between p-5 bg-surface-base/50 border border-border-ghost rounded-xl text-sm font-bold text-on-surface hover:bg-surface-base transition-all group">
                  Environment Context
                  <History size={14} className="text-on-surface-subtle group-hover:text-primary transition-colors" />
                </button>
             </div>
          </WorkspacePanel>
        </div>
      </div>
    </div>
  );
}
