import { proxyDashboardRouteToWorkflowEngine } from '../../../../../lib/api/workflow-engine-proxy';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ sourceId: string }> }
): Promise<Response> {
  const { sourceId } = await context.params;
  const encodedSourceId = encodeURIComponent(sourceId);
  return proxyDashboardRouteToWorkflowEngine(request, {
    targetPath: `/settings/webhook-inbox-sources/${encodedSourceId}`,
  });
}
