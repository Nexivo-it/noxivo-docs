import { NextResponse } from 'next/server';
import { listAgencyTeam } from '../../../../../lib/dashboard/team-admin';
import { getCurrentSession } from '../../../../../lib/auth/session';

function toErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Unexpected team error';

  if (message === 'Forbidden') {
    return NextResponse.json({ error: message }, { status: 403 });
  }

  if (message === 'Agency not found') {
    return NextResponse.json({ error: message }, { status: 404 });
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
    return NextResponse.json(await listAgencyTeam(session, agencyId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
