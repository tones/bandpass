import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedFeedItem } from './helpers';

let testDb: Database.Database;

vi.mock('../index', () => ({
  getDb: () => testDb,
}));

import { getFeedItems, getTagCounts, getFriendCounts, getItemCount } from '../queries';

const fanId = 100;

beforeEach(() => {
  testDb = createTestDb();
});

describe('getFeedItems', () => {
  it('returns all items for a fan with no filters', () => {
    seedFeedItem(testDb, fanId, { id: 'a', date: '2026-03-01T00:00:00Z' });
    seedFeedItem(testDb, fanId, { id: 'b', date: '2026-03-02T00:00:00Z' });
    seedFeedItem(testDb, 999, { id: 'c' });

    const items = getFeedItems(fanId);
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('b');
    expect(items[1].id).toBe('a');
  });

  it('filters by storyType', () => {
    seedFeedItem(testDb, fanId, { id: 'nr', storyType: 'new_release' });
    seedFeedItem(testDb, fanId, { id: 'fp', storyType: 'friend_purchase' });

    const items = getFeedItems(fanId, { storyType: 'new_release' });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('nr');
  });

  it('filters by tag using json_each', () => {
    seedFeedItem(testDb, fanId, { id: 't1', tags: ['ambient', 'electronic'] });
    seedFeedItem(testDb, fanId, { id: 't2', tags: ['rock'] });
    seedFeedItem(testDb, fanId, { id: 't3', tags: ['ambient'] });

    const items = getFeedItems(fanId, { tag: 'ambient' });
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id).sort()).toEqual(['t1', 't3']);
  });

  it('filters by date range', () => {
    seedFeedItem(testDb, fanId, { id: 'jan', date: '2026-01-15T00:00:00Z' });
    seedFeedItem(testDb, fanId, { id: 'feb', date: '2026-02-15T00:00:00Z' });
    seedFeedItem(testDb, fanId, { id: 'mar', date: '2026-03-15T00:00:00Z' });

    const items = getFeedItems(fanId, {
      dateFrom: '2026-02-01T00:00:00Z',
      dateTo: '2026-03-01T00:00:00Z',
    });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('feb');
  });

  it('filters by friendUsername', () => {
    seedFeedItem(testDb, fanId, { id: 'f1', fanUsername: 'alice', storyType: 'friend_purchase' });
    seedFeedItem(testDb, fanId, { id: 'f2', fanUsername: 'bob', storyType: 'friend_purchase' });

    const items = getFeedItems(fanId, { friendUsername: 'alice' });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('f1');
  });

  it('handles malformed tags JSON gracefully', () => {
    testDb.prepare(`
      INSERT INTO feed_items (id, fan_id, story_type, date, tags, also_collected_count)
      VALUES ('bad', ?, 'new_release', '2026-01-01T00:00:00Z', 'not-json', 0)
    `).run(fanId);

    const items = getFeedItems(fanId);
    expect(items).toHaveLength(1);
    expect(items[0].tags).toEqual([]);
  });
});

describe('getTagCounts', () => {
  it('returns tags with 5 or more items sorted alphabetically', () => {
    for (let i = 0; i < 6; i++) {
      seedFeedItem(testDb, fanId, { id: `e-${i}`, tags: ['electronic'] });
    }
    for (let i = 0; i < 5; i++) {
      seedFeedItem(testDb, fanId, { id: `a-${i}`, tags: ['ambient'] });
    }
    for (let i = 0; i < 3; i++) {
      seedFeedItem(testDb, fanId, { id: `r-${i}`, tags: ['rock'] });
    }

    const tags = getTagCounts(fanId);
    expect(tags).toHaveLength(2);
    expect(tags[0].name).toBe('ambient');
    expect(tags[0].count).toBe(5);
    expect(tags[1].name).toBe('electronic');
    expect(tags[1].count).toBe(6);
  });

  it('returns empty array when no tags qualify', () => {
    seedFeedItem(testDb, fanId, { id: 'x', tags: ['rare'] });
    expect(getTagCounts(fanId)).toEqual([]);
  });
});

describe('getFriendCounts', () => {
  it('counts only friend_purchase items grouped by username', () => {
    for (let i = 0; i < 3; i++) {
      seedFeedItem(testDb, fanId, {
        id: `alice-${i}`,
        storyType: 'friend_purchase',
        fanName: 'Alice',
        fanUsername: 'alice',
      });
    }
    seedFeedItem(testDb, fanId, {
      id: 'bob-1',
      storyType: 'friend_purchase',
      fanName: 'Bob',
      fanUsername: 'bob',
    });
    seedFeedItem(testDb, fanId, {
      id: 'nr-1',
      storyType: 'new_release',
      fanName: 'Charlie',
      fanUsername: 'charlie',
    });

    const friends = getFriendCounts(fanId);
    expect(friends).toHaveLength(2);
    expect(friends[0]).toEqual({ name: 'Alice', username: 'alice', count: 3 });
    expect(friends[1]).toEqual({ name: 'Bob', username: 'bob', count: 1 });
  });
});

describe('getItemCount', () => {
  it('returns total items for a fan', () => {
    seedFeedItem(testDb, fanId, { id: 'i1' });
    seedFeedItem(testDb, fanId, { id: 'i2' });
    seedFeedItem(testDb, 999, { id: 'i3' });

    expect(getItemCount(fanId)).toBe(2);
    expect(getItemCount(999)).toBe(1);
  });

  it('returns 0 for unknown fan', () => {
    expect(getItemCount(0)).toBe(0);
  });
});
