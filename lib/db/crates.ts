import { getDb } from './index';
import { rowToFeedItem } from './queries';
import type { FeedItemRow } from './queries';
import type { FeedItem, WishlistItem } from '@/lib/bandcamp/types/domain';

export interface Crate {
  id: number;
  fanId: number;
  name: string;
  source: 'user' | 'bandcamp_wishlist';
  createdAt: string;
}

export interface CrateCatalogItem {
  crateItemId: string;
  trackId: number;
  trackTitle: string;
  trackDuration: number;
  streamUrl: string | null;
  trackUrl: string | null;
  releaseTitle: string;
  releaseUrl: string;
  imageUrl: string;
  bandName: string;
  bandUrl: string;
}

const CATALOG_PREFIX = 'catalog-track-';

export function getCrates(fanId: number): Crate[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, fan_id, name, source, created_at FROM crates WHERE fan_id = ? ORDER BY created_at ASC',
  ).all(fanId) as Array<{ id: number; fan_id: number; name: string; source: string; created_at: string }>;
  return rows.map((r) => ({
    id: r.id,
    fanId: r.fan_id,
    name: r.name,
    source: r.source as Crate['source'],
    createdAt: r.created_at,
  }));
}

const MAX_CRATE_NAME_LENGTH = 64;
const MAX_USER_CRATES = 100;

export function createCrate(fanId: number, name: string): number {
  const db = getDb();
  const count = db.prepare(
    "SELECT COUNT(*) AS c FROM crates WHERE fan_id = ? AND source = 'user'",
  ).get(fanId) as { c: number };
  if (count.c >= MAX_USER_CRATES) {
    throw new Error(`Cannot create more than ${MAX_USER_CRATES} crates`);
  }
  const result = db.prepare(
    'INSERT INTO crates (fan_id, name, source) VALUES (?, ?, ?)',
  ).run(fanId, name.slice(0, MAX_CRATE_NAME_LENGTH), 'user');
  return Number(result.lastInsertRowid);
}

export function renameCrate(crateId: number, fanId: number, name: string): void {
  const db = getDb();
  const result = db.prepare('UPDATE crates SET name = ? WHERE id = ? AND fan_id = ?').run(name.slice(0, MAX_CRATE_NAME_LENGTH), crateId, fanId);
  if (result.changes === 0) throw new Error('Crate not found');
}

export function deleteCrate(crateId: number, fanId: number): void {
  const db = getDb();
  const crate = db.prepare('SELECT source FROM crates WHERE id = ? AND fan_id = ?').get(crateId, fanId) as { source: string } | undefined;
  if (!crate) throw new Error('Crate not found');
  if (crate.source === 'bandcamp_wishlist') {
    throw new Error('Cannot delete the Bandcamp wishlist crate');
  }
  db.prepare('DELETE FROM crates WHERE id = ? AND fan_id = ?').run(crateId, fanId);
}

export function ensureCrateBySource(fanId: number, source: string, defaultName: string): number {
  const db = getDb();
  const existing = db.prepare(
    'SELECT id FROM crates WHERE fan_id = ? AND source = ? ORDER BY created_at ASC LIMIT 1',
  ).get(fanId, source) as { id: number } | undefined;
  if (existing) return existing.id;
  const result = db.prepare(
    'INSERT INTO crates (fan_id, name, source) VALUES (?, ?, ?)',
  ).run(fanId, defaultName, source);
  return Number(result.lastInsertRowid);
}

export function ensureDefaultCrate(fanId: number): number {
  return ensureCrateBySource(fanId, 'user', 'My Crate');
}

export function getCrateItems(crateId: number, fanId: number): FeedItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT fi.* FROM crate_items ci
    JOIN feed_items fi ON fi.id = ci.feed_item_id AND fi.fan_id = ?
    WHERE ci.crate_id = ?
    ORDER BY ci.added_at DESC
  `).all(fanId, crateId) as FeedItemRow[];
  return rows.map(rowToFeedItem);
}

export function getCrateCatalogItems(crateId: number, fanId: number): CrateCatalogItem[] {
  const db = getDb();
  const owns = db.prepare('SELECT 1 FROM crates WHERE id = ? AND fan_id = ?').get(crateId, fanId);
  if (!owns) return [];
  const rows = db.prepare(`
    SELECT ci.feed_item_id, ct.id as track_id, ct.title as track_title,
           ct.duration, ct.stream_url, ct.track_url, cr.title as release_title,
           cr.url as release_url, cr.image_url, cr.band_name, cr.band_url
    FROM crate_items ci
    JOIN catalog_tracks ct ON ct.id = CAST(SUBSTR(ci.feed_item_id, ${CATALOG_PREFIX.length + 1}) AS INTEGER)
    JOIN catalog_releases cr ON cr.id = ct.release_id
    WHERE ci.crate_id = ? AND ci.feed_item_id LIKE '${CATALOG_PREFIX}%'
    ORDER BY ci.added_at DESC
  `).all(crateId) as Array<{
    feed_item_id: string;
    track_id: number;
    track_title: string;
    duration: number;
    stream_url: string | null;
    track_url: string | null;
    release_title: string;
    release_url: string;
    image_url: string;
    band_name: string;
    band_url: string;
  }>;

  return rows.map((r) => ({
    crateItemId: r.feed_item_id,
    trackId: r.track_id,
    trackTitle: r.track_title,
    trackDuration: r.duration,
    streamUrl: r.stream_url,
    trackUrl: r.track_url,
    releaseTitle: r.release_title,
    releaseUrl: r.release_url,
    imageUrl: r.image_url,
    bandName: r.band_name,
    bandUrl: r.band_url,
  }));
}

export function catalogTrackCrateItemId(trackId: number): string {
  return `${CATALOG_PREFIX}${trackId}`;
}

export function addToCrate(crateId: number, fanId: number, feedItemId: string): void {
  const db = getDb();
  const owns = db.prepare('SELECT 1 FROM crates WHERE id = ? AND fan_id = ?').get(crateId, fanId);
  if (!owns) throw new Error('Crate not found');
  db.prepare(
    'INSERT OR IGNORE INTO crate_items (crate_id, feed_item_id) VALUES (?, ?)',
  ).run(crateId, feedItemId);
}

export function removeFromCrate(crateId: number, fanId: number, feedItemId: string): void {
  const db = getDb();
  const owns = db.prepare('SELECT 1 FROM crates WHERE id = ? AND fan_id = ?').get(crateId, fanId);
  if (!owns) throw new Error('Crate not found');
  db.prepare(
    'DELETE FROM crate_items WHERE crate_id = ? AND feed_item_id = ?',
  ).run(crateId, feedItemId);
}

export function getItemCrates(fanId: number, feedItemId: string): number[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT ci.crate_id FROM crate_items ci
    JOIN crates c ON c.id = ci.crate_id
    WHERE c.fan_id = ? AND ci.feed_item_id = ?
  `).all(fanId, feedItemId) as Array<{ crate_id: number }>;
  return rows.map((r) => r.crate_id);
}

