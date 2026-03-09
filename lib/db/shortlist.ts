import { getDb } from './index';
import { rowToFeedItem } from './queries';
import type { FeedItemRow } from './queries';
import type { FeedItem } from '@/lib/bandcamp/types/domain';

export interface ShortlistCatalogItem {
  shortlistId: string;
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

export function getShortlist(fanId: number): Set<string> {
  const db = getDb();
  const rows = db.prepare(
    'SELECT feed_item_id FROM shortlist WHERE fan_id = ?',
  ).all(fanId) as { feed_item_id: string }[];
  return new Set(rows.map((r) => r.feed_item_id));
}

export function getShortlistCount(fanId: number): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT COUNT(*) AS c FROM shortlist WHERE fan_id = ?',
  ).get(fanId) as { c: number };
  return row.c;
}

export function getShortlistItems(fanId: number): FeedItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT fi.* FROM shortlist s
    JOIN feed_items fi ON fi.id = s.feed_item_id AND fi.fan_id = s.fan_id
    WHERE s.fan_id = ?
    ORDER BY s.added_at DESC
  `).all(fanId) as FeedItemRow[];
  return rows.map(rowToFeedItem);
}

export function getShortlistCatalogItems(fanId: number): ShortlistCatalogItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT s.feed_item_id, ct.id as track_id, ct.title as track_title,
           ct.duration, ct.stream_url, ct.track_url, cr.title as release_title,
           cr.url as release_url, cr.image_url, cr.band_name, cr.band_url
    FROM shortlist s
    JOIN catalog_tracks ct ON ct.id = CAST(SUBSTR(s.feed_item_id, ${CATALOG_PREFIX.length + 1}) AS INTEGER)
    JOIN catalog_releases cr ON cr.id = ct.release_id
    WHERE s.fan_id = ? AND s.feed_item_id LIKE '${CATALOG_PREFIX}%'
    ORDER BY s.added_at DESC
  `).all(fanId) as Array<{
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
    shortlistId: r.feed_item_id,
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

export function catalogTrackShortlistId(trackId: number): string {
  return `${CATALOG_PREFIX}${trackId}`;
}

export function addToShortlist(fanId: number, feedItemId: string): void {
  const db = getDb();
  db.prepare(
    'INSERT OR IGNORE INTO shortlist (fan_id, feed_item_id) VALUES (?, ?)',
  ).run(fanId, feedItemId);
}

export function removeFromShortlist(fanId: number, feedItemId: string): void {
  const db = getDb();
  db.prepare(
    'DELETE FROM shortlist WHERE fan_id = ? AND feed_item_id = ?',
  ).run(fanId, feedItemId);
}

export function clearShortlist(fanId: number): void {
  const db = getDb();
  db.prepare('DELETE FROM shortlist WHERE fan_id = ?').run(fanId);
}

export function isShortlisted(fanId: number, feedItemId: string): boolean {
  const db = getDb();
  const row = db.prepare(
    'SELECT 1 FROM shortlist WHERE fan_id = ? AND feed_item_id = ?',
  ).get(fanId, feedItemId);
  return !!row;
}
