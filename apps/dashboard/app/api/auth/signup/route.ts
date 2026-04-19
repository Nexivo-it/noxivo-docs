import { NextResponse } from 'next/server';
import { createSession, attachSessionCookie } from '../../../../lib/auth/session';
import { signupWithAgency } from '../../../../lib/auth/service';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected signup error';
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = await request.json();
    const user = await signupWithAgency(payload);
    const { token, expiresAt } = await createSession({
      userId: user.id,
      agencyId: user.agencyId,
      tenantId: user.tenantId,
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent')
    });

    const response = NextResponse.json({ user });
    attachSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}
