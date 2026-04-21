import { proxyDashboardRouteToWorkflowEngine } from '../../../../../../../lib/api/workflow-engine-proxy';

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string; messageId: string }> }
): Promise<Response> {
  const { conversationId, messageId } = await context.params;
  const encodedConversationId = encodeURIComponent(conversationId);
  const encodedMessageId = encodeURIComponent(messageId);
  return proxyDashboardRouteToWorkflowEngine(request, {
    targetPath: `/team-inbox/${encodedConversationId}/messages/${encodedMessageId}/actions`,
  });
}
