import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BandcampAPI } from '../api';
import { BandcampClient } from '../client';
import feedFixture from './fixtures/feed-response.json';

vi.mock('../client');

describe('BandcampAPI', () => {
  let api: BandcampAPI;
  let mockClient: { get: ReturnType<typeof vi.fn>; postForm: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      postForm: vi.fn(),
    };
    vi.mocked(BandcampClient).mockImplementation(function () {
      return mockClient as unknown as BandcampClient;
    });
    api = new BandcampAPI('test-cookie');
  });

  describe('getFanId', () => {
    it('returns the fan_id from collection_summary', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      const fanId = await api.getFanId();
      expect(fanId).toBe(12345);
      expect(mockClient.get).toHaveBeenCalledWith('/api/fan/2/collection_summary');
    });
  });

  describe('getFeed', () => {
    it('returns normalized feed items', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postForm.mockResolvedValue(feedFixture);

      const feed = await api.getFeed();

      expect(feed.items).toHaveLength(2);
      expect(feed.oldestStoryDate).toBe(1709400000);
      expect(feed.hasMore).toBe(true);
    });

    it('normalizes story types correctly', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postForm.mockResolvedValue(feedFixture);

      const feed = await api.getFeed();

      expect(feed.items[0].storyType).toBe('friend_purchase');
      expect(feed.items[1].storyType).toBe('new_release');
    });

    it('resolves fan info for friend purchases', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postForm.mockResolvedValue(feedFixture);

      const feed = await api.getFeed();

      expect(feed.items[0].socialSignal.fan).toEqual({
        name: 'Sarah',
        username: 'sarahmusic',
      });
      expect(feed.items[1].socialSignal.fan).toBeNull();
    });

    it('resolves stream URLs from track_list', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postForm.mockResolvedValue(feedFixture);

      const feed = await api.getFeed();

      expect(feed.items[0].track?.streamUrl).toBe(
        'https://bandcamp.com/stream_redirect?enc=mp3-128&track_id=9001'
      );
      expect(feed.items[1].track?.streamUrl).toBe(
        'https://bandcamp.com/stream_redirect?enc=mp3-128&track_id=999'
      );
    });

    it('filters out location tags', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postForm.mockResolvedValue(feedFixture);

      const feed = await api.getFeed();

      expect(feed.items[0].tags).toEqual(['jazz', 'afrobeat']);
      expect(feed.items[0].tags).not.toContain('London');
    });

    it('passes older_than for pagination', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postForm.mockResolvedValue(feedFixture);

      await api.getFeed({ olderThan: 1709000000 });

      expect(mockClient.postForm).toHaveBeenCalledWith(
        '/fan_dash_feed_updates',
        { fan_id: '12345', older_than: '1709000000' },
      );
    });
  });
});
