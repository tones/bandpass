/**
 * Wishlist sync: pages through the Bandcamp wishlist API, upserts items
 * into wishlist_items, removes stale entries, and ensures the
 * bandcamp_wishlist crate exists.
 */
import { query, execute, transaction } from '../index';
import type { BandcampAPI } from '@/lib/bandcamp/api';
import type { WishlistItem } from '@/lib/bandcamp/types/domain';
import { sleep } from '../utils';
import { ensureCrateBySource } from '../crates';
import { withRetry, setSyncing } from './helpers';

const UPSERT_WISHLIST_ITEM = `
  INSERT INTO wishlist_items (
    id, fan_id, tralbum_id, tralbum_type, title,
    artist_name, artist_url, image_url, item_url,
    featured_track_title, featured_track_duration, stream_url,
    also_collected_count, is_preorder, tags,
    release_id
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb,
    (SELECT id FROM catalog_releases WHERE bandcamp_id = $3 LIMIT 1))
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
    tags = CASE WHEN wishlist_items.tags != '[]'::jsonb THEN wishlist_items.tags ELSE excluded.tags END,
    release_id = COALESCE(excluded.release_id, wishlist_items.release_id)
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

const WISHLIST_PAGE_DELAY_MS = 500;

export async function syncWishlist(api: BandcampAPI, fanId: number): Promise<number> {
  await setSyncing(fanId, true);
  let lastToken: string | undefined;
  let totalSynced = 0;
  const syncedIds = new Set<string>();

  try {
    await ensureCrateBySource(fanId, 'bandcamp_wishlist', 'Bandcamp Wishlist');

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

    await execute('UPDATE sync_state SET wishlist_synced = true WHERE fan_id = $1', [fanId]);
  } finally {
    await setSyncing(fanId, false);
  }

  return totalSynced;
}
