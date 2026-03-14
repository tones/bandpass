/**
 * Crate CRUD and item management. Crates are user-created or system-created
 * (bandcamp_wishlist) collections of feed items, catalog tracks, catalog
 * releases, and wishlist items. Items are referenced by string IDs in
 * crate_items (feed item ID, "catalog-track-{id}", or "catalog-release-{id}").
 * Wishlist query functions live in ./wishlist.ts and are re-exported here.
 */
import { query, queryOne, execute } from './index';
import { rowToFeedItem } from './queries';
import { safeParseTags, tagsWithFallback } from './utils';
import type { FeedItemRow } from './queries';
import type { FeedItem } from '@/lib/bandcamp/types/domain';
import type { CatalogTrack, CatalogTrackRow } from './catalog';
import { rowToTrack } from './catalog';

export {
  getCrateWishlistItems,
  getWishlistItems,
  getWishlistItemCount,
  getWishlistAlbumTracks,
} from './wishlist';
export type { WishlistAlbumData } from './wishlist';

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
  bpm: number | null;
  musicalKey: string | null;
}

const CATALOG_PREFIX = 'catalog-track-';
const RELEASE_PREFIX = 'catalog-release-';

async function verifyCrateOwnership(crateId: number, fanId: number): Promise<boolean> {
  const owns = await queryOne<{ exists: number }>(
    'SELECT 1 as exists FROM crates WHERE id = $1 AND fan_id = $2',
    [crateId, fanId],
  );
  return !!owns;
}

export interface CrateReleaseItem {
  crateItemId: string;
  releaseId: number;
  releaseTitle: string;
  releaseUrl: string;
  releaseType: 'album' | 'track';
  imageUrl: string;
  bandName: string;
  bandUrl: string;
  bandSlug: string;
  tags: string[];
  releaseDate: string | null;
  tracks: CatalogTrack[];
}

export async function getCrates(fanId: number): Promise<Crate[]> {
  const rows = await query<{ id: number; fan_id: number; name: string; source: string; created_at: Date | string }>(
    "SELECT id, fan_id, name, source, created_at FROM crates WHERE fan_id = $1 ORDER BY (source = 'bandcamp_wishlist') DESC, created_at ASC",
    [fanId],
  );
  return rows.map((r) => ({
    id: r.id,
    fanId: r.fan_id,
    name: r.name,
    source: r.source as Crate['source'],
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  }));
}

const MAX_CRATE_NAME_LENGTH = 64;
const MAX_USER_CRATES = 100;

export async function createCrate(fanId: number, name: string): Promise<number> {
  const count = await queryOne<{ c: string }>(
    "SELECT COUNT(*) AS c FROM crates WHERE fan_id = $1 AND source = 'user'",
    [fanId],
  );
  if (parseInt(count!.c, 10) >= MAX_USER_CRATES) {
    throw new Error(`Cannot create more than ${MAX_USER_CRATES} crates`);
  }
  const result = await queryOne<{ id: number }>(
    'INSERT INTO crates (fan_id, name, source) VALUES ($1, $2, $3) RETURNING id',
    [fanId, name.slice(0, MAX_CRATE_NAME_LENGTH), 'user'],
  );
  return result!.id;
}

export async function renameCrate(crateId: number, fanId: number, name: string): Promise<void> {
  const result = await execute('UPDATE crates SET name = $1 WHERE id = $2 AND fan_id = $3', [name.slice(0, MAX_CRATE_NAME_LENGTH), crateId, fanId]);
  if (result.rowCount === 0) throw new Error('Crate not found');
}

export async function deleteCrate(crateId: number, fanId: number): Promise<void> {
  const crate = await queryOne<{ source: string }>('SELECT source FROM crates WHERE id = $1 AND fan_id = $2', [crateId, fanId]);
  if (!crate) throw new Error('Crate not found');
  if (crate.source === 'bandcamp_wishlist') {
    throw new Error('Cannot delete the Bandcamp wishlist crate');
  }
  await execute('DELETE FROM crates WHERE id = $1 AND fan_id = $2', [crateId, fanId]);
}

