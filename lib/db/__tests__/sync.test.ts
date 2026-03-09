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

import { syncFeedIncremental, syncFeedInitial, syncFeedDeep, syncCollection, syncCollectionIncremental, getSyncState } from '../sync';
import { BandcampAPI } from '@/lib/bandcamp/api';
import type { CollectionPage } from '@/lib/bandcamp/types/domain';

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

describe('syncFeedInitial', () => {
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

    const result = await syncFeedInitial(mockApi, fanId);

    expect(result).toBe(2);
    expect(getDbItemCount(fanId)).toBe(2);
    expect(getSyncState(fanId)?.isSyncing).toBe(false);
  });
});

function makeCollectionItem(id: string, dateOffset: number, albumId: number = 1): FeedItem {
  const now = Date.now();
  return {
    id,
    storyType: 'my_purchase',
    date: new Date(now - dateOffset * 1000),
    album: { id: albumId, title: 'Album', url: '', imageUrl: '' },
    artist: { id: 1, name: 'Artist', url: '' },
    track: null,
    tags: [],
    price: null,
    socialSignal: { fan: null, alsoCollectedCount: 0 },
  };
}

function makeCollectionPage(items: FeedItem[], hasMore: boolean, lastToken: string = 'tok'): CollectionPage {
  return { items, hasMore, lastToken };
}

describe('syncFeedDeep', () => {
  const fanId = 77777;

  beforeEach(() => {
    testDb = createTestDb();
  });

  it('returns 0 when no prior sync state exists', async () => {
    const mockApi = { getFeed: vi.fn(), getFanId: vi.fn() } as unknown as BandcampAPI;
    const result = await syncFeedDeep(mockApi, fanId);
    expect(result).toBe(0);
    expect(mockApi.getFeed).not.toHaveBeenCalled();
  });

  it('pages backwards from oldest known date and sets deep_sync_complete', async () => {
    const now = Math.floor(Date.now() / 1000);
    seedSyncState(fanId, now, now - 86400);

    const page1Items = [makeFeedItem('deep-1', 86400 + 100), makeFeedItem('deep-2', 86400 + 200)];
    const page2Items = [makeFeedItem('deep-3', 86400 + 300)];

    let callCount = 0;
    const pages = [
      makePage(page1Items, true),
      makePage(page2Items, false),
    ];

    const mockApi = {
      getFeed: vi.fn(async () => pages[callCount++]),
      getFanId: vi.fn(),
    } as unknown as BandcampAPI;

    const result = await syncFeedDeep(mockApi, fanId);

    expect(result).toBe(3);
    expect(getDbItemCount(fanId)).toBe(3);
    expect(getSyncState(fanId)?.deepSyncComplete).toBe(true);
    expect(getSyncState(fanId)?.isSyncing).toBe(false);
  });

  it('stops when page returns empty items', async () => {
    const now = Math.floor(Date.now() / 1000);
    seedSyncState(fanId, now, now - 86400);

    const mockApi = {
      getFeed: vi.fn(async () => makePage([], false)),
      getFanId: vi.fn(),
    } as unknown as BandcampAPI;

    const result = await syncFeedDeep(mockApi, fanId);

    expect(result).toBe(0);
    expect(getSyncState(fanId)?.deepSyncComplete).toBe(true);
  });
});

describe('syncCollection', () => {
  const fanId = 55555;

  beforeEach(() => {
    testDb = createTestDb();
    seedSyncState(fanId, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) - 86400);
  });

  it('inserts all collection items and marks collection_synced', async () => {
    const items = [makeCollectionItem('coll-1', 100), makeCollectionItem('coll-2', 200)];

    const mockApi = {
      getCollection: vi.fn(async () => makeCollectionPage(items, false)),
      getFanId: vi.fn(),
    } as unknown as BandcampAPI;

    const result = await syncCollection(mockApi, fanId);

    expect(result).toBe(2);
    expect(getDbItemCount(fanId)).toBe(2);
    expect(getSyncState(fanId)?.collectionSynced).toBe(true);
    expect(getSyncState(fanId)?.isSyncing).toBe(false);
  });

  it('pages through multiple pages until hasMore=false', async () => {
    const page1 = [makeCollectionItem('p1-1', 100), makeCollectionItem('p1-2', 200)];
    const page2 = [makeCollectionItem('p2-1', 300)];

    let callCount = 0;
    const mockApi = {
      getCollection: vi.fn(async () => {
        callCount++;
        if (callCount === 1) return makeCollectionPage(page1, true, 'tok1');
        return makeCollectionPage(page2, false, 'tok2');
      }),
      getFanId: vi.fn(),
    } as unknown as BandcampAPI;

    const result = await syncCollection(mockApi, fanId);

    expect(result).toBe(3);
    expect(mockApi.getCollection).toHaveBeenCalledTimes(2);
  });

  it('enriches purchase tags from existing feed items', async () => {
    testDb.prepare(`
      INSERT INTO feed_items (id, fan_id, story_type, date, album_id, tags, also_collected_count)
      VALUES ('feed-1', ?, 'new_release', '2025-01-01T00:00:00Z', 42, '["rock","indie"]', 0)
    `).run(fanId);

    const purchaseItem = makeCollectionItem('purchase-1', 100, 42);

    const mockApi = {
      getCollection: vi.fn(async () => makeCollectionPage([purchaseItem], false)),
      getFanId: vi.fn(),
    } as unknown as BandcampAPI;

    await syncCollection(mockApi, fanId);

    const row = testDb.prepare(
      "SELECT tags FROM feed_items WHERE id = 'purchase-1' AND fan_id = ?",
    ).get(fanId) as { tags: string };
    expect(JSON.parse(row.tags)).toEqual(['rock', 'indie']);
  });
});

