import { proxyDashboardRouteToWorkflowEngine } from '../../../../../lib/api/workflow-engine-proxy';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> }
): Promise<Response> {
  const { workflowId } = await params;
  return proxyDashboardRouteToWorkflowEngine(request, {
    targetPath: `/workflows/${encodeURIComponent(workflowId)}/toggle`,
  });
}
