import { NextRequest, NextResponse } from 'next/server';

function getAllowedOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;

  const extensionOrigin = process.env.EXTENSION_ORIGIN;
  if (extensionOrigin === '*') return origin;
  if (extensionOrigin && origin === extensionOrigin) return origin;
  if (origin.startsWith('chrome-extension://')) return origin;

  return null;
}

export function withCors(request: NextRequest, response: NextResponse): NextResponse {
  const allowed = getAllowedOrigin(request);
  if (allowed) {
    response.headers.set('Access-Control-Allow-Origin', allowed);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return response;
}

export function handlePreflight(request: NextRequest): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  return withCors(request, response);
}
