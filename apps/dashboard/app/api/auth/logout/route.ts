import { NextResponse } from 'next/server';
import { AUTH_SESSION_COOKIE_NAME, clearSessionCookie, deleteSessionByToken } from '../../../../lib/auth/session';

export async function POST(request: Request): Promise<Response> {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const token = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_SESSION_COOKIE_NAME}=`))
    ?.slice(`${AUTH_SESSION_COOKIE_NAME}=`.length);

  if (token) {
    await deleteSessionByToken(token);
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
