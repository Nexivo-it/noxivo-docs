import { requireCurrentSession } from '../../../lib/auth/current-user';
import { canManageWorkflows } from '../../../lib/auth/authorization';
import { queryWorkflowsData } from '../../../lib/dashboard/queries';
import { WorkflowsClient } from './workflows-client';

export const dynamic = 'force-dynamic';

export default async function WorkflowsPage() {
  const session = await requireCurrentSession();
  const workflowsData = await queryWorkflowsData(session);
  const canManage = canManageWorkflows(session);

  return (
    <WorkflowsClient 
      initialWorkflows={workflowsData.workflows} 
      canManage={canManage} 
    />
  );
}
