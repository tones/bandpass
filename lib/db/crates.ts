/**
 * Crate CRUD and item management. Crates are user-created or system-created
 * (bandcamp_wishlist) collections. Each crate item references either a
 * catalog_releases row (release_id) or a catalog_tracks row (track_id).
 * Wishlist query functions live in ./wishlist.ts and are re-exported here.
 */
import { query, queryOne, execute } from './index';
import { safeParseTags } from './utils';
import type { CatalogTrack, CatalogTrackRow } from './catalog';
import { rowToTrack } from './catalog';

export {
  getCrateWishlistItems,
  getWishlistItems,
  getWishlistItemCount,
  getWishlistAlbumTracks,
} from './wishlist';
export type { WishlistAlbumData } from './wishlist';

export { crateKey, releaseKey, trackKey } from '@/lib/crate-utils';
export type { CrateItemRef } from '@/lib/crate-utils';

import type { CrateItemRef } from '@/lib/crate-utils';

export interface Crate {
  id: number;
  fanId: number;
  name: string;
  source: 'user' | 'bandcamp_wishlist';
  createdAt: string;
}

export interface CrateCatalogItem {
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

export interface CrateReleaseItem {
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

async function verifyCrateOwnership(crateId: number, fanId: number): Promise<boolean> {
  const owns = await queryOne<{ exists: number }>(
    'SELECT 1 as exists FROM crates WHERE id = $1 AND fan_id = $2',
    [crateId, fanId],
  );
  return !!owns;
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

export async function getCrateCatalogItems(crateId: number, fanId: number): Promise<CrateCatalogItem[]> {
  if (!await verifyCrateOwnership(crateId, fanId)) return [];
  const rows = await query<{
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
    SELECT ct.id as track_id, ct.title as track_title,
           ct.duration, ct.stream_url, ct.track_url, cr.title as release_title,
           cr.url as release_url, cr.image_url, cr.band_name, cr.band_url,
           ct.bpm, ct.musical_key
    FROM crate_items ci
    JOIN catalog_tracks ct ON ct.id = ci.track_id
    JOIN catalog_releases cr ON cr.id = ct.release_id
    WHERE ci.crate_id = $1
    ORDER BY ci.added_at DESC
  `, [crateId]);

  return rows.map((r) => ({
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

export async function getCrateReleaseItems(crateId: number, fanId: number): Promise<CrateReleaseItem[]> {
  if (!await verifyCrateOwnership(crateId, fanId)) return [];

  const rows = await query<{
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
    SELECT cr.id as release_id, cr.title, cr.url, cr.release_type,
           cr.image_url, cr.band_name, cr.band_url, cr.band_slug, cr.tags, cr.release_date
    FROM crate_items ci
    JOIN catalog_releases cr ON cr.id = ci.release_id
    WHERE ci.crate_id = $1
    ORDER BY ci.added_at DESC
  `, [crateId]);

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

function refWhere(ref: CrateItemRef, startParam: number): { clause: string; values: unknown[] } {
  if ('trackId' in ref) return { clause: `track_id = $${startParam}`, values: [ref.trackId] };
  return { clause: `release_id = $${startParam}`, values: [ref.releaseId] };
}

export async function addToCrate(crateId: number, fanId: number, ref: CrateItemRef): Promise<void> {
  if (!await verifyCrateOwnership(crateId, fanId)) throw new Error('Crate not found');
  if ('trackId' in ref) {
    await execute(
      'INSERT INTO crate_items (crate_id, track_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [crateId, ref.trackId],
    );
  } else {
    await execute(
      'INSERT INTO crate_items (crate_id, release_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [crateId, ref.releaseId],
    );
  }
}

export async function removeFromCrate(crateId: number, fanId: number, ref: CrateItemRef): Promise<void> {
  if (!await verifyCrateOwnership(crateId, fanId)) throw new Error('Crate not found');
  const { clause, values } = refWhere(ref, 2);
  await execute(
    `DELETE FROM crate_items WHERE crate_id = $1 AND ${clause}`,
    [crateId, ...values],
  );
}

export async function getItemCrates(fanId: number, ref: CrateItemRef): Promise<number[]> {
  const { clause, values } = refWhere(ref, 2);
  const rows = await query<{ crate_id: number }>(`
    SELECT ci.crate_id FROM crate_items ci
    JOIN crates c ON c.id = ci.crate_id
    WHERE c.fan_id = $1 AND ci.${clause}
  `, [fanId, ...values]);
  return rows.map((r) => r.crate_id);
}

export async function getItemCrateMultiMap(fanId: number): Promise<Record<string, number[]>> {
  const rows = await query<{ item_key: string; crate_id: number }>(`
    SELECT
      CASE WHEN ci.track_id IS NOT NULL THEN 'track:' || ci.track_id
           ELSE 'release:' || ci.release_id END AS item_key,
      ci.crate_id
    FROM crate_items ci
    JOIN crates c ON c.id = ci.crate_id
    WHERE c.fan_id = $1
  `, [fanId]);
  const map: Record<string, number[]> = {};
  for (const r of rows) {
    (map[r.item_key] ??= []).push(r.crate_id);
  }
  return map;
}

export async function clearCrate(crateId: number, fanId: number): Promise<void> {
  if (!await verifyCrateOwnership(crateId, fanId)) throw new Error('Crate not found');
  await execute('DELETE FROM crate_items WHERE crate_id = $1', [crateId]);
}

export async function getAllCrateItemIds(fanId: number): Promise<Set<string>> {
  const rows = await query<{ item_key: string }>(`
    SELECT
      CASE WHEN ci.track_id IS NOT NULL THEN 'track:' || ci.track_id
           ELSE 'release:' || ci.release_id END AS item_key
    FROM crate_items ci
    JOIN crates c ON c.id = ci.crate_id
    WHERE c.fan_id = $1
  `, [fanId]);
  return new Set(rows.map((r) => r.item_key));
}
