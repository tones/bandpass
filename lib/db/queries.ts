import { query, queryOne } from './index';
import type { FeedItem, StoryType } from '@/lib/bandcamp/types/domain';
import type { CatalogTrack, CatalogTrackRow } from './catalog';
import { rowToTrack } from './catalog';

export interface FeedFilters {
  storyType?: StoryType;
  friendUsername?: string;
  tag?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface FeedItemRow {
  id: string;
  fan_id: number;
  story_type: string;
  date: Date | string;
  album_id: number;
  album_title: string;
  album_url: string;
  album_image_url: string;
  artist_id: number;
  artist_name: string;
  artist_url: string;
  track_title: string | null;
  track_duration: number | null;
  track_stream_url: string | null;
  tags: string | string[];
  price_amount: number | null;
  price_currency: string | null;
  fan_name: string | null;
  fan_username: string | null;
  also_collected_count: number;
  bpm: number | null;
  musical_key: string | null;
}

import { safeParseTags } from './utils';
export { safeParseTags };

export function rowToFeedItem(row: FeedItemRow): FeedItem {
  return {
    id: row.id,
    storyType: row.story_type as StoryType,
    date: new Date(row.date),
    album: {
      id: row.album_id,
      title: row.album_title,
      url: row.album_url,
      imageUrl: row.album_image_url,
    },
    artist: {
      id: row.artist_id,
      name: row.artist_name,
      url: row.artist_url,
    },
    track: row.track_title
      ? {
          title: row.track_title,
          duration: row.track_duration ?? 0,
          streamUrl: row.track_stream_url,
        }
      : null,
    tags: safeParseTags(row.tags),
    bpm: row.bpm ?? null,
    musicalKey: row.musical_key ?? null,
    price:
      row.price_amount != null && row.price_currency
        ? { amount: row.price_amount, currency: row.price_currency }
        : null,
    socialSignal: {
      fan: row.fan_name && row.fan_username
        ? { name: row.fan_name, username: row.fan_username }
        : null,
      alsoCollectedCount: row.also_collected_count,
    },
  };
}

export async function getFeedItems(fanId: number, filters: FeedFilters = {}): Promise<FeedItem[]> {
  const params: (string | number)[] = [fanId];
  let paramIndex = 2;

  const conditions: string[] = ['fi.fan_id = $1'];

  if (filters.storyType) {
    conditions.push(`fi.story_type = $${paramIndex}`);
    params.push(filters.storyType);
    paramIndex++;
  }
  if (filters.friendUsername) {
    conditions.push(`fi.fan_username = $${paramIndex}`);
    params.push(filters.friendUsername);
    paramIndex++;
  }
  if (filters.dateFrom) {
    conditions.push(`fi.date >= $${paramIndex}`);
    params.push(filters.dateFrom);
    paramIndex++;
  }
  if (filters.dateTo) {
    conditions.push(`fi.date < $${paramIndex}`);
    params.push(filters.dateTo);
    paramIndex++;
  }

  const selectCols = `
    fi.id, fi.fan_id, fi.story_type, fi.date,
    fi.album_id, fi.album_title, fi.album_url, fi.album_image_url,
    fi.artist_id, fi.artist_name, fi.artist_url,
    fi.track_title, fi.track_duration, fi.track_stream_url,
    CASE WHEN cr.tags IS NOT NULL AND cr.tags != '[]'::jsonb THEN cr.tags ELSE fi.tags END AS tags,
    fi.price_amount, fi.price_currency,
    fi.fan_name, fi.fan_username, fi.also_collected_count,
    COALESCE(ct.bpm, fi.bpm) AS bpm,
    COALESCE(ct.musical_key, fi.musical_key) AS musical_key`;

  const joins = `
    FROM feed_items fi
    LEFT JOIN catalog_releases cr ON cr.id = fi.release_id
    LEFT JOIN catalog_tracks ct ON ct.id = fi.track_id`;

  let sql: string;
  if (filters.tag) {
    conditions.push(`t.value = $${paramIndex}`);
    params.push(filters.tag);
    sql = `
      SELECT DISTINCT ${selectCols}
      ${joins},
      jsonb_array_elements_text(
        CASE WHEN cr.tags IS NOT NULL AND cr.tags != '[]'::jsonb THEN cr.tags ELSE fi.tags END
      ) AS t(value)
      WHERE ${conditions.join(' AND ')}
      ORDER BY fi.date DESC
      LIMIT 500
    `;
  } else {
    sql = `
      SELECT ${selectCols}
      ${joins}
      WHERE ${conditions.join(' AND ')}
      ORDER BY fi.date DESC
      LIMIT 500
    `;
  }

  const rows = await query<FeedItemRow>(sql, params);
  return rows.map(rowToFeedItem);
}

export interface TagCount {
  name: string;
  count: number;
}

export async function getTagCounts(fanId: number): Promise<TagCount[]> {
  const rows = await query<{ name: string; count: number }>(
    `
    SELECT t.value AS name, COUNT(*) AS count
    FROM feed_items fi
    LEFT JOIN catalog_releases cr ON cr.id = fi.release_id,
    jsonb_array_elements_text(
      CASE WHEN cr.tags IS NOT NULL AND cr.tags != '[]'::jsonb THEN cr.tags ELSE fi.tags END
    ) AS t(value)
    WHERE fi.fan_id = $1
    GROUP BY t.value
    HAVING COUNT(*) >= 5
    ORDER BY LOWER(t.value)
  `,
    [fanId],
  );
  return rows;
}

export interface FriendCount {
  name: string;
  username: string;
  count: number;
}

export async function getFriendCounts(fanId: number): Promise<FriendCount[]> {
  const rows = await query<{ name: string; username: string; count: number }>(
    `
    SELECT fan_name AS name, fan_username AS username, COUNT(*) AS count
    FROM feed_items
    WHERE fan_id = $1 AND story_type = 'friend_purchase' AND fan_username IS NOT NULL
    GROUP BY fan_username, fan_name
    ORDER BY count DESC
  `,
    [fanId],
  );
  return rows;
}

export async function getItemCount(fanId: number): Promise<number> {
  const row = await queryOne<{ c: string }>(
    'SELECT COUNT(*) AS c FROM feed_items WHERE fan_id = $1',
    [fanId],
  );
  return row ? parseInt(row.c, 10) : 0;
}

export async function getItemCountByType(fanId: number, storyType: string): Promise<number> {
  const row = await queryOne<{ c: string }>(
    'SELECT COUNT(*) AS c FROM feed_items WHERE fan_id = $1 AND story_type = $2',
    [fanId, storyType],
  );
  return row ? parseInt(row.c, 10) : 0;
}

export async function getAlbumTracksForFeedItems(
  albumUrls: string[],
): Promise<Record<string, CatalogTrack[]>> {
  if (albumUrls.length === 0) return {};

  const rows = await query<CatalogTrackRow & { album_url: string }>(`
    SELECT cr.url AS album_url,
           ct.id, ct.release_id, ct.track_num, ct.title, ct.duration,
           ct.stream_url, ct.track_url, ct.bpm, ct.musical_key,
           ct.key_camelot, ct.audio_storage_key
    FROM catalog_releases cr
    JOIN catalog_tracks ct ON ct.release_id = cr.id
    WHERE cr.url = ANY($1)
    ORDER BY cr.url, ct.track_num
  `, [albumUrls]);

  const map: Record<string, CatalogTrack[]> = {};
  for (const row of rows) {
    (map[row.album_url] ??= []).push(rowToTrack(row));
  }

  // Only include releases with multiple tracks (albums, not singles)
  for (const url of Object.keys(map)) {
    if (map[url].length <= 1) delete map[url];
  }

  return map;
}