export async function ensureCrateBySource(fanId: number, source: string, defaultName: string): Promise<number> {
  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM crates WHERE fan_id = $1 AND source = $2 ORDER BY created_at ASC LIMIT 1',
    [fanId, source],
  );
  if (existing) return existing.id;
  const result = await queryOne<{ id: number }>(
    'INSERT INTO crates (fan_id, name, source) VALUES ($1, $2, $3) RETURNING id',
    [fanId, defaultName, source],
  );
  return result!.id;
}

export async function ensureDefaultCrate(fanId: number): Promise<number> {
  return ensureCrateBySource(fanId, 'user', 'My Crate');
}

export async function getCrateItems(crateId: number, fanId: number): Promise<FeedItem[]> {
  const rows = await query<FeedItemRow>(`
    SELECT fi.id, fi.fan_id, fi.story_type, fi.date,
           fi.album_id, fi.album_title, fi.album_url, fi.album_image_url,
           fi.artist_id, fi.artist_name, fi.artist_url,
           fi.track_title, fi.track_duration, fi.track_stream_url,
           ${tagsWithFallback('cr', 'fi')} AS tags,
           fi.price_amount, fi.price_currency,
           fi.fan_name, fi.fan_username, fi.also_collected_count,
           COALESCE(ct.bpm, fi.bpm) AS bpm,
           COALESCE(ct.musical_key, fi.musical_key) AS musical_key
    FROM crate_items ci
    JOIN feed_items fi ON fi.id = ci.feed_item_id AND fi.fan_id = $1
    LEFT JOIN catalog_releases cr ON cr.id = fi.release_id
    LEFT JOIN catalog_tracks ct ON ct.id = fi.track_id
    WHERE ci.crate_id = $2
    ORDER BY ci.added_at DESC
  `, [fanId, crateId]);
  return rows.map(rowToFeedItem);
}

export async function getCrateCatalogItems(crateId: number, fanId: number): Promise<CrateCatalogItem[]> {
  if (!await verifyCrateOwnership(crateId, fanId)) return [];
  const rows = await query<{
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
    bpm: number | null;
    musical_key: string | null;
  }>(`
    SELECT ci.feed_item_id, ct.id as track_id, ct.title as track_title,
           ct.duration, ct.stream_url, ct.track_url, cr.title as release_title,
           cr.url as release_url, cr.image_url, cr.band_name, cr.band_url,
           ct.bpm, ct.musical_key
    FROM crate_items ci
    JOIN catalog_tracks ct ON ct.id = CAST(SUBSTRING(ci.feed_item_id FROM $2) AS INTEGER)
    JOIN catalog_releases cr ON cr.id = ct.release_id
    WHERE ci.crate_id = $1 AND ci.feed_item_id LIKE $3
    ORDER BY ci.added_at DESC
  `, [crateId, CATALOG_PREFIX.length + 1, `${CATALOG_PREFIX}%`]);

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
    bpm: r.bpm ?? null,
    musicalKey: r.musical_key ?? null,
  }));
}

export function catalogTrackCrateItemId(trackId: number): string {
  return `${CATALOG_PREFIX}${trackId}`;
}

export function catalogReleaseCrateItemId(releaseId: number): string {
  return `${RELEASE_PREFIX}${releaseId}`;
}

