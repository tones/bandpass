import { getDb } from './index';
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
  INSERT OR REPLACE INTO feed_items (
    id, fan_id, story_type, date,
    album_id, album_title, album_url, album_image_url,
    artist_id, artist_name, artist_url,
    track_title, track_duration, track_stream_url,
    tags, price_amount, price_currency,
    fan_name, fan_username, also_collected_count
  ) VALUES (
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?
  )
`;

function insertItems(fanId: number, items: FeedItem[]) {
  const db = getDb();
  const stmt = db.prepare(INSERT_ITEM);
  const tx = db.transaction((batch: FeedItem[]) => {
    for (const item of batch) {
      stmt.run(
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
      );
    }
  });
  tx(items);
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

export function getSyncState(fanId: number): SyncState | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM sync_state WHERE fan_id = ?')
    .get(fanId) as {
    fan_id: number;
    oldest_story_date: number | null;
    newest_story_date: number | null;
    total_items: number;
    is_syncing: number;
    last_sync_at: string | null;
    deep_sync_complete: number;
    collection_synced: number;
    wishlist_synced: number;
  } | undefined;

  if (!row) return null;
  return {
    fanId: row.fan_id,
    oldestStoryDate: row.oldest_story_date,
    newestStoryDate: row.newest_story_date,
    totalItems: row.total_items,
    isSyncing: row.is_syncing === 1,
    lastSyncAt: row.last_sync_at,
    deepSyncComplete: row.deep_sync_complete === 1,
    collectionSynced: row.collection_synced === 1,
    wishlistSynced: row.wishlist_synced === 1,
  };
}

function setSyncing(fanId: number, syncing: boolean) {
  const db = getDb();
  db.prepare(`
    INSERT INTO sync_state (fan_id, is_syncing) VALUES (?, ?)
    ON CONFLICT(fan_id) DO UPDATE SET is_syncing = excluded.is_syncing
  `).run(fanId, syncing ? 1 : 0);
}

function updateSyncProgress(fanId: number, oldestDate: number, newestDate: number, totalItems: number) {
  const db = getDb();
  db.prepare(`
    INSERT INTO sync_state (fan_id, oldest_story_date, newest_story_date, total_items, is_syncing, last_sync_at)
    VALUES (?, ?, ?, ?, 1, datetime('now'))
    ON CONFLICT(fan_id) DO UPDATE SET
      oldest_story_date = CASE
        WHEN excluded.oldest_story_date < COALESCE(sync_state.oldest_story_date, 9999999999)
        THEN excluded.oldest_story_date ELSE sync_state.oldest_story_date END,
      newest_story_date = CASE
        WHEN excluded.newest_story_date > COALESCE(sync_state.newest_story_date, 0)
        THEN excluded.newest_story_date ELSE sync_state.newest_story_date END,
      total_items = excluded.total_items,
      last_sync_at = datetime('now')
  `).run(fanId, oldestDate, newestDate, totalItems);
}

const SIX_MONTHS_SECONDS = 180 * 24 * 60 * 60;

/**
 * Initial sync: pages through the feed history up to 6 months back,
 * storing items as each page arrives. Returns the total number of items synced.
 */
export async function syncFeedInitial(api: BandcampAPI, fanId: number): Promise<number> {
  const db = getDb();
  setSyncing(fanId, true);

  const cutoff = Math.floor(Date.now() / 1000) - SIX_MONTHS_SECONDS;
  let olderThan: number | undefined;
  let totalSynced = 0;

  try {
    while (true) {
      const page = await api.getFeed({ olderThan });

      if (page.items.length === 0) break;

      insertItems(fanId, page.items);
      totalSynced += page.items.length;

      const dbTotal = (db.prepare('SELECT COUNT(*) as c FROM feed_items WHERE fan_id = ?').get(fanId) as { c: number }).c;
      updateSyncProgress(fanId, page.oldestStoryDate, page.newestStoryDate, dbTotal);

      if (!page.hasMore) break;
      if (page.oldestStoryDate >= (olderThan ?? Infinity)) break;
      if (page.oldestStoryDate < cutoff) break;
      olderThan = page.oldestStoryDate;
    }
  } finally {
    setSyncing(fanId, false);
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
  const state = getSyncState(fanId);
  if (!state?.newestStoryDate) {
    return syncFeedInitial(api, fanId);
  }

  const db = getDb();
  setSyncing(fanId, true);
  let totalNew = 0;
  let consecutiveKnownPages = 0;

  const existsStmt = db.prepare(
    'SELECT 1 FROM feed_items WHERE id = ? AND fan_id = ?',
  );

  try {
    let olderThan: number | undefined;

    while (true) {
      const page = await api.getFeed({ olderThan });

      if (page.items.length === 0) break;

      const newItems = page.items.filter(
        (item) => !existsStmt.get(item.id, fanId),
      );

      if (newItems.length > 0) {
        insertItems(fanId, newItems);
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

    const dbTotal = (db.prepare('SELECT COUNT(*) as c FROM feed_items WHERE fan_id = ?').get(fanId) as { c: number }).c;
    const newest = (db.prepare('SELECT MAX(date) as d FROM feed_items WHERE fan_id = ?').get(fanId) as { d: string }).d;
    if (newest) {
      updateSyncProgress(fanId, state.oldestStoryDate!, Math.floor(new Date(newest).getTime() / 1000), dbTotal);
    }
  } finally {
    setSyncing(fanId, false);
  }

  return totalNew;
}

function setDeepSyncComplete(fanId: number) {
  const db = getDb();
  db.prepare(
    'UPDATE sync_state SET deep_sync_complete = 1 WHERE fan_id = ?',
  ).run(fanId);
}

const DEEP_SYNC_PAGE_DELAY_MS = 500;

/**
 * Deep background sync: continues paging backwards from the oldest known item,
 * loading the full feed history. Runs throttled (500ms between pages) with
 * 429 retry. Sets deep_sync_complete when the feed is exhausted.
 */
export async function syncFeedDeep(api: BandcampAPI, fanId: number): Promise<number> {
  const db = getDb();
  const state = getSyncState(fanId);
  if (!state?.oldestStoryDate) return 0;

  setSyncing(fanId, true);
  let olderThan = state.oldestStoryDate;
  let totalSynced = 0;

  try {
    while (true) {
      await sleep(DEEP_SYNC_PAGE_DELAY_MS);

      const page = await withRetry(() => api.getFeed({ olderThan }));

      if (page.items.length === 0) break;

      insertItems(fanId, page.items);
      totalSynced += page.items.length;

      const dbTotal = (db.prepare('SELECT COUNT(*) as c FROM feed_items WHERE fan_id = ?').get(fanId) as { c: number }).c;
      updateSyncProgress(fanId, page.oldestStoryDate, page.newestStoryDate, dbTotal);

      if (!page.hasMore) break;
      if (page.oldestStoryDate >= olderThan) break;
      olderThan = page.oldestStoryDate;
    }

    setDeepSyncComplete(fanId);
  } finally {
    setSyncing(fanId, false);
  }

  return totalSynced;
}

function setCollectionSynced(fanId: number) {
  const db = getDb();
  db.prepare(
    'UPDATE sync_state SET collection_synced = 1 WHERE fan_id = ?',
  ).run(fanId);
}

/**
 * Enrich my_purchase items that have no tags by copying tags from feed items
 * with the same album_id (new_release or friend_purchase items often have tags).
 */
function enrichPurchaseTags(fanId: number) {
  const db = getDb();
  db.prepare(`
    UPDATE feed_items SET tags = (
      SELECT f2.tags FROM feed_items f2
      WHERE f2.fan_id = feed_items.fan_id
        AND f2.album_id = feed_items.album_id
        AND f2.story_type != 'my_purchase'
        AND f2.tags != '[]'
      LIMIT 1
    )
    WHERE fan_id = ?
      AND story_type = 'my_purchase'
      AND tags = '[]'
      AND album_id IN (
        SELECT DISTINCT f3.album_id FROM feed_items f3
        WHERE f3.fan_id = ? AND f3.story_type != 'my_purchase' AND f3.tags != '[]'
      )
  `).run(fanId, fanId);
}

const COLLECTION_PAGE_DELAY_MS = 500;

/**
 * Full collection sync: pages through all purchased items from newest to oldest,
 * storing them as feed items with story_type='my_purchase'.
 */
export async function syncCollection(api: BandcampAPI, fanId: number): Promise<number> {
  const db = getDb();
  setSyncing(fanId, true);
  let lastToken: string | undefined;
  let totalSynced = 0;

  try {
    while (true) {
      await sleep(COLLECTION_PAGE_DELAY_MS);

      const page = await withRetry(() => api.getCollection({
        olderThanToken: lastToken,
      }));

      if (page.items.length === 0) break;

      insertItems(fanId, page.items);
      totalSynced += page.items.length;

      const dbTotal = (db.prepare('SELECT COUNT(*) as c FROM feed_items WHERE fan_id = ?').get(fanId) as { c: number }).c;
      updateSyncProgress(
        fanId,
        getSyncState(fanId)?.oldestStoryDate ?? Math.floor(Date.now() / 1000),
        getSyncState(fanId)?.newestStoryDate ?? 0,
        dbTotal,
      );

      if (!page.hasMore) break;
      lastToken = page.lastToken;
    }

    enrichPurchaseTags(fanId);
    setCollectionSynced(fanId);
  } finally {
    setSyncing(fanId, false);
  }

  return totalSynced;
}

/**
 * Incremental collection sync: fetches the first page of collection items and
 * compares against the newest my_purchase in the DB. Pages until it hits known items.
 */
export async function syncCollectionIncremental(api: BandcampAPI, fanId: number): Promise<number> {
  const db = getDb();

  const newest = db.prepare(
    "SELECT date FROM feed_items WHERE fan_id = ? AND story_type = 'my_purchase' ORDER BY date DESC LIMIT 1",
  ).get(fanId) as { date: string } | undefined;

  if (!newest) {
    return syncCollection(api, fanId);
  }

  const newestDate = new Date(newest.date).getTime();
  setSyncing(fanId, true);
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
        insertItems(fanId, newItems);
        totalNew += newItems.length;
      }

      if (newItems.length < page.items.length) break;
      if (!page.hasMore) break;
      lastToken = page.lastToken;
    }

    if (totalNew > 0) enrichPurchaseTags(fanId);

    const dbTotal = (db.prepare('SELECT COUNT(*) as c FROM feed_items WHERE fan_id = ?').get(fanId) as { c: number }).c;
    const state = getSyncState(fanId);
    if (state) {
      updateSyncProgress(fanId, state.oldestStoryDate ?? Math.floor(Date.now() / 1000), state.newestStoryDate ?? 0, dbTotal);
    }
  } finally {
    setSyncing(fanId, false);
  }

  return totalNew;
}

function setWishlistSynced(fanId: number) {
  const db = getDb();
  db.prepare(
    'UPDATE sync_state SET wishlist_synced = 1 WHERE fan_id = ?',
  ).run(fanId);
}

const UPSERT_WISHLIST_ITEM = `
  INSERT INTO wishlist_items (
    id, fan_id, tralbum_id, tralbum_type, title,
    artist_name, artist_url, image_url, item_url,
    featured_track_title, featured_track_duration, stream_url,
    also_collected_count, is_preorder, tags
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    synced_at = datetime('now'),
    tags = CASE WHEN wishlist_items.tags != '[]' THEN wishlist_items.tags ELSE excluded.tags END
`;

function insertWishlistItems(fanId: number, items: WishlistItem[]) {
  const db = getDb();
  const stmt = db.prepare(UPSERT_WISHLIST_ITEM);
  const tx = db.transaction((batch: WishlistItem[]) => {
    for (const item of batch) {
      stmt.run(
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
        item.isPreorder ? 1 : 0,
        JSON.stringify(item.tags ?? []),
      );
    }
  });
  tx(items);
}

function ensureWishlistCrate(fanId: number): number {
  return ensureCrateBySource(fanId, 'bandcamp_wishlist', 'Bandcamp Wishlist');
}

const WISHLIST_PAGE_DELAY_MS = 500;

/**
 * Full wishlist sync: pages through Bandcamp wishlist items and upserts them
 * into wishlist_items. Creates the bandcamp_wishlist crate if needed.
 */
export async function syncWishlist(api: BandcampAPI, fanId: number): Promise<number> {
  setSyncing(fanId, true);
  let lastToken: string | undefined;
  let totalSynced = 0;
  const syncedIds = new Set<string>();

  try {
    ensureWishlistCrate(fanId);

    while (true) {
      await sleep(WISHLIST_PAGE_DELAY_MS);

      const page = await withRetry(() => api.getWishlist({
        olderThanToken: lastToken,
      }));

      if (page.items.length === 0) break;

      insertWishlistItems(fanId, page.items);
      for (const item of page.items) syncedIds.add(item.id);
      totalSynced += page.items.length;

      if (!page.hasMore) break;
      lastToken = page.lastToken;
    }

    if (syncedIds.size > 0) {
      deleteStaleWishlistItems(fanId, syncedIds);
    }

    setWishlistSynced(fanId);
  } finally {
    setSyncing(fanId, false);
  }

  return totalSynced;
}

function deleteStaleWishlistItems(fanId: number, keepIds: Set<string>) {
  if (keepIds.size === 0) return;
  const db = getDb();
  const ids = [...keepIds];
  const BATCH_SIZE = 500;
  const del = db.prepare('DELETE FROM wishlist_items WHERE fan_id = ? AND id = ?');

  if (ids.length <= BATCH_SIZE) {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(
      `DELETE FROM wishlist_items WHERE fan_id = ? AND id NOT IN (${placeholders})`,
    ).run(fanId, ...ids);
  } else {
    const existing = db.prepare(
      'SELECT id FROM wishlist_items WHERE fan_id = ?',
    ).all(fanId) as Array<{ id: string }>;
    const toDelete = existing.filter((row) => !keepIds.has(row.id));
    if (toDelete.length === 0) return;
    const tx = db.transaction(() => {
      for (const row of toDelete) del.run(fanId, row.id);
    });
    tx();
  }
}

// ---------------------------------------------------------------------------
// Tag enrichment queue
// ---------------------------------------------------------------------------

/**
 * Populate the enrichment queue with album URLs from purchases missing tags
 * and all wishlist items. Resets previously failed items so they get retried.
 */
export function enqueueForEnrichment(fanId: number): number {
  const db = getDb();

  const insert = db.prepare(
    "INSERT OR IGNORE INTO enrichment_queue (album_url) VALUES (?)",
  );

  let enqueued = 0;
  const tx = db.transaction(() => {
    const purchases = db.prepare(`
      SELECT DISTINCT album_url FROM feed_items
      WHERE fan_id = ? AND story_type = 'my_purchase' AND tags = '[]' AND album_url != ''
    `).all(fanId) as Array<{ album_url: string }>;

    const wishlist = db.prepare(`
      SELECT DISTINCT item_url FROM wishlist_items
      WHERE fan_id = ? AND tags = '[]' AND item_url != ''
    `).all(fanId) as Array<{ item_url: string }>;

    const fanUrls = new Set([
      ...purchases.map((r) => r.album_url),
      ...wishlist.map((r) => r.item_url),
    ]);

    if (fanUrls.size > 0) {
      const placeholders = [...fanUrls].map(() => '?').join(',');
      db.prepare(
        `UPDATE enrichment_queue SET status = 'pending', processed_at = NULL
         WHERE status = 'failed' AND album_url IN (${placeholders})`,
      ).run(...fanUrls);
    }

    for (const row of purchases) {
      const result = insert.run(row.album_url);
      if (result.changes > 0) enqueued++;
    }

    for (const row of wishlist) {
      const result = insert.run(row.item_url);
      if (result.changes > 0) enqueued++;
    }
  });
  tx();

  return enqueued;
}

/**
 * Returns the number of items still needing tag enrichment: items with empty
 * tags, non-empty URLs, and whose URLs have NOT already been attempted in the
 * enrichment queue (any status). This prevents endless retriggers for albums
 * that genuinely have no tags or that repeatedly fail to scrape.
 */
export function getEnrichmentPendingCount(fanId: number): number {
  const db = getDb();
  const purchases = db.prepare(`
    SELECT COUNT(*) AS c FROM feed_items fi
    WHERE fi.fan_id = ? AND fi.story_type = 'my_purchase' AND fi.tags = '[]'
      AND fi.album_url != ''
      AND NOT EXISTS (SELECT 1 FROM enrichment_queue eq WHERE eq.album_url = fi.album_url)
  `).get(fanId) as { c: number };
  const wishlist = db.prepare(`
    SELECT COUNT(*) AS c FROM wishlist_items wi
    WHERE wi.fan_id = ? AND wi.tags = '[]'
      AND wi.item_url != ''
      AND NOT EXISTS (SELECT 1 FROM enrichment_queue eq WHERE eq.album_url = wi.item_url)
  `).get(fanId) as { c: number };
  return purchases.c + wishlist.c;
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
  const db = getDb();

  const pending = db.prepare(
    "SELECT album_url FROM enrichment_queue WHERE status = 'pending' ORDER BY created_at ASC",
  ).all() as Array<{ album_url: string }>;

  if (pending.length === 0) return 0;

  const markDone = db.prepare(
    "UPDATE enrichment_queue SET status = 'done', processed_at = datetime('now') WHERE album_url = ?",
  );
  const markFailed = db.prepare(
    "UPDATE enrichment_queue SET status = 'failed', processed_at = datetime('now') WHERE album_url = ?",
  );
  const updateFeedTags = db.prepare(
    "UPDATE feed_items SET tags = ? WHERE album_url = ? AND tags = '[]'",
  );
  const updateWishlistTags = db.prepare(
    "UPDATE wishlist_items SET tags = ? WHERE item_url = ? AND tags = '[]'",
  );

  let processed = 0;

  for (const { album_url } of pending) {
    try {
      const album = await withRetry(() => fetchAlbumTracks(publicFetcher, album_url));
      const tagsJson = JSON.stringify(album.tags ?? []);

      const slug = extractSlug(new URL(album_url).origin);
      const releaseId = ensureCatalogRelease(
        album_url,
        album.artist,
        slug,
        album.title,
        album.imageUrl,
      );
      cacheAlbumTracks(
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

      updateFeedTags.run(tagsJson, album_url);
      updateWishlistTags.run(tagsJson, album_url);
      markDone.run(album_url);
    } catch (err) {
      console.error(`Enrichment failed for ${album_url}:`, err);
      markFailed.run(album_url);
    }

    processed++;
    onProgress?.(processed, pending.length - processed);

    if (processed < pending.length) {
      await sleep(ENRICHMENT_DELAY_MS);
    }
  }

  return processed;
}
