import { getDb } from './index';
import { BandcampAPI } from '@/lib/bandcamp/api';
import type { FeedItem } from '@/lib/bandcamp/types/domain';

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
  } | undefined;

  if (!row) return null;
  return {
    fanId: row.fan_id,
    oldestStoryDate: row.oldest_story_date,
    newestStoryDate: row.newest_story_date,
    totalItems: row.total_items,
    isSyncing: row.is_syncing === 1,
    lastSyncAt: row.last_sync_at,
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
 * Full backward sync: pages through the feed history up to 6 months back,
 * storing items as each page arrives. Returns the total number of items synced.
 */
export async function syncFeedFull(api: BandcampAPI, fanId: number): Promise<number> {
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
    return syncFeedFull(api, fanId);
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
