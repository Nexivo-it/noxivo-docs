'use client';

import React, { useState } from 'react';
import { VisualBuilder } from '../../../../../components/workflows/visual-builder';
import { compileGraphToDag } from '../../../../../lib/workflows/graph-to-dag';
import { WorkspaceHeader } from '../../../../../components/dashboard-workspace-ui';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { dashboardApi } from '../../../../../lib/api/dashboard-api';

export function WorkflowEditClient({
  workflowId,
  initialNodes,
  initialEdges,
  workflowName
}: {
  workflowId: string;
  initialNodes: any[];
  initialEdges: any[];
  workflowName: string;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (nodes: any[], edges: any[]) => {
    setIsSaving(true);
    try {
      // 1. Compile graph to DAG
      const compiledDag = compileGraphToDag({ nodes, edges });

      // 2. Prepare payload
      const payload = {
        editorGraph: {
          nodes,
          edges,
          viewport: { x: 0, y: 0, zoom: 1 }
        },
        compiledDag
      };

      // 3. Save to API
      await dashboardApi.saveWorkflowDefinition(workflowId, payload);

      toast.success('Workflow deployed successfully');
      router.refresh();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Failed to deploy workflow');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] overflow-hidden">
      <div className="px-8 pt-8">
        <WorkspaceHeader
          eyebrow="Workflow Editor"
          title={workflowName}
          description="Design your automation tree using the visual canvas. Drag nodes from the left and connect them to build the logic."
        />
      </div>

      <div className="flex-1 min-h-0 px-8 pb-8">
        <VisualBuilder
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          onSave={handleSave}
        />
      </div>
    </div>
  );
}
