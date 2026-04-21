import { proxyDashboardRouteToWorkflowEngine } from '../../../../lib/api/workflow-engine-proxy';

export async function GET(request: Request): Promise<Response> {
  return proxyDashboardRouteToWorkflowEngine(request, { targetPath: '/settings/storage' });
}

export async function PUT(request: Request): Promise<Response> {
  return proxyDashboardRouteToWorkflowEngine(request, { targetPath: '/settings/storage' });
}
