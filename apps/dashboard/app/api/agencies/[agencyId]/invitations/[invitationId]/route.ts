import { proxyDashboardRouteToWorkflowEngine } from '../../../../../../lib/api/workflow-engine-proxy';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ agencyId: string; invitationId: string }> }
): Promise<Response> {
  const { agencyId, invitationId } = await context.params;
  return proxyDashboardRouteToWorkflowEngine(request, {
    targetPath: `/agencies/${encodeURIComponent(agencyId)}/invitations/${encodeURIComponent(invitationId)}`,
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ agencyId: string; invitationId: string }> }
): Promise<Response> {
  const { agencyId, invitationId } = await context.params;
  return proxyDashboardRouteToWorkflowEngine(request, {
    targetPath: `/agencies/${encodeURIComponent(agencyId)}/invitations/${encodeURIComponent(invitationId)}`,
  });
}
