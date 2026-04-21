import { proxyDashboardRouteToWorkflowEngine } from '../../../../../lib/api/workflow-engine-proxy';

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> }
): Promise<Response> {
  const { conversationId } = await context.params;
  const encodedConversationId = encodeURIComponent(conversationId);
  return proxyDashboardRouteToWorkflowEngine(request, { targetPath: `/team-inbox/${encodedConversationId}/delivery-history` });
}
