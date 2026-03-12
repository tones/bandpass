import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedFeedItem, seedWishlistItem } from './helpers';

let testDb: Database.Database;

vi.mock('../index', () => ({
  getDb: () => testDb,
}));

import { enqueueForEnrichment, getEnrichmentPendingCount } from '../sync';

const fanId = 100;

beforeEach(() => {
  testDb = createTestDb();
  testDb.prepare("INSERT INTO sync_state (fan_id, is_syncing) VALUES (?, 0)").run(fanId);
});

describe('enqueueForEnrichment', () => {
  it('enqueues purchases with missing tags', () => {
    seedFeedItem(testDb, fanId, {
      id: 'p1',
      storyType: 'my_purchase',
      tags: [],
    });
    testDb.prepare("UPDATE feed_items SET album_url = ? WHERE id = ?").run(
      'https://band.bandcamp.com/album/test',
      'p1',
    );

    const enqueued = enqueueForEnrichment(fanId);
    expect(enqueued).toBe(1);

    const rows = testDb.prepare("SELECT * FROM enrichment_queue").all();
    expect(rows).toHaveLength(1);
  });

  it('enqueues wishlist items with missing tags', () => {
    seedWishlistItem(testDb, fanId, {
      id: 'wl-1',
      tags: [],
      itemUrl: 'https://band.bandcamp.com/album/wish',
    });

    const enqueued = enqueueForEnrichment(fanId);
    expect(enqueued).toBe(1);
  });

  it('does not enqueue items that already have tags', () => {
    seedFeedItem(testDb, fanId, {
      id: 'p1',
      storyType: 'my_purchase',
      tags: ['electronic'],
    });
    testDb.prepare("UPDATE feed_items SET album_url = ? WHERE id = ?").run(
      'https://band.bandcamp.com/album/test',
      'p1',
    );

    const enqueued = enqueueForEnrichment(fanId);
    expect(enqueued).toBe(0);
  });

  it('does not duplicate existing queue entries', () => {
    seedFeedItem(testDb, fanId, {
      id: 'p1',
      storyType: 'my_purchase',
      tags: [],
    });
    testDb.prepare("UPDATE feed_items SET album_url = ? WHERE id = ?").run(
      'https://band.bandcamp.com/album/test',
      'p1',
    );

    enqueueForEnrichment(fanId);
    const secondRun = enqueueForEnrichment(fanId);
    expect(secondRun).toBe(0);

    const rows = testDb.prepare("SELECT * FROM enrichment_queue").all();
    expect(rows).toHaveLength(1);
  });

  it('resets failed items to pending when URL belongs to fan', () => {
    const url = 'https://band.bandcamp.com/album/old';
    seedFeedItem(testDb, fanId, { id: 'p-old', storyType: 'my_purchase', tags: [] });
    testDb.prepare("UPDATE feed_items SET album_url = ? WHERE id = ?").run(url, 'p-old');

    testDb.prepare(
      "INSERT INTO enrichment_queue (album_url, status) VALUES (?, 'failed')",
    ).run(url);

    enqueueForEnrichment(fanId);

    const row = testDb.prepare(
      "SELECT status FROM enrichment_queue WHERE album_url = ?",
    ).get(url) as { status: string };
    expect(row.status).toBe('pending');
  });

  it('does not reset failed items belonging to other fans', () => {
    testDb.prepare(
      "INSERT INTO enrichment_queue (album_url, status) VALUES (?, 'failed')",
    ).run('https://other.bandcamp.com/album/theirs');

    enqueueForEnrichment(fanId);

    const row = testDb.prepare(
      "SELECT status FROM enrichment_queue WHERE album_url = ?",
    ).get('https://other.bandcamp.com/album/theirs') as { status: string };
    expect(row.status).toBe('failed');
  });

  it('does not enqueue items with empty album_url', () => {
    seedFeedItem(testDb, fanId, {
      id: 'p1',
      storyType: 'my_purchase',
      tags: [],
    });

    const enqueued = enqueueForEnrichment(fanId);
    expect(enqueued).toBe(0);
  });
});

describe('getEnrichmentPendingCount', () => {
  it('returns 0 when no items need enrichment', () => {
    expect(getEnrichmentPendingCount(fanId)).toBe(0);
  });

  it('counts purchases missing tags', () => {
    seedFeedItem(testDb, fanId, {
      id: 'p1',
      storyType: 'my_purchase',
      tags: [],
    });
    testDb.prepare("UPDATE feed_items SET album_url = ? WHERE id = ?").run(
      'https://band.bandcamp.com/album/test',
      'p1',
    );

    expect(getEnrichmentPendingCount(fanId)).toBe(1);
  });

  it('counts wishlist items missing tags', () => {
    seedWishlistItem(testDb, fanId, {
      id: 'wl-1',
      tags: [],
      itemUrl: 'https://band.bandcamp.com/album/wish',
    });

    expect(getEnrichmentPendingCount(fanId)).toBe(1);
  });

  it('excludes items already in the enrichment queue', () => {
    seedFeedItem(testDb, fanId, {
      id: 'p1',
      storyType: 'my_purchase',
      tags: [],
    });
    testDb.prepare("UPDATE feed_items SET album_url = ? WHERE id = ?").run(
      'https://band.bandcamp.com/album/test',
      'p1',
    );

    testDb.prepare(
      "INSERT INTO enrichment_queue (album_url, status) VALUES (?, 'pending')",
    ).run('https://band.bandcamp.com/album/test');

    expect(getEnrichmentPendingCount(fanId)).toBe(0);
  });

  it('excludes items with empty URLs', () => {
    seedFeedItem(testDb, fanId, {
      id: 'p1',
      storyType: 'my_purchase',
      tags: [],
    });

    expect(getEnrichmentPendingCount(fanId)).toBe(0);
  });

  it('sums purchases and wishlist counts', () => {
    seedFeedItem(testDb, fanId, {
      id: 'p1',
      storyType: 'my_purchase',
      tags: [],
    });
    testDb.prepare("UPDATE feed_items SET album_url = ? WHERE id = ?").run(
      'https://band.bandcamp.com/album/purchase',
      'p1',
    );

    seedWishlistItem(testDb, fanId, {
      id: 'wl-1',
      tags: [],
      itemUrl: 'https://band.bandcamp.com/album/wish',
    });

    expect(getEnrichmentPendingCount(fanId)).toBe(2);
  });
});
