import { proxyDashboardRouteToWorkflowEngine } from '../../../../../../lib/api/workflow-engine-proxy';

export async function GET(
  request: Request,
  context: { params: Promise<{ agencyId: string; tenantId: string }> }
): Promise<Response> {
  const { agencyId, tenantId } = await context.params;
  return proxyDashboardRouteToWorkflowEngine(request, {
    targetPath: `/agencies/${encodeURIComponent(agencyId)}/tenants/${encodeURIComponent(tenantId)}`,
  });
}