describe('syncCollectionIncremental', () => {
  const fanId = 44444;

  beforeEach(() => {
    testDb = createTestDb();
    seedSyncState(fanId, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) - 86400);
  });

  it('falls back to full sync when no prior purchases exist', async () => {
    const items = [makeCollectionItem('inc-1', 100)];

    const mockApi = {
      getCollection: vi.fn(async () => makeCollectionPage(items, false)),
      getFanId: vi.fn(),
    } as unknown as BandcampAPI;

    const result = await syncCollectionIncremental(mockApi, fanId);

    expect(result).toBe(1);
    expect(getSyncState(fanId)?.collectionSynced).toBe(true);
  });

  it('only inserts items newer than the most recent purchase', async () => {
    const existingDate = new Date('2025-06-01T00:00:00Z');
    testDb.prepare(`
      INSERT INTO feed_items (id, fan_id, story_type, date, tags, also_collected_count)
      VALUES ('existing-purchase', ?, 'my_purchase', ?, '[]', 0)
    `).run(fanId, existingDate.toISOString());

    const olderItem: FeedItem = {
      id: 'old-1',
      storyType: 'my_purchase',
      date: new Date('2025-05-15T00:00:00Z'),
      album: { id: 1, title: 'Album', url: '', imageUrl: '' },
      artist: { id: 1, name: 'Artist', url: '' },
      track: null,
      tags: [],
      price: null,
      socialSignal: { fan: null, alsoCollectedCount: 0 },
    };
    const newerItem: FeedItem = {
      id: 'new-1',
      storyType: 'my_purchase',
      date: new Date('2025-07-01T00:00:00Z'),
      album: { id: 2, title: 'Album 2', url: '', imageUrl: '' },
      artist: { id: 1, name: 'Artist', url: '' },
      track: null,
      tags: [],
      price: null,
      socialSignal: { fan: null, alsoCollectedCount: 0 },
    };

    const mockApi = {
      getCollection: vi.fn(async () => makeCollectionPage([newerItem, olderItem], false)),
      getFanId: vi.fn(),
    } as unknown as BandcampAPI;

    const result = await syncCollectionIncremental(mockApi, fanId);

    expect(result).toBe(1);
    const newInDb = testDb.prepare(
      "SELECT id FROM feed_items WHERE fan_id = ? AND id = 'new-1'",
    ).all(fanId);
    expect(newInDb).toHaveLength(1);
    const oldInDb = testDb.prepare(
      "SELECT id FROM feed_items WHERE fan_id = ? AND id = 'old-1'",
    ).all(fanId);
    expect(oldInDb).toHaveLength(0);
  });

  it('stops paging when it hits items older than newest purchase', async () => {
    const existingDate = new Date('2025-06-01T00:00:00Z');
    testDb.prepare(`
      INSERT INTO feed_items (id, fan_id, story_type, date, tags, also_collected_count)
      VALUES ('existing', ?, 'my_purchase', ?, '[]', 0)
    `).run(fanId, existingDate.toISOString());

    const newerItem: FeedItem = {
      id: 'newer-1',
      storyType: 'my_purchase',
      date: new Date('2025-07-01T00:00:00Z'),
      album: { id: 1, title: 'A', url: '', imageUrl: '' },
      artist: { id: 1, name: 'A', url: '' },
      track: null, tags: [], price: null,
      socialSignal: { fan: null, alsoCollectedCount: 0 },
    };
    const olderItem: FeedItem = {
      id: 'older-1',
      storyType: 'my_purchase',
      date: new Date('2025-05-01T00:00:00Z'),
      album: { id: 2, title: 'B', url: '', imageUrl: '' },
      artist: { id: 1, name: 'A', url: '' },
      track: null, tags: [], price: null,
      socialSignal: { fan: null, alsoCollectedCount: 0 },
    };

    let callCount = 0;
    const mockApi = {
      getCollection: vi.fn(async () => {
        callCount++;
        if (callCount === 1) return makeCollectionPage([newerItem], true, 'tok1');
        return makeCollectionPage([olderItem], true, 'tok2');
      }),
      getFanId: vi.fn(),
    } as unknown as BandcampAPI;

    const result = await syncCollectionIncremental(mockApi, fanId);

    expect(result).toBe(1);
    expect(mockApi.getCollection).toHaveBeenCalledTimes(2);
  });
});
