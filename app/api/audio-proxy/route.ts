import { NextRequest, NextResponse } from 'next/server';
import { getIdentityCookie } from '@/lib/session';
import { queryOne } from '@/lib/db/index';
import { isS3Configured, getPresignedUrl } from '@/lib/s3';

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
  const trackId = request.nextUrl.searchParams.get('trackId');

  if (trackId && isS3Configured()) {
    const row = await queryOne<{ audio_storage_key: string | null }>(
      'SELECT audio_storage_key FROM catalog_tracks WHERE id = $1',
      [Number(trackId)],
    );

    if (row?.audio_storage_key) {
      const presigned = await getPresignedUrl(row.audio_storage_key);
      return NextResponse.redirect(presigned, 302);
    }
  }

  const url = request.nextUrl.searchParams.get('url');
  if (!url || !isAllowedUrl(url)) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const reqHeaders: Record<string, string> = {};
  const identityCookie = await getIdentityCookie();
  if (identityCookie) {
    reqHeaders['Cookie'] = `identity=${identityCookie}`;
  }

  const upstream = await fetch(url, { headers: reqHeaders });
  if (!upstream.ok) {
    return NextResponse.json(
      { error: 'Upstream fetch failed' },
      { status: upstream.status },
    );
  }

  const resHeaders = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType) resHeaders.set('Content-Type', contentType);
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) resHeaders.set('Content-Length', contentLength);
  resHeaders.set('Cache-Control', 'public, max-age=86400');

  return new NextResponse(upstream.body, { status: 200, headers: resHeaders });
}
