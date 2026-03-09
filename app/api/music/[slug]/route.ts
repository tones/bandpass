import { NextRequest, NextResponse } from 'next/server';
import { getIdentityCookie } from '@/lib/session';
import { BandcampClient } from '@/lib/bandcamp/client';
import { fetchDiscography, fetchAlbumTracks, artIdToUrl, publicFetcher } from '@/lib/bandcamp/scraper';
import type { HtmlFetcher } from '@/lib/bandcamp/scraper';
import {
  getCachedDiscography,
  cacheDiscography,
  getCachedAlbumTracks,
  cacheAlbumTracks,
} from '@/lib/db/catalog';

export const dynamic = 'force-dynamic';

async function getFetcher(): Promise<HtmlFetcher> {
  const cookie = await getIdentityCookie();
  if (cookie) {
    const client = new BandcampClient(cookie);
    return (url: string) => client.getHtml(url);
  }
  return publicFetcher;
}

function slugToBandUrl(slug: string): string {
  if (slug.includes('.')) {
    return `https://${slug}`;
  }
  return `https://${slug}.bandcamp.com`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const cached = getCachedDiscography(slug);
  if (cached) {
    return NextResponse.json({ releases: cached, fromCache: true });
  }

  try {
    const fetcher = await getFetcher();
    const bandUrl = slugToBandUrl(slug);
    const result = await fetchDiscography(fetcher, bandUrl);

    const releases = cacheDiscography(
      slug,
      result.band.name,
      result.band.url,
      result.items.map((item) => ({
        title: item.title,
        url: item.pageUrl.startsWith('http')
          ? item.pageUrl
          : `${bandUrl}${item.pageUrl}`,
        imageUrl: item.artId ? artIdToUrl(item.artId) : '',
        releaseType: item.type,
      })),
    );

    return NextResponse.json({ releases, fromCache: false });
  } catch (err) {
    console.error('Discography fetch error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch discography' },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  await params;

  const body = await request.json();
  const { releaseId, albumUrl } = body as {
    releaseId: number;
    albumUrl: string;
  };

  if (!releaseId || !albumUrl) {
    return NextResponse.json(
      { error: 'releaseId and albumUrl are required' },
      { status: 400 },
    );
  }

  const cached = getCachedAlbumTracks(releaseId);
  if (cached) {
    return NextResponse.json({ tracks: cached, fromCache: true });
  }

  try {
    const fetcher = await getFetcher();
    const album = await fetchAlbumTracks(fetcher, albumUrl);

    const tracks = cacheAlbumTracks(
      releaseId,
      album.tracks.map((t) => ({
        trackNum: t.trackNum,
        title: t.title,
        duration: t.duration,
        streamUrl: t.streamUrl,
        trackUrl: t.trackUrl,
      })),
    );

    return NextResponse.json({ tracks, releaseDate: album.releaseDate, tags: album.tags, fromCache: false });
  } catch (err) {
    console.error('Album tracks fetch error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch album tracks' },
      { status: 500 },
    );
  }
}
