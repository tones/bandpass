import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../index', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

import { query, queryOne } from '../index';
import {
  rowToFeedItem,
  getFeedItems,
  getTagCounts,
  getFriendCounts,
  getItemCount,
  getItemCountByType,
  getAlbumTracksForFeedItems,
} from '../queries';
import type { FeedItemRow } from '../queries';

function makeFeedRow(overrides: Partial<FeedItemRow> = {}): FeedItemRow {
  return {
    id: 'item-1',
    fan_id: 1,
    story_type: 'new_release',
    date: '2025-01-15T12:00:00Z',
    album_id: 100,
    album_title: 'Test Album',
    album_url: 'https://artist.bandcamp.com/album/test',
    album_image_url: 'https://f4.bcbits.com/img/a1234_10.jpg',
    artist_id: 200,
    artist_name: 'Test Artist',
    artist_url: 'https://artist.bandcamp.com',
    track_title: 'Track One',
    track_duration: 240,
    track_stream_url: 'https://bandcamp.com/stream/123',
    tags: '["electronic", "ambient"]',
    price_amount: 7.0,
    price_currency: 'USD',
    fan_name: null,
    fan_username: null,
    also_collected_count: 0,
    bpm: 120,
    musical_key: 'C minor',
    ...overrides,
  };
}

