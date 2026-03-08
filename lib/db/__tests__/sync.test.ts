import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb } from './helpers';
import type { FeedItem, FeedPage } from '@/lib/bandcamp/types/domain';

let testDb: Database.Database;

vi.mock('../index', () => ({
  getDb: () => testDb,
}));

vi.mock('@/lib/bandcamp/api', () => ({
  BandcampAPI: vi.fn(),
}));

import { syncFeedIncremental, syncFeedFull, getSyncState } from '../sync';
import { BandcampAPI } from '@/lib/bandcamp/api';

function makeFeedItem(id: string, dateOffset: number): FeedItem {
  const now = Date.now();
  return {
    id,
    storyType: 'new_release',
    date: new Date(now - dateOffset * 1000),
    album: { id: 1, title: 'Album', url: '', imageUrl: '' },
    artist: { id: 1, name: 'Artist', url: '' },
    track: null,
    tags: ['electronic'],
    price: null,
    socialSignal: { fan: null, alsoCollectedCount: 0 },
  };
}

function makePage(items: FeedItem[], hasMore: boolean): FeedPage {
  const dates = items.map((i) => Math.floor(i.date.getTime() / 1000));
  return {
    items,
    oldestStoryDate: Math.min(...dates),
    newestStoryDate: Math.max(...dates),
    hasMore,
  };
}

function seedSyncState(fanId: number, newest: number, oldest: number) {
  testDb.prepare(`
    INSERT INTO sync_state (fan_id, oldest_story_date, newest_story_date, total_items, is_syncing, last_sync_at)
    VALUES (?, ?, ?, 10, 0, datetime('now'))
  `).run(fanId, oldest, newest);
}

function insertExistingItem(fanId: number, item: FeedItem) {
  testDb.prepare(`
    INSERT OR REPLACE INTO feed_items (id, fan_id, story_type, date, tags, also_collected_count)
    VALUES (?, ?, ?, ?, '[]', 0)
  `).run(item.id, fanId, item.storyType, item.date.toISOString());
}

function getDbItemCount(fanId: number): number {
  return (testDb.prepare('SELECT COUNT(*) as c FROM feed_items WHERE fan_id = ?').get(fanId) as { c: number }).c;
}

describe('syncFeedIncremental', () => {
  const fanId = 12345;

  beforeEach(() => {
    testDb = createTestDb();
  });

  it('stops after 3 consecutive all-known pages', async () => {
    const now = Math.floor(Date.now() / 1000);
    seedSyncState(fanId, now, now - 86400 * 30);

    const pageItems = Array.from({ length: 5 }, (_, i) =>
      [makeFeedItem(`p${i}-a`, i * 1000), makeFeedItem(`p${i}-b`, i * 1000 + 500)],
    );

    for (const items of pageItems) {
      for (const item of items) {
        insertExistingItem(fanId, item);
      }
    }

    let callCount = 0;
    const mockApi = {
      getFeed: vi.fn(async () => {
        const page = pageItems[callCount];
        callCount++;
        return makePage(page, callCount < pageItems.length);
      }),
      getFanId: vi.fn(),
    } as unknown as BandcampAPI;

    const result = await syncFeedIncremental(mockApi, fanId);

    expect(result).toBe(0);
    expect(mockApi.getFeed).toHaveBeenCalledTimes(3);
  });

  it('finds scattered new items and resets consecutive counter', async () => {
    const now = Math.floor(Date.now() / 1000);
    seedSyncState(fanId, now, now - 86400 * 30);

    const knownItem1 = makeFeedItem('known-1', 100);
    const knownItem2 = makeFeedItem('known-2', 200);
    const newItem1 = makeFeedItem('new-1', 150);
    const knownItem3 = makeFeedItem('known-3', 300);
    const knownItem4 = makeFeedItem('known-4', 400);
    const newItem2 = makeFeedItem('new-2', 500);
    const knownItem5 = makeFeedItem('known-5', 600);
    const knownItem6 = makeFeedItem('known-6', 700);
    const knownItem7 = makeFeedItem('known-7', 800);
    const knownItem8 = makeFeedItem('known-8', 900);
    const knownItem9 = makeFeedItem('known-9', 1000);
    const knownItem10 = makeFeedItem('known-10', 1100);

    for (const item of [knownItem1, knownItem2, knownItem3, knownItem4, knownItem5, knownItem6, knownItem7, knownItem8, knownItem9, knownItem10]) {
      insertExistingItem(fanId, item);
    }

    const pages = [
      makePage([knownItem1, newItem1], true),       // 1 new -> reset
      makePage([knownItem2, knownItem3], true),      // 0 new -> counter=1
      makePage([knownItem4, newItem2], true),         // 1 new -> reset
      makePage([knownItem5, knownItem6], true),      // 0 new -> counter=1
      makePage([knownItem7, knownItem8], true),      // 0 new -> counter=2
      makePage([knownItem9, knownItem10], true),     // 0 new -> counter=3 -> STOP
    ];

    let callCount = 0;
    const mockApi = {
      getFeed: vi.fn(async () => pages[callCount++]),
      getFanId: vi.fn(),
    } as unknown as BandcampAPI;

    const result = await syncFeedIncremental(mockApi, fanId);

    expect(result).toBe(2);
    expect(mockApi.getFeed).toHaveBeenCalledTimes(6);

    const newInDb = testDb.prepare("SELECT id FROM feed_items WHERE fan_id = ? AND id IN ('new-1', 'new-2')").all(fanId);
    expect(newInDb).toHaveLength(2);
  });

  it('falls back to full sync when no prior sync state', async () => {
    const items = [makeFeedItem('item-1', 100), makeFeedItem('item-2', 200)];
    const mockApi = {
      getFeed: vi.fn(async () => makePage(items, false)),
      getFanId: vi.fn(),
    } as unknown as BandcampAPI;

    const result = await syncFeedIncremental(mockApi, fanId);

    expect(result).toBe(2);
    expect(getDbItemCount(fanId)).toBe(2);
  });

  it('sets syncing state correctly', async () => {
    const now = Math.floor(Date.now() / 1000);
    seedSyncState(fanId, now, now - 86400);

    const knownItem = makeFeedItem('k1', 100);
    insertExistingItem(fanId, knownItem);

    let syncingDuringCall = false;
    const mockApi = {
      getFeed: vi.fn(async () => {
        const state = getSyncState(fanId);
        syncingDuringCall = state?.isSyncing ?? false;
        return makePage([knownItem], false);
      }),
      getFanId: vi.fn(),
    } as unknown as BandcampAPI;

    await syncFeedIncremental(mockApi, fanId);

    expect(syncingDuringCall).toBe(true);
    expect(getSyncState(fanId)?.isSyncing).toBe(false);
  });
});

describe('syncFeedFull', () => {
  const fanId = 99999;

  beforeEach(() => {
    testDb = createTestDb();
  });

  it('inserts all items and respects hasMore=false', async () => {
    const items = [makeFeedItem('full-1', 100), makeFeedItem('full-2', 200)];
    const mockApi = {
      getFeed: vi.fn(async () => makePage(items, false)),
      getFanId: vi.fn(),
    } as unknown as BandcampAPI;

    const result = await syncFeedFull(mockApi, fanId);

    expect(result).toBe(2);
    expect(getDbItemCount(fanId)).toBe(2);
    expect(getSyncState(fanId)?.isSyncing).toBe(false);
  });
});
