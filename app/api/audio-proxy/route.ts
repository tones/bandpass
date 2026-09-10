import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { query, queryOne, execute } from '@/lib/db/index';
import { isS3Configured, getPresignedUrl } from '@/lib/s3';
import { fetchAlbumTracks, publicFetcher } from '@/lib/bandcamp/scraper';
import { refreshStreamUrls } from '@/lib/db/catalog';

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
  const user = await getUser();

  const trackId = request.nextUrl.searchParams.get('trackId');

  if (trackId && isS3Configured()) {
    const numericId = parseInt(trackId, 10);
    if (isNaN(numericId)) {
      return NextResponse.json({ error: 'Invalid trackId' }, { status: 400 });
    }
    const row = await queryOne<{ audio_storage_key: string | null }>(
      'SELECT audio_storage_key FROM catalog_tracks WHERE id = $1',
      [numericId],
    );

    if (row?.audio_storage_key) {
      const presigned = await getPresignedUrl(row.audio_storage_key);
      return NextResponse.redirect(presigned, 302);
    }
  }

  let url = request.nextUrl.searchParams.get('url');
  if (!url || !isAllowedUrl(url)) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const reqHeaders: Record<string, string> = {};
  if (user?.bandcampCookie) {
    reqHeaders['Cookie'] = `identity=${user.bandcampCookie}`;
  }
  const rangeHeader = request.headers.get('range');
  if (rangeHeader) {
    reqHeaders['Range'] = rangeHeader;
  }

  let upstream = await fetch(url, { headers: reqHeaders });

  // If the upstream stream URL returned 410 (Gone/expired), 403, or 404,
  // attempt an on-demand refresh by scraping the album page for fresh URLs.
  if (!upstream.ok && (upstream.status === 410 || upstream.status === 403 || upstream.status === 404)) {
    try {
      let releaseId: number | null = null;
      let releaseUrl: string | null = null;
      let trackNum: number | null = null;
      let bandcampTrackId: string | null = null;

      if (trackId && !isNaN(parseInt(trackId, 10))) {
        const row = await queryOne<{
          track_num: number | null;
          bandcamp_track_id: string | null;
          release_id: number;
          release_url: string;
        }>(
          `SELECT ct.track_num, ct.bandcamp_track_id, cr.id AS release_id, cr.url AS release_url
           FROM catalog_tracks ct
           JOIN catalog_releases cr ON ct.release_id = cr.id
           WHERE ct.id = $1`,
          [parseInt(trackId, 10)],
        );
        if (row) {
          releaseId = row.release_id;
          releaseUrl = row.release_url;
          trackNum = row.track_num;
          bandcampTrackId = row.bandcamp_track_id;
        }
      }

      if (!releaseUrl && url) {
        const trackRow = await queryOne<{
          track_num: number | null;
          bandcamp_track_id: string | null;
          release_id: number;
          release_url: string;
        }>(
          `SELECT ct.track_num, ct.bandcamp_track_id, cr.id AS release_id, cr.url AS release_url
           FROM catalog_tracks ct
           JOIN catalog_releases cr ON ct.release_id = cr.id
           WHERE ct.stream_url = $1`,
          [url],
        );
        if (trackRow) {
          releaseId = trackRow.release_id;
          releaseUrl = trackRow.release_url;
          trackNum = trackRow.track_num;
          bandcampTrackId = trackRow.bandcamp_track_id;
        }
      }

      if (!releaseUrl && url) {
        const feedRow = await queryOne<{
          album_url: string;
          release_id: number | null;
          track_id: number | null;
          bandcamp_track_id: string | null;
        }>(
          `SELECT fi.album_url, fi.release_id, fi.track_id, fi.bandcamp_track_id
           FROM feed_items fi
           WHERE fi.track_stream_url = $1
           LIMIT 1`,
          [url],
        );
        if (feedRow) {
          releaseUrl = feedRow.album_url;
          releaseId = feedRow.release_id;
          bandcampTrackId = feedRow.bandcamp_track_id;
        }
      }

      if (!releaseUrl && url) {
        const wishRow = await queryOne<{
          item_url: string;
          release_id: number | null;
        }>(
          `SELECT wi.item_url, wi.release_id
           FROM wishlist_items wi
           WHERE wi.stream_url = $1
           LIMIT 1`,
          [url],
        );
        if (wishRow) {
          releaseUrl = wishRow.item_url;
          releaseId = wishRow.release_id;
        }
      }

      if (releaseUrl) {
        const detail = await fetchAlbumTracks(publicFetcher, releaseUrl);
        if (releaseId != null) {
          await refreshStreamUrls(releaseId, detail.tracks);
        }

        const freshTrack = detail.tracks.find((t) =>
          (bandcampTrackId && t.bandcampTrackId != null && String(t.bandcampTrackId) === bandcampTrackId) ||
          (trackNum != null && t.trackNum === trackNum) ||
          (trackNum == null && t.trackNum == null),
        );

        const newStreamUrl = freshTrack?.streamUrl ?? detail.tracks[0]?.streamUrl;
        if (newStreamUrl && isAllowedUrl(newStreamUrl)) {
          url = newStreamUrl;
          upstream = await fetch(url, { headers: reqHeaders });

          // Update feed_items / wishlist_items if we replaced an old URL
          if (upstream.ok && url) {
            execute(
              'UPDATE feed_items SET track_stream_url = $1 WHERE track_stream_url = $2',
              [newStreamUrl, request.nextUrl.searchParams.get('url')],
            ).catch(() => {});
            execute(
              'UPDATE wishlist_items SET stream_url = $1 WHERE stream_url = $2',
              [newStreamUrl, request.nextUrl.searchParams.get('url')],
            ).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error('Failed to auto-refresh expired stream URL in audio-proxy:', err);
    }
  }

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
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) resHeaders.set('Content-Range', contentRange);
  const acceptRanges = upstream.headers.get('accept-ranges');
  if (acceptRanges) resHeaders.set('Accept-Ranges', acceptRanges);
  resHeaders.set('Cache-Control', 'public, max-age=86400');

  return new NextResponse(upstream.body, { status: upstream.status, headers: resHeaders });
}
