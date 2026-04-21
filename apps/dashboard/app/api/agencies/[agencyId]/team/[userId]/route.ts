import { proxyDashboardRouteToWorkflowEngine } from '../../../../../../lib/api/workflow-engine-proxy';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ agencyId: string; userId: string }> }
): Promise<Response> {
  const { agencyId, userId } = await context.params;
  return proxyDashboardRouteToWorkflowEngine(request, {
    targetPath: `/agencies/${encodeURIComponent(agencyId)}/team/${encodeURIComponent(userId)}`,
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ agencyId: string; userId: string }> }
): Promise<Response> {
  const { agencyId, userId } = await context.params;
  return proxyDashboardRouteToWorkflowEngine(request, {
    targetPath: `/agencies/${encodeURIComponent(agencyId)}/team/${encodeURIComponent(userId)}`,
  });
}
