import { NextResponse } from 'next/server';
import { getCurrentSession } from '../../../../lib/auth/session';

export async function GET(): Promise<Response> {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ user: session.actor });
}
