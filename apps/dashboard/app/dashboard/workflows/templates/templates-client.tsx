'use client';

import { useState } from 'react';
import { 
  Sparkles, 
  Database, 
  MessageCircle, 
  Users, 
  ArrowRight,
  Check,
  Loader2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  WorkspaceHeader, 
  WorkspacePanel,
  Badge,
} from '../../../../components/dashboard-workspace-ui';
import { getAllTemplates, type WorkflowTemplate } from '../../../../lib/workflows/templates-library';
import { dashboardApi } from '../../../../lib/api/dashboard-api';

const categoryLabels: Record<WorkflowTemplate['category'], string> = {
  crm: 'CRM',
  automation: 'Automation',
  support: 'Support'
};

const categoryColors: Record<WorkflowTemplate['category'], string> = {
  crm: 'bg-secondary/10 text-secondary border-secondary/20',
  automation: 'bg-primary/10 text-primary border-primary/20',
  support: 'bg-warning/10 text-warning border-warning/20'
};

interface TemplatesClientProps {
  canManage: boolean;
}

export function TemplatesClient({ canManage }: TemplatesClientProps) {
  const router = useRouter();
  const [cloningTemplate, setCloningTemplate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const templates = getAllTemplates();

  const handleClone = async (templateId: string) => {
    if (!canManage) return;
    
    setCloningTemplate(templateId);
    setError(null);
    
    try {
      const data = await dashboardApi.cloneWorkflow(templateId);

      if (data.success) {
        router.push(`/dashboard/workflows/${data.workflowId}/edit`);
      } else {
        setError(data.error || 'Failed to clone template');
      }
    } catch (err) {
      setError('An error occurred while cloning the template');
    } finally {
      setCloningTemplate(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-10">
      <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <WorkspaceHeader
          eyebrow="Automation Templates"
          title="Template Gallery"
          description="Jump-start your automation with pre-built workflows. Clone a template and customize it to fit your business needs."
          actions={
            <Link 
              href="/dashboard/workflows"
              className="flex items-center gap-2 rounded-[1.5rem] border border-border-ghost bg-surface-base px-6 py-3 text-sm font-bold text-on-surface transition hover:bg-surface-card hover:border-primary/20"
            >
              <ArrowRight className="size-4 rotate-180" />
              <span>Back to Workflows</span>
            </Link>
          }
        />

        {error && (
          <div className="rounded-2xl border border-error/20 bg-error/5 p-4 text-sm text-error">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template, index) => (
            <div 
              key={template.id}
              className="group relative rounded-[2rem] border border-border-ghost bg-surface-base/40 p-6 transition-all hover:border-primary/30 hover:bg-surface-card hover:shadow-card"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${categoryColors[template.category]}`}>
                    {template.category === 'crm' && <Database className="size-3" />}
                    {template.category === 'automation' && <Sparkles className="size-3" />}
                    {template.category === 'support' && <Users className="size-3" />}
                    <span>{categoryLabels[template.category]}</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-on-surface">{template.name}</h3>
                  <p className="mt-2 text-sm text-on-surface-muted leading-relaxed">
                    {template.description}
                  </p>
                </div>

                {template.plugins.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {template.plugins.map((plugin) => (
                      <Badge 
                        key={plugin}
                        label={plugin.replace('_', ' ')}
                        tone="neutral"
                      />
                    ))}
                  </div>
                )}

                <div className="pt-4">
                  {canManage ? (
                    <button
                      onClick={() => handleClone(template.id)}
                      disabled={cloningTemplate === template.id}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-brand px-4 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-90 disabled:opacity-60"
                    >
                      {cloningTemplate === template.id ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          <span>Cloning...</span>
                        </>
                      ) : (
                        <>
                          <Check className="size-4" />
                          <span>Use Template</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="text-center text-sm text-on-surface-subtle">
                      You don&apos;t have permission to create workflows
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <WorkspacePanel
          title="How Templates Work"
          description="Learn how to customize and deploy workflow templates."
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="size-6" />
              </div>
              <h4 className="font-bold text-on-surface">1. Choose a Template</h4>
              <p className="text-sm text-on-surface-muted">
                Browse our gallery of pre-built automation templates designed for common business use cases.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
                <ArrowRight className="size-6" />
              </div>
              <h4 className="font-bold text-on-surface">2. Clone & Customize</h4>
              <p className="text-sm text-on-surface-muted">
                One-click cloning copies the template to your workspace. Edit nodes, modify conditions, and connect your integrations.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-warning/10 text-warning">
                <MessageCircle className="size-6" />
              </div>
              <h4 className="font-bold text-on-surface">3. Activate</h4>
              <p className="text-sm text-on-surface-muted">
                Enable the workflow and it will start processing WhatsApp messages automatically.
              </p>
            </div>
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}
