import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BandcampAPI } from '../api';
import { BandcampClient } from '../client';
import feedFixture from './fixtures/feed-response.json';
import collectionFixture from './fixtures/collection-response.json';
import wishlistFixture from './fixtures/wishlist-response.json';

vi.mock('../client');

describe('BandcampAPI', () => {
  let api: BandcampAPI;
  let mockClient: { get: ReturnType<typeof vi.fn>; postForm: ReturnType<typeof vi.fn>; postJson: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      postForm: vi.fn(),
      postJson: vi.fn(),
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

  describe('getCollection', () => {
    it('normalizes album items with tracklist lookup', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postJson.mockResolvedValue(collectionFixture);

      const page = await api.getCollection();

      expect(page.items).toHaveLength(3);
      expect(page.hasMore).toBe(true);
      expect(page.lastToken).toBe('2004:1740825600:a:');

      const album = page.items[0];
      expect(album.storyType).toBe('my_purchase');
      expect(album.album.title).toBe('Con Todo El Mundo');
      expect(album.artist.name).toBe('Khruangbin');
      expect(album.artist.url).toBe('https://khruangbin.bandcamp.com');
      expect(album.price).toEqual({ amount: 12, currency: 'USD' });
      expect(album.socialSignal.alsoCollectedCount).toBe(42);
    });

    it('prefers mp3-v0 over mp3-128 for stream URL', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postJson.mockResolvedValue(collectionFixture);

      const page = await api.getCollection();

      // a2001 tracklist has both mp3-v0 and mp3-128; should prefer v0
      expect(page.items[0].track?.streamUrl).toBe('https://stream.example.com/maria.mp3');
    });

    it('finds featured track by ID in tracklist', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postJson.mockResolvedValue(collectionFixture);

      const page = await api.getCollection();

      // featured_track=3001 matches first entry in a2001 tracklist
      expect(page.items[0].track?.title).toBe('Maria También');
      expect(page.items[0].track?.duration).toBe(238.5);
    });

    it('looks up single-track items with t-prefix key', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postJson.mockResolvedValue(collectionFixture);

      const page = await api.getCollection();

      // tralbum_type=t, tralbum_id=2002 -> key "t2002"
      const track = page.items[1];
      expect(track.track?.title).toBe('Tala Tannam');
      expect(track.track?.streamUrl).toBe('https://stream.example.com/tala.mp3');
      expect(track.track?.duration).toBe(412.0);
    });

    it('returns track with null streamUrl when tracklist file is null', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postJson.mockResolvedValue(collectionFixture);

      const page = await api.getCollection();

      // a2004 tracklist has file: null but still has a title from the tracklist
      const item = page.items[2];
      expect(item.track?.title).toBe('The Message Continues');
      expect(item.track?.streamUrl).toBeNull();
    });

    it('uses featured_track_title/duration when present instead of tracklist', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postJson.mockResolvedValue(collectionFixture);

      const page = await api.getCollection();

      // Item 0: has featured_track_title="Maria También" and featured_track_duration=238.5
      // These match the tracklist entry, but the code prefers the item-level values
      expect(page.items[0].track?.title).toBe('Maria También');
      expect(page.items[0].track?.duration).toBe(238.5);
    });

    it('sets price to null when price is 0 (name-your-price)', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postJson.mockResolvedValue(collectionFixture);

      const page = await api.getCollection();

      // Item 2 has price: 0
      expect(page.items[2].price).toBeNull();
    });

    it('generates unique IDs from tralbum_id, fanId, and purchase date', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postJson.mockResolvedValue(collectionFixture);

      const page = await api.getCollection();

      expect(page.items[0].id).toBe('mp-2001-12345-15 Jan 2025 10:30:00 GMT');
      expect(page.items[1].id).toBe('mp-2002-12345-20 Feb 2025 18:00:00 GMT');
      // All IDs are unique
      const ids = page.items.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('getWishlist', () => {
    it('normalizes wishlist items with correct fields', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postJson.mockResolvedValue(wishlistFixture);

      const page = await api.getWishlist();

      expect(page.items).toHaveLength(2);
      expect(page.hasMore).toBe(false);
      expect(page.lastToken).toBe('5002:1585701000:t:');
    });

    it('normalizes album wishlist items', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postJson.mockResolvedValue(wishlistFixture);

      const page = await api.getWishlist();
      const album = page.items[0];

      expect(album.id).toBe('wl-a5001');
      expect(album.tralbumId).toBe(5001);
      expect(album.tralbumType).toBe('a');
      expect(album.title).toBe('Gospel Bangers (re-up)');
      expect(album.artistName).toBe('SMBD');
      expect(album.artistUrl).toBe('https://gammenterprises.bandcamp.com');
      expect(album.imageUrl).toBe('https://f4.bcbits.com/img/a884_5.jpg');
      expect(album.itemUrl).toBe('https://gammenterprises.bandcamp.com/album/gospel-bangers-re-up');
      expect(album.alsoCollectedCount).toBe(9);
    });

    it('resolves stream URLs from tracklists', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postJson.mockResolvedValue(wishlistFixture);

      const page = await api.getWishlist();

      expect(page.items[0].streamUrl).toBe('https://bandcamp.com/stream_redirect?track_id=6001');
      expect(page.items[1].streamUrl).toBe('https://bandcamp.com/stream_redirect?track_id=5002');
    });

    it('uses featured track title and duration when available', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postJson.mockResolvedValue(wishlistFixture);

      const page = await api.getWishlist();

      expect(page.items[0].featuredTrackTitle).toBe('Space Is The Place');
      expect(page.items[0].featuredTrackDuration).toBe(395.41);
    });

    it('falls back to tracklist title/duration when featured_track fields are null', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postJson.mockResolvedValue(wishlistFixture);

      const page = await api.getWishlist();
      const track = page.items[1];

      expect(track.featuredTrackTitle).toBe('Chip$ (feat. Meftah)');
      expect(track.featuredTrackDuration).toBe(194.299);
    });

    it('uses item_title for track-type items', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postJson.mockResolvedValue(wishlistFixture);

      const page = await api.getWishlist();

      expect(page.items[1].title).toBe('Chip$ (feat. Meftah)');
    });

    it('generates IDs with wl- prefix and tralbum type+id', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postJson.mockResolvedValue(wishlistFixture);

      const page = await api.getWishlist();

      expect(page.items[0].id).toBe('wl-a5001');
      expect(page.items[1].id).toBe('wl-t5002');
    });

    it('calls the correct API endpoint', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postJson.mockResolvedValue(wishlistFixture);

      await api.getWishlist({ olderThanToken: 'test-token', count: 50 });

      expect(mockClient.postJson).toHaveBeenCalledWith(
        '/api/fancollection/1/wishlist_items',
        { fan_id: 12345, older_than_token: 'test-token', count: 50 },
      );
    });
  });

});
