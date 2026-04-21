import { proxyDashboardRouteToWorkflowEngine } from '../../../lib/api/workflow-engine-proxy';

export async function GET(request: Request): Promise<Response> {
  return proxyDashboardRouteToWorkflowEngine(request, { targetPath: '/agencies' });
}

export async function POST(request: Request): Promise<Response> {
  return proxyDashboardRouteToWorkflowEngine(request, { targetPath: '/agencies' });
}