export function getItemCrateMultiMap(fanId: number): Record<string, number[]> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT ci.feed_item_id, ci.crate_id FROM crate_items ci
    JOIN crates c ON c.id = ci.crate_id
    WHERE c.fan_id = ?
  `).all(fanId) as Array<{ feed_item_id: string; crate_id: number }>;
  const map: Record<string, number[]> = {};
  for (const r of rows) {
    (map[r.feed_item_id] ??= []).push(r.crate_id);
  }
  return map;
}

export function clearCrate(crateId: number, fanId: number): void {
  const db = getDb();
  const owns = db.prepare('SELECT 1 FROM crates WHERE id = ? AND fan_id = ?').get(crateId, fanId);
  if (!owns) throw new Error('Crate not found');
  db.prepare('DELETE FROM crate_items WHERE crate_id = ?').run(crateId);
}

export function getCrateWishlistItems(crateId: number, fanId: number): WishlistItem[] {
  const db = getDb();
  const owns = db.prepare('SELECT 1 FROM crates WHERE id = ? AND fan_id = ?').get(crateId, fanId);
  if (!owns) return [];
  const rows = db.prepare(`
    SELECT wi.id, wi.tralbum_id, wi.tralbum_type, wi.title, wi.artist_name, wi.artist_url,
           wi.image_url, wi.item_url, wi.featured_track_title, wi.featured_track_duration,
           wi.stream_url, wi.also_collected_count, wi.is_preorder, wi.tags
    FROM crate_items ci
    JOIN wishlist_items wi ON wi.id = ci.feed_item_id AND wi.fan_id = ?
    WHERE ci.crate_id = ?
    ORDER BY ci.added_at DESC
  `).all(fanId, crateId) as Array<{
    id: string;
    tralbum_id: number;
    tralbum_type: string;
    title: string;
    artist_name: string;
    artist_url: string;
    image_url: string;
    item_url: string;
    featured_track_title: string | null;
    featured_track_duration: number | null;
    stream_url: string | null;
    also_collected_count: number;
    is_preorder: number;
    tags: string;
  }>;
  return rows.map(rowToWishlistItem);
}

function rowToWishlistItem(r: {
  id: string;
  tralbum_id: number;
  tralbum_type: string;
  title: string;
  artist_name: string;
  artist_url: string;
  image_url: string;
  item_url: string;
  featured_track_title: string | null;
  featured_track_duration: number | null;
  stream_url: string | null;
  also_collected_count: number;
  is_preorder: number;
  tags: string;
}): WishlistItem {
  let tags: string[] = [];
  try { tags = JSON.parse(r.tags || '[]'); } catch { tags = []; }
  return {
    id: r.id,
    tralbumId: r.tralbum_id,
    tralbumType: r.tralbum_type as 'a' | 't',
    title: r.title,
    artistName: r.artist_name,
    artistUrl: r.artist_url,
    imageUrl: r.image_url,
    itemUrl: r.item_url,
    featuredTrackTitle: r.featured_track_title,
    featuredTrackDuration: r.featured_track_duration,
    streamUrl: r.stream_url,
    alsoCollectedCount: r.also_collected_count,
    isPreorder: r.is_preorder === 1,
    tags,
  };
}

export function getWishlistItems(fanId: number): WishlistItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, tralbum_id, tralbum_type, title, artist_name, artist_url,
           image_url, item_url, featured_track_title, featured_track_duration,
           stream_url, also_collected_count, is_preorder, tags
    FROM wishlist_items WHERE fan_id = ?
    ORDER BY synced_at DESC
  `).all(fanId) as Parameters<typeof rowToWishlistItem>[0][];
  return rows.map(rowToWishlistItem);
}

export function getWishlistItemCount(fanId: number): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) AS c FROM wishlist_items WHERE fan_id = ?').get(fanId) as { c: number };
  return row.c;
}

/** Returns all item IDs across all crates for a fan. */
export function getAllCrateItemIds(fanId: number): Set<string> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT ci.feed_item_id FROM crate_items ci
    JOIN crates c ON c.id = ci.crate_id
    WHERE c.fan_id = ?
  `).all(fanId) as { feed_item_id: string }[];
  return new Set(rows.map((r) => r.feed_item_id));
}
