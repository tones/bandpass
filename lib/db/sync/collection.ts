/**
 * Collection (purchased items) sync: full and incremental variants.
 * Stores purchases as feed_items with story_type='my_purchase'.
 */
import { queryOne, execute } from '../index';
import type { BandcampAPI } from '@/lib/bandcamp/api';
import { sleep } from '../utils';
import { withRetry, insertItems, getSyncState, setSyncing, updateSyncProgress } from './helpers';

const COLLECTION_PAGE_DELAY_MS = 500;

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

    await execute('UPDATE sync_state SET collection_synced = true WHERE fan_id = $1', [fanId]);
  } finally {
    await setSyncing(fanId, false);
  }

  return totalSynced;
}

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
