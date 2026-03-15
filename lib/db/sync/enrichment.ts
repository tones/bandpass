/**
 * Catalog enrichment pipeline: queues album URLs that need metadata scraping,
 * processes them by fetching album pages, and backfills tags/tracks/FKs into
 * feed_items, wishlist_items, and catalog tables.
 */
import { query, queryOne, execute, transaction } from '../index';
import { fetchAlbumTracks, publicFetcher, extractSlug } from '@/lib/bandcamp/scraper';
import { ensureCatalogRelease, cacheAlbumTracks } from '../catalog';
import { sleep } from '../utils';
import { withRetry } from './helpers';

export async function enqueueForEnrichment(fanId: number): Promise<number> {
  return await transaction(async (client) => {
    const { rows: feedRows } = await client.query(
      `SELECT DISTINCT album_url FROM feed_items
       WHERE fan_id = $1 AND album_url != ''
         AND NOT EXISTS (SELECT 1 FROM enrichment_queue eq WHERE eq.album_url = feed_items.album_url)`,
      [fanId],
    );

    const { rows: wishlist } = await client.query(
      `SELECT DISTINCT item_url FROM wishlist_items
       WHERE fan_id = $1 AND tags = '[]'::jsonb AND item_url != ''`,
      [fanId],
    );

    let enqueued = 0;

    for (const row of feedRows) {
      const result = await client.query(
        'INSERT INTO enrichment_queue (album_url) VALUES ($1) ON CONFLICT DO NOTHING',
        [row.album_url],
      );
      if (result.rowCount && result.rowCount > 0) enqueued++;
    }

    for (const row of wishlist) {
      const result = await client.query(
        'INSERT INTO enrichment_queue (album_url) VALUES ($1) ON CONFLICT DO NOTHING',
        [row.item_url],
      );
      if (result.rowCount && result.rowCount > 0) enqueued++;
    }

    await client.query(
      `UPDATE enrichment_queue SET status = 'pending', processed_at = NULL
       WHERE status = 'failed' AND retry_count < 3`,
    );

    return enqueued;
  });
}

export async function getEnrichmentDoneCount(): Promise<number> {
  const row = await queryOne<{ c: string }>(
    "SELECT COUNT(*) AS c FROM enrichment_queue WHERE status = 'done'",
  );
  return parseInt(row!.c, 10);
}

export async function getGlobalEnrichmentPendingCount(): Promise<number> {
  const row = await queryOne<{ c: string }>(
    "SELECT COUNT(*) AS c FROM enrichment_queue WHERE status = 'pending'",
  );
  return parseInt(row!.c, 10);
}

export async function getEnrichmentPendingCount(fanId: number): Promise<number> {
  const feed = await queryOne<{ c: string }>(`
    SELECT COUNT(*) AS c FROM feed_items fi
    WHERE fi.fan_id = $1
      AND fi.album_url != ''
      AND NOT EXISTS (SELECT 1 FROM enrichment_queue eq WHERE eq.album_url = fi.album_url)
  `, [fanId]);
  const wishlist = await queryOne<{ c: string }>(`
    SELECT COUNT(*) AS c FROM wishlist_items wi
    WHERE wi.fan_id = $1 AND wi.tags = '[]'::jsonb
      AND wi.item_url != ''
      AND NOT EXISTS (SELECT 1 FROM enrichment_queue eq WHERE eq.album_url = wi.item_url)
  `, [fanId]);
  return parseInt(feed!.c, 10) + parseInt(wishlist!.c, 10);
}

const ENRICHMENT_DELAY_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const BACKOFF_THRESHOLD = 5;
const MAX_CONSECUTIVE_FAILURES = 20;
const FETCH_TIMEOUT_MS = 30_000;

function timedFetcher(url: string): Promise<string> {
  return publicFetcher(url, AbortSignal.timeout(FETCH_TIMEOUT_MS));
}

export async function processEnrichmentQueue(
  onProgress?: (processed: number, remaining: number) => void,
): Promise<number> {
  const pending = await query<{ album_url: string }>(
    "SELECT album_url FROM enrichment_queue WHERE status = 'pending' ORDER BY created_at ASC",
  );

  if (pending.length === 0) return 0;

  let processed = 0;
  let consecutiveFailures = 0;

  for (const { album_url } of pending) {
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(`Aborting enrichment batch after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
      break;
    }

    try {
      const album = await withRetry(() => fetchAlbumTracks(timedFetcher, album_url));
      const slug = extractSlug(new URL(album_url).origin);
      const releaseId = await ensureCatalogRelease(
        album_url,
        album.artist,
        slug,
        album.title,
        album.imageUrl,
        album.bandcampId,
      );
      await cacheAlbumTracks(
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

      await execute("UPDATE feed_items SET release_id = $1 WHERE album_url = $2 AND release_id IS NULL", [releaseId, album_url]);
      await execute("UPDATE wishlist_items SET release_id = $1 WHERE item_url = $2 AND release_id IS NULL", [releaseId, album_url]);
      await execute(`
        UPDATE feed_items fi SET track_id = ct.id
        FROM catalog_tracks ct
        WHERE ct.bandcamp_track_id = fi.bandcamp_track_id
          AND ct.release_id = $1
          AND fi.release_id = $1 AND fi.track_id IS NULL
          AND fi.bandcamp_track_id IS NOT NULL
      `, [releaseId]);

      await execute("UPDATE enrichment_queue SET status = 'done', processed_at = NOW() WHERE album_url = $1", [album_url]);
      consecutiveFailures = 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Enrichment failed for ${album_url}:`, message);
      await execute(
        `UPDATE enrichment_queue SET status = 'failed', processed_at = NOW(),
         retry_count = retry_count + 1, last_error = $2
         WHERE album_url = $1`,
        [album_url, message.slice(0, 500)],
      );
      consecutiveFailures++;
    }

    processed++;
    onProgress?.(processed, pending.length - processed);

    if (processed < pending.length) {
      let delay = ENRICHMENT_DELAY_MS;
      if (consecutiveFailures >= BACKOFF_THRESHOLD) {
        delay = Math.min(ENRICHMENT_DELAY_MS * Math.pow(2, consecutiveFailures - BACKOFF_THRESHOLD), MAX_BACKOFF_MS);
      }
      await sleep(delay);
    }
  }

  return processed;
}
