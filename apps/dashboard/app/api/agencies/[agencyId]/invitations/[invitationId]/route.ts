import { NextResponse } from 'next/server';
import { revokeAgencyInvitation, updateAgencyInvitation } from '../../../../../../lib/dashboard/team-admin';
import { getCurrentSession } from '../../../../../../lib/auth/session';

function toErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Unexpected invitation error';

  if (message === 'Forbidden') {
    return NextResponse.json({ error: message }, { status: 403 });
  }

  if (message === 'Invitation not found') {
    return NextResponse.json({ error: message }, { status: 404 });
  }

  if (/already belongs/i.test(message)) {
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({ error: message }, { status: 400 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ agencyId: string; invitationId: string }> }
): Promise<Response> {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { agencyId, invitationId } = await context.params;
    const payload = await request.json();
    return NextResponse.json(await updateAgencyInvitation(session, agencyId, invitationId, payload));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ agencyId: string; invitationId: string }> }
): Promise<Response> {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { agencyId, invitationId } = await context.params;
    await revokeAgencyInvitation(session, agencyId, invitationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
