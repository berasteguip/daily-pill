import { NextResponse, type NextRequest } from 'next/server';

const SUPABASE_AUTH_COOKIE = /^(?:__Secure-|__Host-)?sb-.*-auth-token(?:\.\d+)?$/;

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some(({ name }) => SUPABASE_AUTH_COOKIE.test(name));
}

export function middleware(request: NextRequest) {
  const hasSessionCookie = hasSupabaseAuthCookie(request);

  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth');

  // Keep middleware synchronous and local: API routes already validate the session.
  if (!hasSessionCookie && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
