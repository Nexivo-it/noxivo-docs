import { proxyDashboardRouteToWorkflowEngine } from '../../../../lib/api/workflow-engine-proxy';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  return proxyDashboardRouteToWorkflowEngine(request, { targetPath: `/catalog/${encodeURIComponent(id)}` });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  return proxyDashboardRouteToWorkflowEngine(request, { targetPath: `/catalog/${encodeURIComponent(id)}` });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  return proxyDashboardRouteToWorkflowEngine(request, { targetPath: `/catalog/${encodeURIComponent(id)}` });
}
