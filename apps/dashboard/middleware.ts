import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Noxivo Dashboard Middleware
 *
 * Handles ultra-fast automatic redirection at the edge.
 * Root path (/) redirects to /dashboard if a session cookie exists,
 * or /auth/login if it doesn't.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle root redirect immediately
  if (pathname === '/') {
    const sessionCookie = request.cookies.get('noxivo_session');

    if (sessionCookie?.value) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    } else {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
  }

  return NextResponse.next();
}

// Only run on the root path for now to satisfy the "automatic redirect" requirement
export const config = {
  matcher: ['/'],
};
