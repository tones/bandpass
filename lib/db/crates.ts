import { query, queryOne, execute } from './index';
import { rowToFeedItem } from './queries';
import type { FeedItemRow } from './queries';
import type { FeedItem, WishlistItem } from '@/lib/bandcamp/types/domain';
import type { CatalogTrack, CatalogRelease } from './catalog';

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
    SELECT fi.* FROM crate_items ci
    JOIN feed_items fi ON fi.id = ci.feed_item_id AND fi.fan_id = $1
    WHERE ci.crate_id = $2
    ORDER BY ci.added_at DESC
  `, [fanId, crateId]);
  return rows.map(rowToFeedItem);
}

export async function getCrateCatalogItems(crateId: number, fanId: number): Promise<CrateCatalogItem[]> {
  const owns = await queryOne<{ exists: number }>('SELECT 1 as exists FROM crates WHERE id = $1 AND fan_id = $2', [crateId, fanId]);
  if (!owns) return [];
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
    JOIN catalog_tracks ct ON ct.id = CAST(SUBSTRING(ci.feed_item_id FROM ${CATALOG_PREFIX.length + 1}) AS INTEGER)
    JOIN catalog_releases cr ON cr.id = ct.release_id
    WHERE ci.crate_id = $1 AND ci.feed_item_id LIKE '${CATALOG_PREFIX}%'
    ORDER BY ci.added_at DESC
  `, [crateId]);

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
  const owns = await queryOne<{ exists: number }>('SELECT 1 as exists FROM crates WHERE id = $1 AND fan_id = $2', [crateId, fanId]);
  if (!owns) return [];

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
    JOIN catalog_releases cr ON cr.id = CAST(SUBSTRING(ci.feed_item_id FROM ${RELEASE_PREFIX.length + 1}) AS INTEGER)
    WHERE ci.crate_id = $1 AND ci.feed_item_id LIKE '${RELEASE_PREFIX}%'
    ORDER BY ci.added_at DESC
  `, [crateId]);

  const releaseIds = rows.map((r) => r.release_id);
  const trackMap: Record<number, CatalogTrack[]> = {};

  if (releaseIds.length > 0) {
    const placeholders = releaseIds.map((_, i) => `$${i + 1}`).join(',');
    const trackRows = await query<{
      id: number; release_id: number; track_num: number; title: string;
      duration: number; stream_url: string | null; track_url: string | null;
      bpm: number | null; musical_key: string | null; key_camelot: string | null;
      audio_storage_key: string | null;
    }>(`
      SELECT id, release_id, track_num, title, duration, stream_url, track_url,
             bpm, musical_key, key_camelot, audio_storage_key
      FROM catalog_tracks
      WHERE release_id IN (${placeholders})
      ORDER BY release_id, track_num
    `, releaseIds);

    for (const t of trackRows) {
      (trackMap[t.release_id] ??= []).push({
        id: t.id,
        releaseId: t.release_id,
        trackNum: t.track_num,
        title: t.title,
        duration: t.duration,
        streamUrl: t.stream_url,
        trackUrl: t.track_url,
        bpm: t.bpm,
        musicalKey: t.musical_key,
        keyCamelot: t.key_camelot,
        audioStorageKey: t.audio_storage_key,
      });
    }
  }

  return rows.map((r) => {
    let tags: string[] = [];
    if (Array.isArray(r.tags)) {
      tags = r.tags;
    } else {
      try { tags = JSON.parse(r.tags || '[]'); } catch { /* ignore */ }
    }
    return {
      crateItemId: r.feed_item_id,
      releaseId: r.release_id,
      releaseTitle: r.title,
      releaseUrl: r.url,
      releaseType: r.release_type as 'album' | 'track',
      imageUrl: r.image_url,
      bandName: r.band_name,
      bandUrl: r.band_url,
      bandSlug: r.band_slug,
      tags,
      releaseDate: r.release_date,
      tracks: trackMap[r.release_id] ?? [],
    };
  });
}

export async function addToCrate(crateId: number, fanId: number, feedItemId: string): Promise<void> {
  const owns = await queryOne<{ exists: number }>('SELECT 1 as exists FROM crates WHERE id = $1 AND fan_id = $2', [crateId, fanId]);
  if (!owns) throw new Error('Crate not found');
  await execute(
    'INSERT INTO crate_items (crate_id, feed_item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [crateId, feedItemId],
  );
}

export async function removeFromCrate(crateId: number, fanId: number, feedItemId: string): Promise<void> {
  const owns = await queryOne<{ exists: number }>('SELECT 1 as exists FROM crates WHERE id = $1 AND fan_id = $2', [crateId, fanId]);
  if (!owns) throw new Error('Crate not found');
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
  const owns = await queryOne<{ exists: number }>('SELECT 1 as exists FROM crates WHERE id = $1 AND fan_id = $2', [crateId, fanId]);
  if (!owns) throw new Error('Crate not found');
  await execute('DELETE FROM crate_items WHERE crate_id = $1', [crateId]);
}

export async function getCrateWishlistItems(crateId: number, fanId: number): Promise<WishlistItem[]> {
  const owns = await queryOne<{ exists: number }>('SELECT 1 as exists FROM crates WHERE id = $1 AND fan_id = $2', [crateId, fanId]);
  if (!owns) return [];
  const rows = await query<{
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
    is_preorder: boolean;
    tags: string | string[];
    bpm: number | null;
    musical_key: string | null;
  }>(`
    SELECT wi.id, wi.tralbum_id, wi.tralbum_type, wi.title, wi.artist_name, wi.artist_url,
           wi.image_url, wi.item_url, wi.featured_track_title, wi.featured_track_duration,
           wi.stream_url, wi.also_collected_count, wi.is_preorder, wi.tags,
           wi.bpm, wi.musical_key
    FROM crate_items ci
    JOIN wishlist_items wi ON wi.id = ci.feed_item_id AND wi.fan_id = $1
    WHERE ci.crate_id = $2
    ORDER BY ci.added_at DESC
  `, [fanId, crateId]);
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
  is_preorder: boolean;
  tags: string | string[];
  bpm?: number | null;
  musical_key?: string | null;
}): WishlistItem {
  let tags: string[] = [];
  if (Array.isArray(r.tags)) {
    tags = r.tags;
  } else {
    try { tags = JSON.parse(r.tags || '[]'); } catch { tags = []; }
  }
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
    isPreorder: r.is_preorder,
    tags,
    bpm: r.bpm ?? null,
    musicalKey: r.musical_key ?? null,
  };
}

export async function getWishlistItems(fanId: number): Promise<WishlistItem[]> {
  const rows = await query<Parameters<typeof rowToWishlistItem>[0]>(`
    SELECT id, tralbum_id, tralbum_type, title, artist_name, artist_url,
           image_url, item_url, featured_track_title, featured_track_duration,
           stream_url, also_collected_count, is_preorder, tags, bpm, musical_key
    FROM wishlist_items WHERE fan_id = $1
    ORDER BY synced_at DESC
  `, [fanId]);
  return rows.map(rowToWishlistItem);
}

export async function getWishlistItemCount(fanId: number): Promise<number> {
  const row = await queryOne<{ c: string }>('SELECT COUNT(*) AS c FROM wishlist_items WHERE fan_id = $1', [fanId]);
  return parseInt(row!.c, 10);
}

export interface WishlistAlbumData {
  release: CatalogRelease;
  tracks: CatalogTrack[];
}

export async function getWishlistAlbumTracks(itemUrls: string[]): Promise<Record<string, WishlistAlbumData>> {
  if (itemUrls.length === 0) return {};

  const placeholders = itemUrls.map((_, i) => `$${i + 1}`).join(',');
  const rows = await query<{
    release_id: number;
    band_slug: string;
    band_name: string;
    band_url: string;
    release_title: string;
    release_url: string;
    image_url: string;
    release_type: string;
    scraped_at: string;
    release_date: string | null;
    release_tags: string | string[];
    track_id: number;
    track_num: number;
    track_title: string;
    duration: number;
    stream_url: string | null;
    track_url: string | null;
    bpm: number | null;
    musical_key: string | null;
    key_camelot: string | null;
    audio_storage_key: string | null;
  }>(`
    SELECT cr.id as release_id, cr.band_slug, cr.band_name, cr.band_url,
           cr.title as release_title, cr.url as release_url, cr.image_url,
           cr.release_type, cr.scraped_at, cr.release_date, cr.tags as release_tags,
           ct.id as track_id, ct.track_num, ct.title as track_title,
           ct.duration, ct.stream_url, ct.track_url,
           ct.bpm, ct.musical_key, ct.key_camelot, ct.audio_storage_key
    FROM catalog_releases cr
    JOIN catalog_tracks ct ON ct.release_id = cr.id
    WHERE cr.url IN (${placeholders})
    ORDER BY cr.url, ct.track_num
  `, itemUrls);

  const result: Record<string, WishlistAlbumData> = {};
  for (const r of rows) {
    if (!result[r.release_url]) {
      let tags: string[] = [];
      if (Array.isArray(r.release_tags)) {
        tags = r.release_tags;
      } else {
        try { tags = JSON.parse(r.release_tags || '[]'); } catch { tags = []; }
      }
      result[r.release_url] = {
        release: {
          id: r.release_id,
          bandSlug: r.band_slug,
          bandName: r.band_name,
          bandUrl: r.band_url,
          title: r.release_title,
          url: r.release_url,
          imageUrl: r.image_url,
          releaseType: r.release_type as 'album' | 'track',
          scrapedAt: r.scraped_at,
          releaseDate: r.release_date,
          tags,
        },
        tracks: [],
      };
    }
    result[r.release_url].tracks.push({
      id: r.track_id,
      releaseId: r.release_id,
      trackNum: r.track_num,
      title: r.track_title,
      duration: r.duration,
      streamUrl: r.stream_url,
      trackUrl: r.track_url,
      bpm: r.bpm ?? null,
      musicalKey: r.musical_key ?? null,
      keyCamelot: r.key_camelot ?? null,
      audioStorageKey: r.audio_storage_key ?? null,
    });
  }
  return result;
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
