import { proxyDashboardRouteToWorkflowEngine } from '../../../../lib/api/workflow-engine-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return proxyDashboardRouteToWorkflowEngine(request, { targetPath: '/team-inbox/events' });
}
