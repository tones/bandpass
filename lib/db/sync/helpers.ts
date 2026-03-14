/**
 * Shared helpers for sync operations: retry logic, feed-item insertion,
 * sync_state reads/writes, and progress tracking. Used by feed.ts,
 * collection.ts, wishlist.ts, and enrichment.ts.
 */
import { query, queryOne, execute, transaction } from '../index';
import type { FeedItem } from '@/lib/bandcamp/types/domain';
import { sleep } from '../utils';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 5000;

/** Retries fn on 429 (rate-limit) errors with exponential backoff. */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
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
    fan_name, fan_username, also_collected_count,
    bandcamp_track_id,
    release_id, track_id
  ) VALUES (
    $1, $2, $3, $4,
    $5, $6, $7, $8,
    $9, $10, $11,
    $12, $13, $14,
    $15::jsonb, $16, $17,
    $18, $19, $20,
    $21,
    (SELECT id FROM catalog_releases WHERE bandcamp_id = $5 LIMIT 1),
    (SELECT id FROM catalog_tracks WHERE bandcamp_track_id = $21 LIMIT 1)
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
    also_collected_count = excluded.also_collected_count,
    bandcamp_track_id = COALESCE(excluded.bandcamp_track_id, feed_items.bandcamp_track_id),
    release_id = COALESCE(excluded.release_id, feed_items.release_id),
    track_id = COALESCE(excluded.track_id, feed_items.track_id)
`;

/**
 * Upsert a batch of feed items into the database. Links each item to its
 * catalog_release/catalog_track via Bandcamp IDs when available, using
 * COALESCE to preserve existing FK links on conflict.
 */
export async function insertItems(fanId: number, items: FeedItem[]) {
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
        item.track?.bandcampTrackId ?? null,
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

export async function setSyncing(fanId: number, syncing: boolean) {
  await execute(`
    INSERT INTO sync_state (fan_id, is_syncing) VALUES ($1, $2)
    ON CONFLICT(fan_id) DO UPDATE SET is_syncing = excluded.is_syncing
  `, [fanId, syncing]);
}

export async function updateSyncProgress(fanId: number, oldestDate: number, newestDate: number, totalItems: number) {
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
