import { NextResponse } from 'next/server';
import { removeAgencyUser, updateAgencyUser } from '../../../../../../lib/dashboard/team-admin';
import { getCurrentSession } from '../../../../../../lib/auth/session';

function toErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Unexpected team member error';

  if (message === 'Forbidden') {
    return NextResponse.json({ error: message }, { status: 403 });
  }

  if (message === 'User not found') {
    return NextResponse.json({ error: message }, { status: 404 });
  }

  if (/last agency owner|last owner/i.test(message)) {
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({ error: message }, { status: 400 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ agencyId: string; userId: string }> }
): Promise<Response> {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { agencyId, userId } = await context.params;
    const payload = await request.json();
    return NextResponse.json(await updateAgencyUser(session, agencyId, userId, payload));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ agencyId: string; userId: string }> }
): Promise<Response> {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { agencyId, userId } = await context.params;
    await removeAgencyUser(session, agencyId, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
