import { getDb } from './index';
import { rowToFeedItem } from './queries';
import type { FeedItemRow } from './queries';
import type { FeedItem } from '@/lib/bandcamp/types/domain';

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
