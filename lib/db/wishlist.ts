/**
 * Wishlist data access: reads wishlist items (with catalog JOIN for enriched
 * tags), counts, and album track data for expanded album views in the UI.
 * Extracted from crates.ts; re-exported from crates.ts for backwards compat.
 */
import { query, queryOne } from './index';
import { safeParseTags, tagsWithFallback } from './utils';
import type { WishlistItem } from '@/lib/bandcamp/types/domain';
import type { CatalogTrack, CatalogRelease, CatalogTrackRow } from './catalog';
import { rowToTrack } from './catalog';

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
    tags: safeParseTags(r.tags),
    bpm: r.bpm ?? null,
    musicalKey: r.musical_key ?? null,
  };
}

/**
 * After migration 011, wishlist items in user crates are stored as
 * release_id references and appear via getCrateReleaseItems instead.
 * This function is kept for API compatibility but always returns [].
 */
export async function getCrateWishlistItems(_crateId: number, _fanId: number): Promise<WishlistItem[]> {
  return [];
}

export async function getWishlistItems(fanId: number): Promise<WishlistItem[]> {
  const rows = await query<Parameters<typeof rowToWishlistItem>[0]>(`
    SELECT wi.id, wi.tralbum_id, wi.tralbum_type, wi.title, wi.artist_name, wi.artist_url,
           wi.image_url, wi.item_url, wi.featured_track_title, wi.featured_track_duration,
           wi.stream_url, wi.also_collected_count, wi.is_preorder,
           ${tagsWithFallback('cr', 'wi')} AS tags,
           wi.bpm, wi.musical_key
    FROM wishlist_items wi
    LEFT JOIN catalog_releases cr ON cr.id = wi.release_id
    WHERE wi.fan_id = $1
    ORDER BY wi.synced_at DESC
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
          tags: safeParseTags(r.release_tags),
        },
        tracks: [],
      };
    }
    result[r.release_url].tracks.push(rowToTrack({
      id: r.track_id,
      release_id: r.release_id,
      track_num: r.track_num,
      title: r.track_title,
      duration: r.duration,
      stream_url: r.stream_url,
      track_url: r.track_url,
      bpm: r.bpm,
      musical_key: r.musical_key,
      key_camelot: r.key_camelot,
      audio_storage_key: r.audio_storage_key,
    }));
  }
  return result;
}
