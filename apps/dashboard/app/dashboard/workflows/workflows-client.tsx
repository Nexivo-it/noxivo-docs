'use client';

import { useState } from 'react';
import { 
  Plus, 
  Search, 
  Workflow, 
  Play, 
  Pause, 
  Settings2,
  Filter,
  Zap,
  Activity,
  History,
  Trash2
} from 'lucide-react';
import { 
  WorkspaceHeader, 
  WorkspaceMetricCard, 
  WorkspacePanel,
  Badge,
  StatusToggle,
} from '../../../components/dashboard-workspace-ui';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export interface WorkflowItem {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused';
  lastRun: string;
  executions: number;
  type: string;
}

interface WorkflowsClientProps {
  initialWorkflows: WorkflowItem[];
  canManage: boolean;
}

export function WorkflowsClient({ initialWorkflows, canManage }: WorkflowsClientProps) {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>(initialWorkflows);
  const [loading, setLoading] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Edit logic
  const [editWorkflow, setEditWorkflow] = useState<WorkflowItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const router = useRouter();

  const handleToggle = async (workflowId: string) => {
    if (!canManage) return;
    
    setLoading(workflowId);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/toggle`, {
        method: 'POST',
      });
      
      if (res.ok) {
        const data = await res.json();
        setWorkflows(prev => prev.map(w => 
          w.id === workflowId 
            ? { ...w, status: data.isActive ? 'active' : 'paused' } 
            : w
        ));
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to toggle workflow:', error);
    } finally {
      setLoading(null);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editWorkflow) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/workflows/${editWorkflow.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: editName, description: editDesc })
      });
      if (res.ok) {
        setWorkflows(prev => prev.map(w => w.id === editWorkflow.id ? { ...w, name: editName, description: editDesc } : w));
        setEditWorkflow(null);
        router.refresh();
      } else {
        alert('Failed to update workflow');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editWorkflow) return;
    const confirmed = window.confirm(`Are you sure you want to delete the workflow "${editWorkflow.name}"?`);
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/workflows/${editWorkflow.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setWorkflows(prev => prev.filter(w => w.id !== editWorkflow.id));
        setEditWorkflow(null);
        router.refresh();
      } else {
        alert('Failed to delete workflow');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeCount = workflows.filter(w => w.status === 'active').length;
  const totalExecutions = workflows.reduce((acc, w) => acc + w.executions, 0);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-10">
      <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <WorkspaceHeader
          eyebrow="Automation Engine"
          title="Workflows"
          description="Design and manage intelligent logic flows that automate customer engagement and internal operations on WhatsApp."
          actions={canManage && (
            <button 
              onClick={() => setShowCreateForm(curr => !curr)}
              className="flex items-center gap-3 rounded-[1.5rem] bg-primary px-8 py-4 text-sm font-bold text-white shadow-primary-glow transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98]">
              <Plus className="size-5" />
              <span>{showCreateForm ? 'Close' : 'New Workflow'}</span>
            </button>
          )}
        />

        {showCreateForm && (
          <WorkspacePanel title="Create Workflow" description="Initialize a new blank automation flow.">
            <form className="grid gap-4 lg:grid-cols-2" onSubmit={async (e) => {
              e.preventDefault();
              setIsSubmitting(true);
              try {
                const res = await fetch('/api/workflows', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ name, description })
                });
                if (res.ok) {
                  setName('');
                  setDescription('');
                  setShowCreateForm(false);
                  const data = await res.json();
                  const newWorkflow: WorkflowItem = {
                    id: data.id,
                    name: data.name,
                    description: description || 'Workflow for whatsapp',
                    status: 'paused',
                    lastRun: 'Never',
                    executions: 0,
                    type: 'Standard'
                  };
                  setWorkflows(prev => [...prev, newWorkflow]);
                  router.refresh();
                } else {
                  const data = await res.json().catch(() => null);
                  alert(data?.error || 'Failed to create workflow');
                }
              } catch (err) {
                console.error(err);
                alert('An error occurred');
              } finally {
                setIsSubmitting(false);
              }
            }}>
              <div className="space-y-2 lg:col-span-2">
                <label className="text-sm font-medium text-on-surface">Workflow Name</label>
                <input value={name} onChange={e => setName(e.target.value)} required className="w-full rounded-2xl border border-border-input bg-surface-base px-4 py-3 text-sm text-on-surface outline-none transition focus:border-focus" placeholder="e.g. Lead Qualification" />
              </div>
              <div className="space-y-2 lg:col-span-2">
                <label className="text-sm font-medium text-on-surface">Description (optional)</label>
                <input value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded-2xl border border-border-input bg-surface-base px-4 py-3 text-sm text-on-surface outline-none transition focus:border-focus" placeholder="Qualifies leads from WhatsApp..." />
              </div>
              <div className="lg:col-span-2 flex justify-end">
                <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-brand px-4 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-90 disabled:opacity-60">
                  <span>{isSubmitting ? 'Creating...' : 'Create Workflow'}</span>
                </button>
              </div>
            </form>
          </WorkspacePanel>
        )}

        {editWorkflow && (
          <WorkspacePanel title="Edit Workflow" description="Modify the details of your workflow.">
            <form className="grid gap-4 lg:grid-cols-2" onSubmit={handleUpdate}>
              <div className="space-y-2 lg:col-span-2">
                <label className="text-sm font-medium text-on-surface">Workflow Name</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} required className="w-full rounded-2xl border border-border-input bg-surface-base px-4 py-3 text-sm text-on-surface outline-none transition focus:border-focus" />
              </div>
              <div className="space-y-2 lg:col-span-2">
                <label className="text-sm font-medium text-on-surface">Description (optional)</label>
                <input value={editDesc} onChange={e => setEditDesc(e.target.value)} className="w-full rounded-2xl border border-border-input bg-surface-base px-4 py-3 text-sm text-on-surface outline-none transition focus:border-focus" />
              </div>
              <div className="lg:col-span-2 flex items-center justify-between mt-4">
                <button 
                  type="button" 
                  onClick={handleDelete}
                  disabled={isSubmitting} 
                  className="inline-flex items-center gap-2 rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm font-semibold text-error transition hover:bg-error/10 disabled:opacity-60"
                >
                  <Trash2 className="size-4" />
                  <span>Delete Workflow</span>
                </button>
                <div className="flex items-center gap-3">
                  <button 
                    type="button" 
                    onClick={() => setEditWorkflow(null)}
                    disabled={isSubmitting}
                    className="rounded-2xl px-4 py-3 text-sm font-semibold text-on-surface-subtle transition hover:text-on-surface"
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-brand px-4 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-90 disabled:opacity-60">
                    <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                </div>
              </div>
            </form>
          </WorkspacePanel>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <WorkspaceMetricCard
            icon={Zap}
            label="Total Power"
            value={totalExecutions.toLocaleString()}
            detail="Automated actions this month"
            delayIndex={0}
          />
          <WorkspaceMetricCard
            icon={Activity}
            label="Active Flows"
            value={String(activeCount)}
            detail={`${workflows.length} total definitions`}
            delayIndex={1}
          />
          <WorkspaceMetricCard
            icon={History}
            label="Engine Uptime"
            value="100%"
            detail="Real-time availability"
            delayIndex={2}
          />
        </div>

        <WorkspacePanel
          title="Active Pipelines"
          description="Monitor performance metrics and control execution states for your deployed automation logic."
          actions={
            <div className="flex items-center gap-4">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-on-surface-subtle transition-colors group-focus-within:text-primary" />
                <input 
                  type="text" 
                  placeholder="Search flows..."
                  className="h-11 w-64 pl-11 pr-4 rounded-2xl border border-border-ghost bg-surface-base text-sm text-on-surface placeholder:text-on-surface-subtle focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
              <button className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border-ghost bg-surface-base text-on-surface-subtle hover:text-primary hover:bg-surface-card transition-colors">
                <Filter className="size-4" />
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            {workflows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                <div className="h-20 w-20 rounded-3xl bg-surface-base border border-border-ghost flex items-center justify-center text-on-surface-subtle">
                  <Workflow className="size-10" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-on-surface">No workflows found</h3>
                  <p className="text-sm text-on-surface-muted max-w-xs mx-auto">
                    You haven't created any automation flows yet. {canManage && 'Click the button above to get started.'}
                  </p>
                </div>
              </div>
            ) : workflows.map((workflow) => (
              <div 
                key={workflow.id} 
                className="group relative rounded-[2rem] border border-border-ghost bg-surface-base/40 p-10 transition-all hover:border-primary/20 hover:bg-surface-base shadow-sm hover:shadow-primary-glow/5"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                  <div className="flex items-start gap-8">
                    <div className={`mt-1 flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.5rem] border transition-all ${workflow.status === 'active' ? 'bg-primary/5 border-primary/20 text-primary shadow-primary-glow/10' : 'bg-surface-base border-border-ghost text-on-surface-subtle'}`}>
                      <Workflow className="size-8" />
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-4 flex-wrap">
                        <Link href={`/dashboard/workflows/${workflow.id}`} className="text-xl font-bold text-on-surface tracking-tight hover:text-primary transition-colors">
                          {workflow.name}
                        </Link>
                        <Badge 
                          label={workflow.status === 'active' ? 'Active' : 'Paused'} 
                          tone={workflow.status === 'active' ? 'success' : 'warning'} 
                        />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-subtle/50 px-2.5 py-1 rounded-full border border-border-ghost/50">
                          {workflow.type}
                        </span>
                      </div>
                      <p className="max-w-2xl text-sm font-light leading-7 text-on-surface-muted">
                        {workflow.description}
                      </p>
                      <div className="flex items-center gap-8 pt-2">
                        <div className="flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-subtle">
                          <Activity className="size-3.5 text-primary/50" />
                          <span>{workflow.executions.toLocaleString()} executions</span>
                        </div>
                        <div className="flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-subtle">
                          <Play className="size-3.5 text-primary/50" />
                          <span>Last run {workflow.lastRun}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                    <div className="flex items-center justify-end gap-5 lg:self-start">
                    <StatusToggle 
                      status={workflow.status} 
                      onToggle={() => handleToggle(workflow.id)} 
                      isLoading={loading === workflow.id}
                      disabled={!canManage}
                    />
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/workflows/${workflow.id}/builder`}
                          className="flex h-[46px] px-4 items-center justify-center gap-2 rounded-2xl border border-border-ghost bg-surface-base text-violet-400 font-medium transition-all hover:border-violet-500/30 hover:text-violet-500 hover:bg-violet-500/5 hover:scale-[1.02] active:scale-[0.98]"
                          title="Open Visual Builder"
                        >
                          <Zap className="size-5" />
                          <span className="text-xs">Builder</span>
                        </Link>
                        <button 
                          onClick={() => {
                            setEditWorkflow(workflow);
                            setEditName(workflow.name);
                            setEditDesc(workflow.description);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="flex h-[46px] w-[46px] items-center justify-center rounded-2xl border border-border-ghost bg-surface-base text-on-surface-subtle transition-all hover:border-primary/30 hover:text-primary hover:bg-primary/5 hover:scale-[1.05] active:scale-[0.95]"
                        >
                          <Settings2 className="size-6" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}

