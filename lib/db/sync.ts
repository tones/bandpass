import { query, queryOne, execute, transaction } from './index';
import { BandcampAPI } from '@/lib/bandcamp/api';
import type { FeedItem, WishlistItem } from '@/lib/bandcamp/types/domain';
import { fetchAlbumTracks, publicFetcher, extractSlug } from '@/lib/bandcamp/scraper';
import { ensureCatalogRelease, cacheAlbumTracks } from './catalog';
import { ensureCrateBySource } from './crates';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 5000;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err instanceof Error && err.message.includes('429');
      if (!is429 || attempt === MAX_RETRIES) throw err;
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      console.warn(`Rate limited (429), backing off ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(backoff);
    }
  }
  throw new Error('Unreachable');
}

const INSERT_ITEM = `
  INSERT INTO feed_items (
    id, fan_id, story_type, date,
    album_id, album_title, album_url, album_image_url,
    artist_id, artist_name, artist_url,
    track_title, track_duration, track_stream_url,
    tags, price_amount, price_currency,
    fan_name, fan_username, also_collected_count
  ) VALUES (
    $1, $2, $3, $4,
    $5, $6, $7, $8,
    $9, $10, $11,
    $12, $13, $14,
    $15::jsonb, $16, $17,
    $18, $19, $20
  )
  ON CONFLICT(id, fan_id) DO UPDATE SET
    story_type = excluded.story_type,
    date = excluded.date,
    album_id = excluded.album_id,
    album_title = excluded.album_title,
    album_url = excluded.album_url,
    album_image_url = excluded.album_image_url,
    artist_id = excluded.artist_id,
    artist_name = excluded.artist_name,
    artist_url = excluded.artist_url,
    track_title = excluded.track_title,
    track_duration = excluded.track_duration,
    track_stream_url = excluded.track_stream_url,
    tags = excluded.tags,
    price_amount = excluded.price_amount,
    price_currency = excluded.price_currency,
    fan_name = excluded.fan_name,
    fan_username = excluded.fan_username,
    also_collected_count = excluded.also_collected_count
`;

async function insertItems(fanId: number, items: FeedItem[]) {
  await transaction(async (client) => {
    for (const item of items) {
      await client.query(INSERT_ITEM, [
        item.id,
        fanId,
        item.storyType,
        item.date instanceof Date ? item.date.toISOString() : String(item.date),
        item.album?.id ?? null,
        item.album?.title ?? '',
        item.album?.url ?? '',
        item.album?.imageUrl ?? '',
        item.artist?.id ?? null,
        item.artist?.name ?? '',
        item.artist?.url ?? '',
        item.track?.title ?? null,
        item.track?.duration ?? null,
        item.track?.streamUrl ?? null,
        JSON.stringify(item.tags ?? []),
        item.price?.amount ?? null,
        item.price?.currency ?? null,
        item.socialSignal?.fan?.name ?? null,
        item.socialSignal?.fan?.username ?? null,
        item.socialSignal?.alsoCollectedCount ?? 0,
      ]);
    }
  });
}

export interface SyncState {
  fanId: number;
  oldestStoryDate: number | null;
  newestStoryDate: number | null;
  totalItems: number;
  isSyncing: boolean;
  lastSyncAt: string | null;
  deepSyncComplete: boolean;
  collectionSynced: boolean;
  wishlistSynced: boolean;
}

export async function getSyncState(fanId: number): Promise<SyncState | null> {
  const row = await queryOne<{
    fan_id: number;
    oldest_story_date: number | null;
    newest_story_date: number | null;
    total_items: number;
    is_syncing: boolean;
    last_sync_at: Date | string | null;
    deep_sync_complete: boolean;
    collection_synced: boolean;
    wishlist_synced: boolean;
  }>('SELECT * FROM sync_state WHERE fan_id = $1', [fanId]);

  if (!row) return null;
  return {
    fanId: row.fan_id,
    oldestStoryDate: row.oldest_story_date,
    newestStoryDate: row.newest_story_date,
    totalItems: row.total_items,
    isSyncing: row.is_syncing,
    lastSyncAt: row.last_sync_at instanceof Date ? row.last_sync_at.toISOString() : row.last_sync_at,
    deepSyncComplete: row.deep_sync_complete,
    collectionSynced: row.collection_synced,
    wishlistSynced: row.wishlist_synced,
  };
}

async function setSyncing(fanId: number, syncing: boolean) {
  await execute(`
    INSERT INTO sync_state (fan_id, is_syncing) VALUES ($1, $2)
    ON CONFLICT(fan_id) DO UPDATE SET is_syncing = excluded.is_syncing
  `, [fanId, syncing]);
}

async function updateSyncProgress(fanId: number, oldestDate: number, newestDate: number, totalItems: number) {
  await execute(`
    INSERT INTO sync_state (fan_id, oldest_story_date, newest_story_date, total_items, is_syncing, last_sync_at)
    VALUES ($1, $2, $3, $4, true, NOW())
    ON CONFLICT(fan_id) DO UPDATE SET
      oldest_story_date = CASE
        WHEN excluded.oldest_story_date < COALESCE(sync_state.oldest_story_date, 9999999999)
        THEN excluded.oldest_story_date ELSE sync_state.oldest_story_date END,
      newest_story_date = CASE
        WHEN excluded.newest_story_date > COALESCE(sync_state.newest_story_date, 0)
        THEN excluded.newest_story_date ELSE sync_state.newest_story_date END,
      total_items = excluded.total_items,
      last_sync_at = NOW()
  `, [fanId, oldestDate, newestDate, totalItems]);
}

const SIX_MONTHS_SECONDS = 180 * 24 * 60 * 60;

/**
 * Initial sync: pages through the feed history up to 6 months back,
 * storing items as each page arrives. Returns the total number of items synced.
 */
export async function syncFeedInitial(api: BandcampAPI, fanId: number): Promise<number> {
  await setSyncing(fanId, true);

  const cutoff = Math.floor(Date.now() / 1000) - SIX_MONTHS_SECONDS;
  let olderThan: number | undefined;
  let totalSynced = 0;

  try {
    while (true) {
      const page = await api.getFeed({ olderThan });

      if (page.items.length === 0) break;

      await insertItems(fanId, page.items);
      totalSynced += page.items.length;

      const countRow = await queryOne<{ c: string }>('SELECT COUNT(*) AS c FROM feed_items WHERE fan_id = $1', [fanId]);
      const dbTotal = parseInt(countRow!.c, 10);
      await updateSyncProgress(fanId, page.oldestStoryDate, page.newestStoryDate, dbTotal);

      if (!page.hasMore) break;
      if (page.oldestStoryDate >= (olderThan ?? Infinity)) break;
      if (page.oldestStoryDate < cutoff) break;
      olderThan = page.oldestStoryDate;
    }
  } finally {
    await setSyncing(fanId, false);
  }

  return totalSynced;
}

const CONSECUTIVE_KNOWN_PAGES_THRESHOLD = 3;

/**
 * Smart incremental sync: scans the feed looking for any new items, not just
 * chronologically recent ones. Handles backdated items from newly-followed
 * artists/fans by continuing past known items. Stops after N consecutive
 * pages where every item was already in the DB.
 */
export async function syncFeedIncremental(api: BandcampAPI, fanId: number): Promise<number> {
  const state = await getSyncState(fanId);
  if (!state?.newestStoryDate) {
    return syncFeedInitial(api, fanId);
  }

  await setSyncing(fanId, true);
  let totalNew = 0;
  let consecutiveKnownPages = 0;

  try {
    let olderThan: number | undefined;

    while (true) {
      const page = await api.getFeed({ olderThan });

      if (page.items.length === 0) break;

      const newItems: FeedItem[] = [];
      for (const item of page.items) {
        const exists = await queryOne('SELECT 1 FROM feed_items WHERE id = $1 AND fan_id = $2', [item.id, fanId]);
        if (!exists) newItems.push(item);
      }

      if (newItems.length > 0) {
        await insertItems(fanId, newItems);
        totalNew += newItems.length;
        consecutiveKnownPages = 0;
      } else {
        consecutiveKnownPages++;
      }

      if (consecutiveKnownPages >= CONSECUTIVE_KNOWN_PAGES_THRESHOLD) break;
      if (!page.hasMore) break;
      if (page.oldestStoryDate >= (olderThan ?? Infinity)) break;
      olderThan = page.oldestStoryDate;
    }

    const countRow = await queryOne<{ c: string }>('SELECT COUNT(*) AS c FROM feed_items WHERE fan_id = $1', [fanId]);
    const dbTotal = parseInt(countRow!.c, 10);
    const newestRow = await queryOne<{ d: Date | string }>('SELECT MAX(date) AS d FROM feed_items WHERE fan_id = $1', [fanId]);
    if (newestRow?.d) {
      await updateSyncProgress(fanId, state.oldestStoryDate!, Math.floor(new Date(newestRow.d).getTime() / 1000), dbTotal);
    }
  } finally {
    await setSyncing(fanId, false);
  }

  return totalNew;
}

async function setDeepSyncComplete(fanId: number) {
  await execute(
    'UPDATE sync_state SET deep_sync_complete = true WHERE fan_id = $1',
    [fanId],
  );
}

const DEEP_SYNC_PAGE_DELAY_MS = 500;

/**
 * Deep background sync: continues paging backwards from the oldest known item,
 * loading the full feed history. Runs throttled (500ms between pages) with
 * 429 retry. Sets deep_sync_complete when the feed is exhausted.
 */
export async function syncFeedDeep(api: BandcampAPI, fanId: number): Promise<number> {
  const state = await getSyncState(fanId);
  if (!state?.oldestStoryDate) return 0;

  await setSyncing(fanId, true);
  let olderThan = state.oldestStoryDate;
  let totalSynced = 0;

  try {
    while (true) {
      await sleep(DEEP_SYNC_PAGE_DELAY_MS);

      const page = await withRetry(() => api.getFeed({ olderThan }));

      if (page.items.length === 0) break;

      await insertItems(fanId, page.items);
      totalSynced += page.items.length;

      const countRow = await queryOne<{ c: string }>('SELECT COUNT(*) AS c FROM feed_items WHERE fan_id = $1', [fanId]);
      const dbTotal = parseInt(countRow!.c, 10);
      await updateSyncProgress(fanId, page.oldestStoryDate, page.newestStoryDate, dbTotal);

      if (!page.hasMore) break;
      if (page.oldestStoryDate >= olderThan) break;
      olderThan = page.oldestStoryDate;
    }

    await setDeepSyncComplete(fanId);
  } finally {
    await setSyncing(fanId, false);
  }

  return totalSynced;
}

async function setCollectionSynced(fanId: number) {
  await execute(
    'UPDATE sync_state SET collection_synced = true WHERE fan_id = $1',
    [fanId],
  );
}

async function enrichPurchaseTags(fanId: number) {
  await execute(`
    UPDATE feed_items SET tags = (
      SELECT f2.tags FROM feed_items f2
      WHERE f2.fan_id = feed_items.fan_id
        AND f2.album_id = feed_items.album_id
        AND f2.story_type != 'my_purchase'
        AND f2.tags != '[]'::jsonb
      LIMIT 1
    )
    WHERE fan_id = $1
      AND story_type = 'my_purchase'
      AND tags = '[]'::jsonb
      AND album_id IN (
        SELECT DISTINCT f3.album_id FROM feed_items f3
        WHERE f3.fan_id = $2 AND f3.story_type != 'my_purchase' AND f3.tags != '[]'::jsonb
      )
  `, [fanId, fanId]);
}

const COLLECTION_PAGE_DELAY_MS = 500;

/**
 * Full collection sync: pages through all purchased items from newest to oldest,
 * storing them as feed items with story_type='my_purchase'.
 */
export async function syncCollection(api: BandcampAPI, fanId: number): Promise<number> {
  await setSyncing(fanId, true);
  let lastToken: string | undefined;
  let totalSynced = 0;

  try {
    while (true) {
      await sleep(COLLECTION_PAGE_DELAY_MS);

      const page = await withRetry(() => api.getCollection({
        olderThanToken: lastToken,
      }));

      if (page.items.length === 0) break;

      await insertItems(fanId, page.items);
      totalSynced += page.items.length;

      const countRow = await queryOne<{ c: string }>('SELECT COUNT(*) AS c FROM feed_items WHERE fan_id = $1', [fanId]);
      const dbTotal = parseInt(countRow!.c, 10);
      const currentState = await getSyncState(fanId);
      await updateSyncProgress(
        fanId,
        currentState?.oldestStoryDate ?? Math.floor(Date.now() / 1000),
        currentState?.newestStoryDate ?? 0,
        dbTotal,
      );

      if (!page.hasMore) break;
      lastToken = page.lastToken;
    }

    await enrichPurchaseTags(fanId);
    await setCollectionSynced(fanId);
  } finally {
    await setSyncing(fanId, false);
  }

  return totalSynced;
}

/**
 * Incremental collection sync: fetches the first page of collection items and
 * compares against the newest my_purchase in the DB. Pages until it hits known items.
 */
export async function syncCollectionIncremental(api: BandcampAPI, fanId: number): Promise<number> {
  const newest = await queryOne<{ date: Date | string }>(
    "SELECT date FROM feed_items WHERE fan_id = $1 AND story_type = 'my_purchase' ORDER BY date DESC LIMIT 1",
    [fanId],
  );

  if (!newest) {
    return syncCollection(api, fanId);
  }

  const newestDate = new Date(newest.date).getTime();
  await setSyncing(fanId, true);
  let lastToken: string | undefined;
  let totalNew = 0;

  try {
    while (true) {
      const page = await withRetry(() => api.getCollection({
        olderThanToken: lastToken,
      }));

      if (page.items.length === 0) break;

      const newItems = page.items.filter(
        (item) => item.date.getTime() > newestDate,
      );

      if (newItems.length > 0) {
        await insertItems(fanId, newItems);
        totalNew += newItems.length;
      }

      if (newItems.length < page.items.length) break;
      if (!page.hasMore) break;
      lastToken = page.lastToken;
    }

    if (totalNew > 0) await enrichPurchaseTags(fanId);

    const countRow = await queryOne<{ c: string }>('SELECT COUNT(*) AS c FROM feed_items WHERE fan_id = $1', [fanId]);
    const dbTotal = parseInt(countRow!.c, 10);
    const state = await getSyncState(fanId);
    if (state) {
      await updateSyncProgress(fanId, state.oldestStoryDate ?? Math.floor(Date.now() / 1000), state.newestStoryDate ?? 0, dbTotal);
    }
  } finally {
    await setSyncing(fanId, false);
  }

  return totalNew;
}

async function setWishlistSynced(fanId: number) {
  await execute(
    'UPDATE sync_state SET wishlist_synced = true WHERE fan_id = $1',
    [fanId],
  );
}

const UPSERT_WISHLIST_ITEM = `
  INSERT INTO wishlist_items (
    id, fan_id, tralbum_id, tralbum_type, title,
    artist_name, artist_url, image_url, item_url,
    featured_track_title, featured_track_duration, stream_url,
    also_collected_count, is_preorder, tags
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
  ON CONFLICT(id, fan_id) DO UPDATE SET
    tralbum_id = excluded.tralbum_id,
    tralbum_type = excluded.tralbum_type,
    title = excluded.title,
    artist_name = excluded.artist_name,
    artist_url = excluded.artist_url,
    image_url = excluded.image_url,
    item_url = excluded.item_url,
    featured_track_title = excluded.featured_track_title,
    featured_track_duration = excluded.featured_track_duration,
    stream_url = excluded.stream_url,
    also_collected_count = excluded.also_collected_count,
    is_preorder = excluded.is_preorder,
    synced_at = NOW(),
    tags = CASE WHEN wishlist_items.tags != '[]'::jsonb THEN wishlist_items.tags ELSE excluded.tags END
`;

async function insertWishlistItems(fanId: number, items: WishlistItem[]) {
  await transaction(async (client) => {
    for (const item of items) {
      await client.query(UPSERT_WISHLIST_ITEM, [
        item.id,
        fanId,
        item.tralbumId,
        item.tralbumType,
        item.title,
        item.artistName,
        item.artistUrl,
        item.imageUrl,
        item.itemUrl,
        item.featuredTrackTitle,
        item.featuredTrackDuration,
        item.streamUrl,
        item.alsoCollectedCount,
        item.isPreorder,
        JSON.stringify(item.tags ?? []),
      ]);
    }
  });
}

async function ensureWishlistCrate(fanId: number): Promise<number> {
  return await ensureCrateBySource(fanId, 'bandcamp_wishlist', 'Bandcamp Wishlist');
}

const WISHLIST_PAGE_DELAY_MS = 500;

/**
 * Full wishlist sync: pages through Bandcamp wishlist items and upserts them
 * into wishlist_items. Creates the bandcamp_wishlist crate if needed.
 */
export async function syncWishlist(api: BandcampAPI, fanId: number): Promise<number> {
  await setSyncing(fanId, true);
  let lastToken: string | undefined;
  let totalSynced = 0;
  const syncedIds = new Set<string>();

  try {
    await ensureWishlistCrate(fanId);

    while (true) {
      await sleep(WISHLIST_PAGE_DELAY_MS);

      const page = await withRetry(() => api.getWishlist({
        olderThanToken: lastToken,
      }));

      if (page.items.length === 0) break;

      await insertWishlistItems(fanId, page.items);
      for (const item of page.items) syncedIds.add(item.id);
      totalSynced += page.items.length;

      if (!page.hasMore) break;
      lastToken = page.lastToken;
    }

    if (syncedIds.size > 0) {
      await deleteStaleWishlistItems(fanId, syncedIds);
    }

    await setWishlistSynced(fanId);
  } finally {
    await setSyncing(fanId, false);
  }

  return totalSynced;
}

async function deleteStaleWishlistItems(fanId: number, keepIds: Set<string>) {
  if (keepIds.size === 0) return;
  const ids = [...keepIds];
  const BATCH_SIZE = 500;

  if (ids.length <= BATCH_SIZE) {
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
    await execute(
      `DELETE FROM wishlist_items WHERE fan_id = $1 AND id NOT IN (${placeholders})`,
      [fanId, ...ids],
    );
  } else {
    const existing = await query<{ id: string }>(
      'SELECT id FROM wishlist_items WHERE fan_id = $1',
      [fanId],
    );
    const toDelete = existing.filter((row) => !keepIds.has(row.id));
    if (toDelete.length === 0) return;
    await transaction(async (client) => {
      for (const row of toDelete) {
        await client.query('DELETE FROM wishlist_items WHERE fan_id = $1 AND id = $2', [fanId, row.id]);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Tag enrichment queue
// ---------------------------------------------------------------------------

/**
 * Populate the enrichment queue with album URLs from purchases missing tags
 * and all wishlist items. Resets previously failed items so they get retried.
 */
export async function enqueueForEnrichment(fanId: number): Promise<number> {
  return await transaction(async (client) => {
    const { rows: purchases } = await client.query(
      `SELECT DISTINCT album_url FROM feed_items
       WHERE fan_id = $1 AND story_type = 'my_purchase' AND tags = '[]'::jsonb AND album_url != ''`,
      [fanId],
    );

    const { rows: wishlist } = await client.query(
      `SELECT DISTINCT item_url FROM wishlist_items
       WHERE fan_id = $1 AND tags = '[]'::jsonb AND item_url != ''`,
      [fanId],
    );

    let enqueued = 0;

    for (const row of purchases) {
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

    return enqueued;
  });
}

/**
 * Returns the number of items still needing tag enrichment: items with empty
 * tags, non-empty URLs, and whose URLs have NOT already been attempted in the
 * enrichment queue (any status). This prevents endless retriggers for albums
 * that genuinely have no tags or that repeatedly fail to scrape.
 */
export async function getEnrichmentPendingCount(fanId: number): Promise<number> {
  const purchases = await queryOne<{ c: string }>(`
    SELECT COUNT(*) AS c FROM feed_items fi
    WHERE fi.fan_id = $1 AND fi.story_type = 'my_purchase' AND fi.tags = '[]'::jsonb
      AND fi.album_url != ''
      AND NOT EXISTS (SELECT 1 FROM enrichment_queue eq WHERE eq.album_url = fi.album_url)
  `, [fanId]);
  const wishlist = await queryOne<{ c: string }>(`
    SELECT COUNT(*) AS c FROM wishlist_items wi
    WHERE wi.fan_id = $1 AND wi.tags = '[]'::jsonb
      AND wi.item_url != ''
      AND NOT EXISTS (SELECT 1 FROM enrichment_queue eq WHERE eq.album_url = wi.item_url)
  `, [fanId]);
  return parseInt(purchases!.c, 10) + parseInt(wishlist!.c, 10);
}

const ENRICHMENT_DELAY_MS = 1000;

/**
 * Process pending items from the enrichment queue: fetch each album page,
 * extract tags, cache in catalog_releases/catalog_tracks, and backfill tags
 * to feed_items and wishlist_items.
 */
export async function processEnrichmentQueue(
  onProgress?: (processed: number, remaining: number) => void,
): Promise<number> {
  const pending = await query<{ album_url: string }>(
    "SELECT album_url FROM enrichment_queue WHERE status = 'pending' ORDER BY created_at ASC",
  );

  if (pending.length === 0) return 0;

  let processed = 0;

  for (const { album_url } of pending) {
    try {
      const album = await withRetry(() => fetchAlbumTracks(publicFetcher, album_url));
      const tagsJson = JSON.stringify(album.tags ?? []);

      const slug = extractSlug(new URL(album_url).origin);
      const releaseId = await ensureCatalogRelease(
        album_url,
        album.artist,
        slug,
        album.title,
        album.imageUrl,
      );
      await cacheAlbumTracks(
        releaseId,
        album.tracks.map((t) => ({
          trackNum: t.trackNum,
          title: t.title,
          duration: t.duration,
          streamUrl: t.streamUrl,
          trackUrl: t.trackUrl,
        })),
        album.releaseDate,
        album.tags,
      );

      await execute("UPDATE feed_items SET tags = $1::jsonb WHERE album_url = $2 AND tags = '[]'::jsonb", [tagsJson, album_url]);
      await execute("UPDATE wishlist_items SET tags = $1::jsonb WHERE item_url = $2 AND tags = '[]'::jsonb", [tagsJson, album_url]);
      await execute("UPDATE enrichment_queue SET status = 'done', processed_at = NOW() WHERE album_url = $1", [album_url]);
    } catch (err) {
      console.error(`Enrichment failed for ${album_url}:`, err);
      await execute("UPDATE enrichment_queue SET status = 'failed', processed_at = NOW() WHERE album_url = $1", [album_url]);
    }

    processed++;
    onProgress?.(processed, pending.length - processed);

    if (processed < pending.length) {
      await sleep(ENRICHMENT_DELAY_MS);
    }
  }

  return processed;
}

// ---------------------------------------------------------------------------
// Audio analysis queue (BPM + key detection)
// ---------------------------------------------------------------------------

export async function getAudioAnalysisPendingCount(): Promise<number> {
  const row = await queryOne<{ c: string }>(
    "SELECT COUNT(*) AS c FROM catalog_tracks WHERE stream_url IS NOT NULL AND stream_url != '' AND bpm_status IS NULL",
  );
  return parseInt(row!.c, 10);
}

export async function getAudioAnalysisDoneCount(): Promise<number> {
  const row = await queryOne<{ c: string }>(
    "SELECT COUNT(*) AS c FROM catalog_tracks WHERE bpm_status = 'done'",
  );
  return parseInt(row!.c, 10);
}
