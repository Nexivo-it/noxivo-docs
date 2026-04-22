import { requireCurrentSession } from '../../../lib/auth/current-user';
import { canManageWorkflows } from '../../../lib/auth/authorization';
import type { WorkflowsPageData } from '../../../lib/api/dashboard-aggregates';
import { workflowEngineServerFetch } from '../../../lib/api/workflow-engine-server';
import { WorkflowsClient } from './workflows-client';

export const dynamic = 'force-dynamic';

export default async function WorkflowsPage() {
  const session = await requireCurrentSession();
  const workflowsData = await workflowEngineServerFetch<WorkflowsPageData>('/api/v1/workflows');
  const canManage = canManageWorkflows(session);

  return (
    <WorkflowsClient 
      initialWorkflows={workflowsData.workflows} 
      canManage={canManage} 
    />
  );
}