describe('queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rowToFeedItem', () => {
    it('maps a full row to a FeedItem', () => {
      const row = makeFeedRow();
      const item = rowToFeedItem(row);

      expect(item.id).toBe('item-1');
      expect(item.storyType).toBe('new_release');
      expect(item.album.title).toBe('Test Album');
      expect(item.artist.name).toBe('Test Artist');
      expect(item.track?.title).toBe('Track One');
      expect(item.track?.duration).toBe(240);
      expect(item.tags).toEqual(['electronic', 'ambient']);
      expect(item.bpm).toBe(120);
      expect(item.musicalKey).toBe('C minor');
      expect(item.price).toEqual({ amount: 7.0, currency: 'USD' });
    });

    it('returns null track when track_title is null', () => {
      const row = makeFeedRow({ track_title: null });
      const item = rowToFeedItem(row);
      expect(item.track).toBeNull();
    });

    it('returns null price when price_amount is null', () => {
      const row = makeFeedRow({ price_amount: null });
      const item = rowToFeedItem(row);
      expect(item.price).toBeNull();
    });

    it('maps social signal with fan info', () => {
      const row = makeFeedRow({ fan_name: 'Alice', fan_username: 'alice99', also_collected_count: 5 });
      const item = rowToFeedItem(row);
      expect(item.socialSignal.fan).toEqual({ name: 'Alice', username: 'alice99' });
      expect(item.socialSignal.alsoCollectedCount).toBe(5);
    });

    it('returns null fan when fan_name is missing', () => {
      const row = makeFeedRow({ fan_name: null, fan_username: null });
      const item = rowToFeedItem(row);
      expect(item.socialSignal.fan).toBeNull();
    });

    it('parses tags from JSON string', () => {
      const row = makeFeedRow({ tags: '["rock", "punk"]' });
      expect(rowToFeedItem(row).tags).toEqual(['rock', 'punk']);
    });

    it('passes through tags when already an array', () => {
      const row = makeFeedRow({ tags: ['jazz', 'fusion'] as unknown as string });
      expect(rowToFeedItem(row).tags).toEqual(['jazz', 'fusion']);
    });
  });

  describe('getFeedItems', () => {
    it('queries with fan_id and returns mapped items', async () => {
      const rows = [makeFeedRow()];
      vi.mocked(query).mockResolvedValue(rows);

      const result = await getFeedItems(1);

      expect(query).toHaveBeenCalledTimes(1);
      const [sql, params] = vi.mocked(query).mock.calls[0];
      expect(sql).toContain('feed_items fi');
      expect(sql).toContain('fi.fan_id = $1');
      expect(params).toEqual([1]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('item-1');
    });

    it('adds story_type filter when provided', async () => {
      vi.mocked(query).mockResolvedValue([]);
      await getFeedItems(1, { storyType: 'friend_purchase' });

      const [sql, params] = vi.mocked(query).mock.calls[0];
      expect(sql).toContain('fi.story_type = $2');
      expect(params).toContain('friend_purchase');
    });

    it('adds date range filters', async () => {
      vi.mocked(query).mockResolvedValue([]);
      await getFeedItems(1, { dateFrom: '2025-01-01', dateTo: '2025-02-01' });

      const [sql, params] = vi.mocked(query).mock.calls[0];
      expect(sql).toContain('fi.date >= $2');
      expect(sql).toContain('fi.date < $3');
      expect(params).toEqual([1, '2025-01-01', '2025-02-01']);
    });

    it('uses DISTINCT and jsonb join for tag filter', async () => {
      vi.mocked(query).mockResolvedValue([]);
      await getFeedItems(1, { tag: 'electronic' });

      const [sql, params] = vi.mocked(query).mock.calls[0];
      expect(sql).toContain('SELECT DISTINCT');
      expect(sql).toContain('jsonb_array_elements_text');
      expect(sql).toContain('t.value = $2');
      expect(params).toContain('electronic');
    });

    it('returns empty array when no rows', async () => {
      vi.mocked(query).mockResolvedValue([]);
      const result = await getFeedItems(1);
      expect(result).toEqual([]);
    });
  });

  describe('getTagCounts', () => {
    it('returns tag counts for a fan', async () => {
      vi.mocked(query).mockResolvedValue([
        { name: 'electronic', count: 15 },
        { name: 'ambient', count: 8 },
      ]);

      const result = await getTagCounts(1);

      expect(query).toHaveBeenCalledTimes(1);
      const [sql, params] = vi.mocked(query).mock.calls[0];
      expect(sql).toContain('HAVING COUNT(*) >= 5');
      expect(params).toEqual([1]);
      expect(result).toEqual([
        { name: 'electronic', count: 15 },
        { name: 'ambient', count: 8 },
      ]);
    });
  });

  describe('getFriendCounts', () => {
    it('returns friend purchase counts', async () => {
      vi.mocked(query).mockResolvedValue([
        { name: 'Alice', username: 'alice', count: 10 },
      ]);

      const result = await getFriendCounts(1);

      const [sql] = vi.mocked(query).mock.calls[0];
      expect(sql).toContain("story_type = 'friend_purchase'");
      expect(result).toEqual([{ name: 'Alice', username: 'alice', count: 10 }]);
    });
  });

  describe('getItemCount', () => {
    it('returns parsed count', async () => {
      vi.mocked(queryOne).mockResolvedValue({ c: '42' });
      const count = await getItemCount(1);
      expect(count).toBe(42);
      expect(queryOne).toHaveBeenCalledWith(expect.stringContaining('COUNT(*)'), [1]);
    });

    it('returns 0 when no row', async () => {
      vi.mocked(queryOne).mockResolvedValue(null);
      expect(await getItemCount(1)).toBe(0);
    });
  });

  describe('getItemCountByType', () => {
    it('filters by story type', async () => {
      vi.mocked(queryOne).mockResolvedValue({ c: '5' });
      const count = await getItemCountByType(1, 'friend_purchase');
      expect(count).toBe(5);
      expect(queryOne).toHaveBeenCalledWith(expect.stringContaining('story_type = $2'), [1, 'friend_purchase']);
    });
  });

  describe('getAlbumTracksForFeedItems', () => {
    it('returns empty object for empty input', async () => {
      const result = await getAlbumTracksForFeedItems([]);
      expect(result).toEqual({});
      expect(query).not.toHaveBeenCalled();
    });

    it('groups tracks by album URL and filters singles', async () => {
      vi.mocked(query).mockResolvedValue([
        { album_url: 'https://a.bandcamp.com/album/x', id: 1, release_id: 10, track_num: 1, title: 'T1', duration: 200, stream_url: null, track_url: null, bpm: null, musical_key: null, key_camelot: null, audio_storage_key: null },
        { album_url: 'https://a.bandcamp.com/album/x', id: 2, release_id: 10, track_num: 2, title: 'T2', duration: 180, stream_url: null, track_url: null, bpm: null, musical_key: null, key_camelot: null, audio_storage_key: null },
        { album_url: 'https://b.bandcamp.com/album/y', id: 3, release_id: 20, track_num: 1, title: 'S1', duration: 300, stream_url: null, track_url: null, bpm: null, musical_key: null, key_camelot: null, audio_storage_key: null },
      ]);

      const result = await getAlbumTracksForFeedItems(['https://a.bandcamp.com/album/x', 'https://b.bandcamp.com/album/y']);

      expect(result['https://a.bandcamp.com/album/x']).toHaveLength(2);
      // Single-track album filtered out
      expect(result['https://b.bandcamp.com/album/y']).toBeUndefined();
    });
  });
});
