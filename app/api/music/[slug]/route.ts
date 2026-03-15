import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { BandcampClient } from '@/lib/bandcamp/client';
import { fetchDiscography, fetchAlbumTracks, artIdToUrl, publicFetcher } from '@/lib/bandcamp/scraper';
import type { HtmlFetcher } from '@/lib/bandcamp/scraper';
import {
  getCachedDiscography,
  cacheDiscography,
  getCachedAlbumTracks,
  cacheAlbumTracks,
} from '@/lib/db/catalog';
import { queryOne } from '@/lib/db/index';
import { safeParseTags } from '@/lib/db/utils';
import { enqueueUrlsForEnrichment } from '@/lib/db/sync';

export const dynamic = 'force-dynamic';

async function getFetcher(identityCookie?: string): Promise<HtmlFetcher> {
  if (identityCookie) {
    const client = new BandcampClient(identityCookie);
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
  const session = await getSession();
  if (!session.fanId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { slug } = await params;
  const cached = await getCachedDiscography(slug);
  if (cached) {
    return NextResponse.json({ releases: cached, fromCache: true });
  }

  try {
    const fetcher = await getFetcher(session.identityCookie);
    const bandUrl = slugToBandUrl(slug);
    const result = await fetchDiscography(fetcher, bandUrl);

    const releases = await cacheDiscography(
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

    const urls = releases.map((r) => r.url).filter(Boolean);
    enqueueUrlsForEnrichment(urls).catch((e) =>
      console.error('Failed to enqueue discography for enrichment:', e),
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
  const session = await getSession();
  if (!session.fanId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

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

  const cached = await getCachedAlbumTracks(releaseId);
  if (cached) {
    const release = await queryOne<{
      release_date: string | null;
      tags: string | string[];
    }>('SELECT release_date, tags FROM catalog_releases WHERE id = $1', [releaseId]);
    return NextResponse.json({
      tracks: cached,
      releaseDate: release?.release_date ?? null,
      tags: release?.tags ? safeParseTags(release.tags) : [],
      fromCache: true,
    });
  }

  try {
    const fetcher = await getFetcher(session.identityCookie);
    const album = await fetchAlbumTracks(fetcher, albumUrl);

    const tracks = await cacheAlbumTracks(
      releaseId,
      album.tracks.map((t) => ({
        trackNum: t.trackNum,
        title: t.title,
        duration: t.duration,
        streamUrl: t.streamUrl,
        trackUrl: t.trackUrl,
        bandcampTrackId: t.bandcampTrackId,
      })),
      album.releaseDate,
      album.tags,
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
