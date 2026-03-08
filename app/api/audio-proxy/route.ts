import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = ['bandcamp.com', 'bcbits.com'];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url || !isAllowedUrl(url)) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const upstream = await fetch(url);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: 'Upstream fetch failed' },
      { status: upstream.status },
    );
  }

  const headers = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers.set('Content-Length', contentLength);
  headers.set('Cache-Control', 'public, max-age=86400');

  return new NextResponse(upstream.body, { status: 200, headers });
}
