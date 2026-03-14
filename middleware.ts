import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';

const PUBLIC_PATHS = ['/gate', '/api/gate', '/privacy'];

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function middleware(request: NextRequest) {
  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  const token = request.cookies.get('bandpass_gate')?.value;
  const expected = Buffer.from(sitePassword).toString('base64');

  if (token && safeCompare(token, expected)) return NextResponse.next();

  const gateUrl = request.nextUrl.clone();
  gateUrl.pathname = '/gate';
  return NextResponse.redirect(gateUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
