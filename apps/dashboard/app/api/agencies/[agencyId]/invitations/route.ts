import { proxyDashboardRouteToWorkflowEngine } from '../../../../../lib/api/workflow-engine-proxy';

export async function GET(
  request: Request,
  context: { params: Promise<{ agencyId: string }> }
): Promise<Response> {
  const { agencyId } = await context.params;
  return proxyDashboardRouteToWorkflowEngine(request, { targetPath: `/agencies/${encodeURIComponent(agencyId)}/invitations` });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ agencyId: string }> }
): Promise<Response> {
  const { agencyId } = await context.params;
  return proxyDashboardRouteToWorkflowEngine(request, { targetPath: `/agencies/${encodeURIComponent(agencyId)}/invitations` });
}
