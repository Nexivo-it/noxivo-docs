import { NextResponse } from 'next/server';
import { getAgencyAdministrationDetail, updateAgency } from '../../../../lib/dashboard/agency-admin';
import { getCurrentSession } from '../../../../lib/auth/session';

function toErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Unexpected agency error';

  if (message === 'Forbidden') {
    return NextResponse.json({ error: message }, { status: 403 });
  }

  if (message === 'Agency not found') {
    return NextResponse.json({ error: message }, { status: 404 });
  }

  if (/already in use/i.test(message)) {
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
    return NextResponse.json(await getAgencyAdministrationDetail(session, agencyId));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
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
    return NextResponse.json(await updateAgency(session, agencyId, payload));
  } catch (error) {
    return toErrorResponse(error);
  }
}
