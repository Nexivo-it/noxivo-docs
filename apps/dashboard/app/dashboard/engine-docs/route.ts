import { NextResponse } from 'next/server';
import { getCurrentSession } from '../../../lib/auth/session';
import { buildWorkflowEngineDocsAuthorizeUrl, normalizeWorkflowEngineDocsReturnTo } from '../../../lib/api/workflow-engine-docs-auth';

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const returnTo = normalizeWorkflowEngineDocsReturnTo(requestUrl.searchParams.get('returnTo'));
  const nextPath = returnTo === '/docs'
    ? '/dashboard/engine-docs'
    : `/dashboard/engine-docs?returnTo=${encodeURIComponent(returnTo)}`;

  const session = await getCurrentSession();
  if (!session) {
    const loginUrl = new URL('/auth/login', requestUrl.origin);
    loginUrl.searchParams.set('next', nextPath);
    return NextResponse.redirect(loginUrl);
  }

  const authorizeUrl = buildWorkflowEngineDocsAuthorizeUrl({
    userId: session.actor.userId,
    email: session.actor.email,
    returnTo,
  });

  return NextResponse.redirect(authorizeUrl);
}
