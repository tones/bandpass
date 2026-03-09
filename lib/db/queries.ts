import { getDb } from './index';
import type { FeedItem, StoryType } from '@/lib/bandcamp/types/domain';

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
  date: string;
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
  tags: string;
  price_amount: number | null;
  price_currency: string | null;
  fan_name: string | null;
  fan_username: string | null;
  also_collected_count: number;
}

function safeParseTags(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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

export function getFeedItems(fanId: number, filters: FeedFilters = {}): FeedItem[] {
  const db = getDb();
  const conditions: string[] = ['fi.fan_id = ?'];
  const params: (string | number)[] = [fanId];

  if (filters.storyType) {
    conditions.push('fi.story_type = ?');
    params.push(filters.storyType);
  }
  if (filters.friendUsername) {
    conditions.push('fi.fan_username = ?');
    params.push(filters.friendUsername);
  }
  if (filters.dateFrom) {
    conditions.push('fi.date >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push('fi.date < ?');
    params.push(filters.dateTo);
  }

  let sql: string;
  if (filters.tag) {
    sql = `
      SELECT DISTINCT fi.* FROM feed_items fi, json_each(fi.tags) AS t
      WHERE ${conditions.join(' AND ')} AND t.value = ?
      ORDER BY fi.date DESC
      LIMIT 500
    `;
    params.push(filters.tag);
  } else {
    sql = `
      SELECT fi.* FROM feed_items fi
      WHERE ${conditions.join(' AND ')}
      ORDER BY fi.date DESC
      LIMIT 500
    `;
  }

  const rows = db.prepare(sql).all(...params) as FeedItemRow[];
  return rows.map(rowToFeedItem);
}

export interface TagCount {
  name: string;
  count: number;
}

export function getTagCounts(fanId: number): TagCount[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT t.value AS name, COUNT(*) AS count
    FROM feed_items fi, json_each(fi.tags) AS t
    WHERE fi.fan_id = ?
    GROUP BY t.value
    HAVING COUNT(*) >= 5
    ORDER BY t.value COLLATE NOCASE
  `).all(fanId) as { name: string; count: number }[];
  return rows;
}

export interface FriendCount {
  name: string;
  username: string;
  count: number;
}

export function getFriendCounts(fanId: number): FriendCount[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT fan_name AS name, fan_username AS username, COUNT(*) AS count
    FROM feed_items
    WHERE fan_id = ? AND story_type = 'friend_purchase' AND fan_username IS NOT NULL
    GROUP BY fan_username
    ORDER BY count DESC
  `).all(fanId) as { name: string; username: string; count: number }[];
  return rows;
}

export function getItemCount(fanId: number): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) AS c FROM feed_items WHERE fan_id = ?').get(fanId) as { c: number };
  return row.c;
}
