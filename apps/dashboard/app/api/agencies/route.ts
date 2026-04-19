import { NextResponse } from 'next/server';
import { createAgency, listAccessibleAgencies } from '../../../lib/dashboard/agency-admin';
import { getCurrentSession } from '../../../lib/auth/session';

function toErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Unexpected agencies error';

  if (message === 'Forbidden') {
    return NextResponse.json({ error: message }, { status: 403 });
  }

  if (/already in use|already belongs/i.test(message)) {
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(): Promise<Response> {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await listAccessibleAgencies(session));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload = await request.json();
    return NextResponse.json(await createAgency(session, payload), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
