import { NextResponse } from 'next/server';
import { inviteAgencyTeamMember, listAgencyTeam } from '../../../../../lib/dashboard/team-admin';
import { getCurrentSession } from '../../../../../lib/auth/session';

function toErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Unexpected invitation error';

  if (message === 'Forbidden') {
    return NextResponse.json({ error: message }, { status: 403 });
  }

  if (message === 'Agency not found') {
    return NextResponse.json({ error: message }, { status: 404 });
  }

  if (/already belongs/i.test(message)) {
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ agencyId: string }> }
): Promise<Response> {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { agencyId } = await context.params;
    const team = await listAgencyTeam(session, agencyId);
    return NextResponse.json(team.invitations);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ agencyId: string }> }
): Promise<Response> {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { agencyId } = await context.params;
    const payload = await request.json();
    return NextResponse.json(await inviteAgencyTeamMember(session, agencyId, payload), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
