import { proxyDashboardRouteToWorkflowEngine } from '../../../../../lib/api/workflow-engine-proxy';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> }
): Promise<Response> {
  const { workflowId } = await params;
  return proxyDashboardRouteToWorkflowEngine(request, {
    targetPath: `/workflows/${encodeURIComponent(workflowId)}/analytics`,
  });
}
