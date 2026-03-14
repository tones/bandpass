import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockClientQuery = vi.fn();
const mockTransaction = vi.fn(async (fn: (client: { query: typeof mockClientQuery }) => Promise<void>) => {
  await fn({ query: mockClientQuery });
});

vi.mock('../index', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  transaction: (...args: unknown[]) => mockTransaction(...args as Parameters<typeof mockTransaction>),
}));

import { query, queryOne, execute } from '../index';
import {
  getCachedDiscography,
  cacheDiscography,
  getCachedAlbumTracks,
  cacheAlbumTracks,
  ensureCatalogRelease,
  getArtistsFromFeed,
  rowToTrack,
  markNoStreamTracks,
  getPendingTracksForRelease,
} from '../catalog';
import type { CatalogTrackRow } from '../catalog';

describe('catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClientQuery.mockReset();
  });

  describe('rowToTrack', () => {
    it('maps row to CatalogTrack', () => {
      const row: CatalogTrackRow = {
        id: 1,
        release_id: 10,
        track_num: 3,
        title: 'Song',
        duration: 200,
        stream_url: 'https://stream.url',
        track_url: 'https://track.url',
        bpm: 128,
        musical_key: 'A minor',
        key_camelot: '8A',
        audio_storage_key: 's3://bucket/key',
      };
      const track = rowToTrack(row);
      expect(track).toEqual({
        id: 1,
        releaseId: 10,
        trackNum: 3,
        title: 'Song',
        duration: 200,
        streamUrl: 'https://stream.url',
        trackUrl: 'https://track.url',
        bpm: 128,
        musicalKey: 'A minor',
        keyCamelot: '8A',
        audioStorageKey: 's3://bucket/key',
      });
    });

    it('coerces null-ish fields', () => {
      const row: CatalogTrackRow = {
        id: 1, release_id: 10, track_num: 1, title: 'T', duration: 100,
        stream_url: null, track_url: null, bpm: null, musical_key: null,
        key_camelot: null, audio_storage_key: null,
      };
      const track = rowToTrack(row);
      expect(track.streamUrl).toBeNull();
      expect(track.bpm).toBeNull();
      expect(track.musicalKey).toBeNull();
    });
  });

  describe('getCachedDiscography', () => {
    it('returns null when no releases exist', async () => {
      vi.mocked(queryOne).mockResolvedValue(null);
      const result = await getCachedDiscography('test-artist');
      expect(result).toBeNull();
    });

    it('returns null when data is stale (>24h)', async () => {
      const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
      vi.mocked(queryOne).mockResolvedValue({ scraped_at: staleDate });
      const result = await getCachedDiscography('test-artist');
      expect(result).toBeNull();
      expect(query).not.toHaveBeenCalled();
    });

    it('returns releases when fresh', async () => {
      const freshDate = new Date(Date.now() - 1000);
      vi.mocked(queryOne).mockResolvedValue({ scraped_at: freshDate });
      vi.mocked(query).mockResolvedValue([{
        id: 1, band_slug: 'test', band_name: 'Test', band_url: 'https://test.bandcamp.com',
        title: 'Album', url: 'https://test.bandcamp.com/album/x', image_url: 'https://img.jpg',
        release_type: 'album', scraped_at: freshDate.toISOString(), release_date: '2025-01-01',
        tags: '["rock"]',
      }]);

      const result = await getCachedDiscography('test');
      expect(result).toHaveLength(1);
      expect(result![0].title).toBe('Album');
      expect(result![0].tags).toEqual(['rock']);
    });
  });

  describe('cacheDiscography', () => {
    it('inserts new releases via transaction', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] });
      vi.mocked(queryOne).mockResolvedValue(null);
      vi.mocked(query).mockResolvedValue([]);

      await cacheDiscography('slug', 'Band', 'https://slug.bandcamp.com', [
        { title: 'Album', url: 'https://slug.bandcamp.com/album/a', imageUrl: 'https://img.jpg', releaseType: 'album' },
      ]);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      const insertCall = mockClientQuery.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO catalog_releases'),
      );
      expect(insertCall).toBeDefined();
    });

    it('updates existing discography releases', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })             // enrichment check
        .mockResolvedValueOnce({ rows: [{ id: 5 }] })    // existing discography
        .mockResolvedValueOnce({ rows: [] })              // UPDATE
        .mockResolvedValueOnce({ rows: [] });             // DELETE stale
      vi.mocked(queryOne).mockResolvedValue(null);
      vi.mocked(query).mockResolvedValue([]);

      await cacheDiscography('slug', 'Band', 'https://slug.bandcamp.com', [
        { title: 'Updated', url: 'https://slug.bandcamp.com/album/a', imageUrl: 'https://img.jpg', releaseType: 'album' },
      ]);

      const updateCall = mockClientQuery.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('UPDATE catalog_releases SET band_name'),
      );
      expect(updateCall).toBeDefined();
    });

    it('skips releases that already have enrichment source', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })    // enrichment exists
        .mockResolvedValueOnce({ rows: [] });             // DELETE stale
      vi.mocked(queryOne).mockResolvedValue(null);
      vi.mocked(query).mockResolvedValue([]);

      await cacheDiscography('slug', 'Band', 'https://slug.bandcamp.com', [
        { title: 'Album', url: 'https://slug.bandcamp.com/album/a', imageUrl: 'https://img.jpg', releaseType: 'album' },
      ]);

      const insertCalls = mockClientQuery.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO catalog_releases'),
      );
      expect(insertCalls).toHaveLength(0);
    });
  });

  describe('cacheAlbumTracks', () => {
    it('deletes old tracks and inserts new ones via transaction', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] });
      vi.mocked(query).mockResolvedValue([]);

      await cacheAlbumTracks(10, [
        { trackNum: 1, title: 'T1', duration: 200, streamUrl: 'https://s1', trackUrl: null },
        { trackNum: 2, title: 'T2', duration: 180, streamUrl: null, trackUrl: null },
      ]);

      const deleteCall = mockClientQuery.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('DELETE FROM catalog_tracks'),
      );
      expect(deleteCall).toBeDefined();

      const insertCalls = mockClientQuery.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO catalog_tracks'),
      );
      expect(insertCalls).toHaveLength(2);
    });

    it('updates release metadata when releaseDate/tags provided', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] });
      vi.mocked(query).mockResolvedValue([]);

      await cacheAlbumTracks(10, [
        { trackNum: 1, title: 'T', duration: 100, streamUrl: null, trackUrl: null },
      ], '15 Jan 2025', ['rock', 'punk']);

      const updateCall = mockClientQuery.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('UPDATE catalog_releases'),
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![1]).toContain('2025-01-15');
      expect(updateCall![1]).toContain('["rock","punk"]');
    });
  });

  describe('ensureCatalogRelease', () => {
    it('returns existing release id', async () => {
      vi.mocked(queryOne).mockResolvedValue({ id: 5 });
      const id = await ensureCatalogRelease('https://a.bc.com/album/x', 'Band', 'a', 'Album', 'https://img.jpg');
      expect(id).toBe(5);
    });

    it('updates bandcamp_id on existing release if provided', async () => {
      vi.mocked(queryOne).mockResolvedValue({ id: 5 });
      await ensureCatalogRelease('https://a.bc.com/album/x', 'Band', 'a', 'Album', 'https://img.jpg', 12345);
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('bandcamp_id'),
        [12345, 5],
      );
    });

    it('creates new release when not found', async () => {
      vi.mocked(queryOne).mockResolvedValue(null);
      vi.mocked(query).mockResolvedValue([{ id: 42 }]);

      const id = await ensureCatalogRelease('https://a.bc.com/album/x', 'Band', 'a', 'Album', 'https://img.jpg');
      expect(id).toBe(42);
      const [sql] = vi.mocked(query).mock.calls[0];
      expect(sql).toContain('INSERT INTO catalog_releases');
    });
  });

  describe('getArtistsFromFeed', () => {
    it('returns artists grouped by URL', async () => {
      vi.mocked(query).mockResolvedValue([
        { artist_name: 'Band A', artist_url: 'https://a.bandcamp.com', track_count: 10 },
      ]);

      const result = await getArtistsFromFeed(1);
      expect(result).toEqual([{ artistName: 'Band A', artistUrl: 'https://a.bandcamp.com', trackCount: 10 }]);
    });
  });

  describe('markNoStreamTracks', () => {
    it('scopes to release when id provided', async () => {
      vi.mocked(execute).mockResolvedValue({ rowCount: 3 } as never);
      const count = await markNoStreamTracks(10);
      expect(count).toBe(3);
      expect(execute).toHaveBeenCalledWith(expect.stringContaining('release_id = $1'), [10]);
    });

    it('updates all tracks when no release id', async () => {
      vi.mocked(execute).mockResolvedValue({ rowCount: 50 } as never);
      const count = await markNoStreamTracks();
      expect(count).toBe(50);
      const [sql] = vi.mocked(execute).mock.calls[0];
      expect(sql).not.toContain('release_id = $1');
    });
  });

  describe('getPendingTracksForRelease', () => {
    it('returns tracks with stream URLs and no bpm_status', async () => {
      vi.mocked(query).mockResolvedValue([
        { id: 1, stream_url: 'https://s1' },
        { id: 2, stream_url: 'https://s2' },
      ]);

      const result = await getPendingTracksForRelease(10);
      expect(result).toHaveLength(2);
      const [sql] = vi.mocked(query).mock.calls[0];
      expect(sql).toContain('bpm_status IS NULL');
    });
  });

  describe('normalizeDate (tested via cacheAlbumTracks)', () => {
    it('normalizes "15 Jan 2025" to "2025-01-15"', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] });
      vi.mocked(query).mockResolvedValue([]);

      await cacheAlbumTracks(10, [
        { trackNum: 1, title: 'T', duration: 100, streamUrl: null, trackUrl: null },
      ], '15 Jan 2025');

      const updateCall = mockClientQuery.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('UPDATE catalog_releases'),
      );
      expect(updateCall![1][0]).toBe('2025-01-15');
    });

    it('passes through invalid dates unchanged', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] });
      vi.mocked(query).mockResolvedValue([]);

      await cacheAlbumTracks(10, [
        { trackNum: 1, title: 'T', duration: 100, streamUrl: null, trackUrl: null },
      ], 'not-a-date');

      const updateCall = mockClientQuery.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('UPDATE catalog_releases'),
      );
      expect(updateCall![1][0]).toBe('not-a-date');
    });
  });
});
