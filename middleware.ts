/**
 * Next.js middleware -- runs in the EDGE RUNTIME, not Node.js.
 * Do NOT import Node built-ins (crypto, fs, Buffer, etc.) here.
 * Use only Web APIs (TextEncoder, btoa, fetch, crypto.subtle, etc.).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/gate', '/api/gate', '/privacy'];

/**
 * Constant-time string comparison compatible with the Edge Runtime.
 * Uses TextEncoder + XOR instead of Node's crypto.timingSafeEqual
 * which isn't available in Edge.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  let mismatch = 0;
  for (let i = 0; i < bufA.length; i++) {
    mismatch |= bufA[i] ^ bufB[i];
  }
  return mismatch === 0;
}

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
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
  const expected = toBase64(sitePassword);

  if (token && safeCompare(token, expected)) return NextResponse.next();

  const gateUrl = request.nextUrl.clone();
  gateUrl.pathname = '/gate';
  return NextResponse.redirect(gateUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
