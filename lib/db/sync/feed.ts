/**
 * Feed sync operations: initial, incremental, and deep-history syncing.
 * All three variants page through the Bandcamp feed API and persist items
 * to the feed_items table via insertItems.
 */
import { query, queryOne, execute } from '../index';
import type { BandcampAPI } from '@/lib/bandcamp/api';
import { sleep } from '../utils';
import { withRetry, insertItems, getSyncState, setSyncing, updateSyncProgress } from './helpers';

const SIX_MONTHS_SECONDS = 180 * 24 * 60 * 60;

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

      const ids = page.items.map((item) => item.id);
      const existing = await query<{ id: string }>(
        'SELECT id FROM feed_items WHERE fan_id = $1 AND id = ANY($2)',
        [fanId, ids],
      );
      const existingIds = new Set(existing.map((r) => r.id));
      const newItems = page.items.filter((item) => !existingIds.has(item.id));

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

const DEEP_SYNC_PAGE_DELAY_MS = 500;

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

    await execute('UPDATE sync_state SET deep_sync_complete = true WHERE fan_id = $1', [fanId]);
  } finally {
    await setSyncing(fanId, false);
  }

  return totalSynced;
}