export async function getCrateReleaseItems(crateId: number, fanId: number): Promise<CrateReleaseItem[]> {
  if (!await verifyCrateOwnership(crateId, fanId)) return [];

  const rows = await query<{
    feed_item_id: string;
    release_id: number;
    title: string;
    url: string;
    release_type: string;
    image_url: string;
    band_name: string;
    band_url: string;
    band_slug: string;
    tags: string | string[];
    release_date: string | null;
  }>(`
    SELECT ci.feed_item_id, cr.id as release_id, cr.title, cr.url, cr.release_type,
           cr.image_url, cr.band_name, cr.band_url, cr.band_slug, cr.tags, cr.release_date
    FROM crate_items ci
    JOIN catalog_releases cr ON cr.id = CAST(SUBSTRING(ci.feed_item_id FROM $2) AS INTEGER)
    WHERE ci.crate_id = $1 AND ci.feed_item_id LIKE $3
    ORDER BY ci.added_at DESC
  `, [crateId, RELEASE_PREFIX.length + 1, `${RELEASE_PREFIX}%`]);

  const releaseIds = rows.map((r) => r.release_id);
  const trackMap: Record<number, CatalogTrack[]> = {};

  if (releaseIds.length > 0) {
    const placeholders = releaseIds.map((_, i) => `$${i + 1}`).join(',');
    const trackRows = await query<CatalogTrackRow>(`
      SELECT id, release_id, track_num, title, duration, stream_url, track_url,
             bpm, musical_key, key_camelot, audio_storage_key
      FROM catalog_tracks
      WHERE release_id IN (${placeholders})
      ORDER BY release_id, track_num
    `, releaseIds);

    for (const t of trackRows) {
      (trackMap[t.release_id] ??= []).push(rowToTrack(t));
    }
  }

  return rows.map((r) => ({
    crateItemId: r.feed_item_id,
    releaseId: r.release_id,
    releaseTitle: r.title,
    releaseUrl: r.url,
    releaseType: r.release_type as 'album' | 'track',
    imageUrl: r.image_url,
    bandName: r.band_name,
    bandUrl: r.band_url,
    bandSlug: r.band_slug,
    tags: safeParseTags(r.tags),
    releaseDate: r.release_date,
    tracks: trackMap[r.release_id] ?? [],
  }));
}

export async function addToCrate(crateId: number, fanId: number, feedItemId: string): Promise<void> {
  if (!await verifyCrateOwnership(crateId, fanId)) throw new Error('Crate not found');
  await execute(
    'INSERT INTO crate_items (crate_id, feed_item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [crateId, feedItemId],
  );
}

export async function removeFromCrate(crateId: number, fanId: number, feedItemId: string): Promise<void> {
  if (!await verifyCrateOwnership(crateId, fanId)) throw new Error('Crate not found');
  await execute(
    'DELETE FROM crate_items WHERE crate_id = $1 AND feed_item_id = $2',
    [crateId, feedItemId],
  );
}

export async function getItemCrates(fanId: number, feedItemId: string): Promise<number[]> {
  const rows = await query<{ crate_id: number }>(`
    SELECT ci.crate_id FROM crate_items ci
    JOIN crates c ON c.id = ci.crate_id
    WHERE c.fan_id = $1 AND ci.feed_item_id = $2
  `, [fanId, feedItemId]);
  return rows.map((r) => r.crate_id);
}

export async function getItemCrateMultiMap(fanId: number): Promise<Record<string, number[]>> {
  const rows = await query<{ feed_item_id: string; crate_id: number }>(`
    SELECT ci.feed_item_id, ci.crate_id FROM crate_items ci
    JOIN crates c ON c.id = ci.crate_id
    WHERE c.fan_id = $1
  `, [fanId]);
  const map: Record<string, number[]> = {};
  for (const r of rows) {
    (map[r.feed_item_id] ??= []).push(r.crate_id);
  }
  return map;
}

export async function clearCrate(crateId: number, fanId: number): Promise<void> {
  if (!await verifyCrateOwnership(crateId, fanId)) throw new Error('Crate not found');
  await execute('DELETE FROM crate_items WHERE crate_id = $1', [crateId]);
}

/** Returns all item IDs across all crates for a fan. */
export async function getAllCrateItemIds(fanId: number): Promise<Set<string>> {
  const rows = await query<{ feed_item_id: string }>(`
    SELECT ci.feed_item_id FROM crate_items ci
    JOIN crates c ON c.id = ci.crate_id
    WHERE c.fan_id = $1
  `, [fanId]);
  return new Set(rows.map((r) => r.feed_item_id));
}
