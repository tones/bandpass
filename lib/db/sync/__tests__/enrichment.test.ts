import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockClientQuery = vi.fn();
const mockTransaction = vi.fn(async (fn: (client: { query: typeof mockClientQuery }) => Promise<unknown>) => {
  return await fn({ query: mockClientQuery });
});

vi.mock('../../index', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  transaction: (...args: unknown[]) => mockTransaction(...args as Parameters<typeof mockTransaction>),
}));

vi.mock('@/lib/bandcamp/scraper', () => ({
  fetchAlbumTracks: vi.fn(),
  publicFetcher: vi.fn(),
  extractSlug: vi.fn((url: string) => url.replace('https://', '').replace('.bandcamp.com', '')),
}));

vi.mock('../../catalog', () => ({
  ensureCatalogRelease: vi.fn(),
  cacheAlbumTracks: vi.fn(),
}));

vi.mock('../../utils', () => ({
  sleep: vi.fn(),
}));

import { query, queryOne, execute } from '../../index';
import { fetchAlbumTracks } from '@/lib/bandcamp/scraper';
import { ensureCatalogRelease, cacheAlbumTracks } from '../../catalog';
import { enqueueForEnrichment, getEnrichmentPendingCount, getGlobalEnrichmentPendingCount, processEnrichmentQueue } from '../enrichment';

describe('enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClientQuery.mockReset();
  });

  describe('enqueueForEnrichment', () => {
    it('enqueues feed and wishlist URLs via transaction', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [{ album_url: 'https://a.bc.com/album/x' }] })
        .mockResolvedValueOnce({ rows: [{ item_url: 'https://b.bc.com/album/y' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 0 }); // retry-reset UPDATE

      const count = await enqueueForEnrichment(1);
      expect(count).toBe(2);
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('skips duplicates (ON CONFLICT DO NOTHING)', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [{ album_url: 'https://a.bc.com/album/x' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 }); // retry-reset UPDATE

      const count = await enqueueForEnrichment(1);
      expect(count).toBe(0);
    });

    it('feed query does not filter by tags', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 }); // retry-reset UPDATE

      await enqueueForEnrichment(1);

      const feedQuery = mockClientQuery.mock.calls[0][0] as string;
      expect(feedQuery).not.toContain('tags');
      expect(feedQuery).toContain('NOT EXISTS');
    });

    it('resets failed items with retry_count < 3', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 2 }); // retry-reset UPDATE

      await enqueueForEnrichment(1);

      const retryCall = mockClientQuery.mock.calls[2][0] as string;
      expect(retryCall).toContain("status = 'failed'");
      expect(retryCall).toContain('retry_count < 3');
    });
  });

  describe('getEnrichmentPendingCount', () => {
    it('sums feed and wishlist pending counts', async () => {
      vi.mocked(queryOne)
        .mockResolvedValueOnce({ c: '10' })
        .mockResolvedValueOnce({ c: '5' });

      const count = await getEnrichmentPendingCount(1);
      expect(count).toBe(15);
    });

    it('feed count query does not filter by tags', async () => {
      vi.mocked(queryOne)
        .mockResolvedValueOnce({ c: '0' })
        .mockResolvedValueOnce({ c: '0' });

      await getEnrichmentPendingCount(1);

      const feedCall = vi.mocked(queryOne).mock.calls[0][0] as string;
      expect(feedCall).not.toContain('tags');
      expect(feedCall).toContain('NOT EXISTS');
    });
  });

  describe('getGlobalEnrichmentPendingCount', () => {
    it('returns count of pending items in enrichment_queue', async () => {
      vi.mocked(queryOne).mockResolvedValue({ c: '42' });

      const count = await getGlobalEnrichmentPendingCount();
      expect(count).toBe(42);

      const sql = vi.mocked(queryOne).mock.calls[0][0] as string;
      expect(sql).toContain('enrichment_queue');
      expect(sql).toContain("'pending'");
    });
  });

  describe('processEnrichmentQueue', () => {
    it('returns 0 when queue is empty', async () => {
      vi.mocked(query).mockResolvedValue([]);
      const count = await processEnrichmentQueue();
      expect(count).toBe(0);
    });

    it('processes items and calls onProgress', async () => {
      vi.mocked(query).mockResolvedValue([
        { album_url: 'https://artist.bandcamp.com/album/test' },
      ]);
      vi.mocked(fetchAlbumTracks).mockResolvedValue({
        title: 'Test',
        artist: 'Artist',
        imageUrl: 'https://img.jpg',
        bandcampId: 123,
        releaseDate: '2025-01-01',
        tags: ['rock'],
        tracks: [{ trackNum: 1, title: 'T1', duration: 200, streamUrl: 'https://s1', trackUrl: null, bandcampTrackId: 456 }],
      } as never);
      vi.mocked(ensureCatalogRelease).mockResolvedValue(10);

      const onProgress = vi.fn();
      const count = await processEnrichmentQueue(onProgress);

      expect(count).toBe(1);
      expect(ensureCatalogRelease).toHaveBeenCalledTimes(1);
      expect(cacheAlbumTracks).toHaveBeenCalledTimes(1);
      expect(onProgress).toHaveBeenCalledWith(1, 0);

      const executeCalls = vi.mocked(execute).mock.calls;
      const doneCall = executeCalls.find(([sql]) => sql.includes("status = 'done'"));
      expect(doneCall).toBeDefined();
    });

    it('records retry_count and last_error on failure', async () => {
      vi.mocked(query).mockResolvedValue([
        { album_url: 'https://bad.bandcamp.com/album/fail' },
      ]);
      vi.mocked(fetchAlbumTracks).mockRejectedValue(new Error('404 Not Found'));

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await processEnrichmentQueue();

      const failCall = vi.mocked(execute).mock.calls.find(([sql]) => sql.includes("status = 'failed'"));
      expect(failCall).toBeDefined();
      const [sql, params] = failCall!;
      expect(sql).toContain('retry_count = retry_count + 1');
      expect(sql).toContain('last_error');
      expect(params).toEqual(['https://bad.bandcamp.com/album/fail', '404 Not Found']);
      spy.mockRestore();
    });

    it('aborts after MAX_CONSECUTIVE_FAILURES', async () => {
      const items = Array.from({ length: 25 }, (_, i) => ({
        album_url: `https://bad.bandcamp.com/album/fail-${i}`,
      }));
      vi.mocked(query).mockResolvedValue(items);
      vi.mocked(fetchAlbumTracks).mockRejectedValue(new Error('503'));

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onProgress = vi.fn();
      const count = await processEnrichmentQueue(onProgress);

      expect(count).toBe(20);
      expect(onProgress).toHaveBeenCalledTimes(20);
      spy.mockRestore();
    });

    it('applies exponential backoff after consecutive failures', async () => {
      const { sleep } = await import('../../utils');
      const items = Array.from({ length: 7 }, (_, i) => ({
        album_url: `https://bad.bandcamp.com/album/fail-${i}`,
      }));
      vi.mocked(query).mockResolvedValue(items);
      vi.mocked(fetchAlbumTracks).mockRejectedValue(new Error('503'));

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await processEnrichmentQueue();

      const sleepCalls = vi.mocked(sleep).mock.calls.map(([ms]) => ms);
      expect(sleepCalls[0]).toBe(1000);
      expect(sleepCalls[4]).toBe(1000);
      expect(sleepCalls[5]).toBe(2000);
      expect(sleepCalls[6]).toBeUndefined();
      spy.mockRestore();
    });

    it('resets consecutive failure count on success', async () => {
      const { sleep } = await import('../../utils');
      vi.mocked(query).mockResolvedValue([
        { album_url: 'https://bad.bandcamp.com/album/fail-1' },
        { album_url: 'https://bad.bandcamp.com/album/fail-2' },
        { album_url: 'https://bad.bandcamp.com/album/fail-3' },
        { album_url: 'https://bad.bandcamp.com/album/fail-4' },
        { album_url: 'https://bad.bandcamp.com/album/fail-5' },
        { album_url: 'https://good.bandcamp.com/album/ok' },
        { album_url: 'https://bad.bandcamp.com/album/fail-6' },
      ]);

      vi.mocked(fetchAlbumTracks)
        .mockRejectedValueOnce(new Error('503'))
        .mockRejectedValueOnce(new Error('503'))
        .mockRejectedValueOnce(new Error('503'))
        .mockRejectedValueOnce(new Error('503'))
        .mockRejectedValueOnce(new Error('503'))
        .mockResolvedValueOnce({
          title: 'OK', artist: 'Artist', imageUrl: 'https://img.jpg',
          bandcampId: 1, releaseDate: '2025-01-01', tags: [],
          tracks: [{ trackNum: 1, title: 'T', duration: 100, streamUrl: null, trackUrl: null, bandcampTrackId: null }],
        } as never)
        .mockRejectedValueOnce(new Error('503'));

      vi.mocked(ensureCatalogRelease).mockResolvedValue(10);

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await processEnrichmentQueue();

      const sleepCalls = vi.mocked(sleep).mock.calls.map(([ms]) => ms);
      expect(sleepCalls[4]).toBe(1000);
      expect(sleepCalls[5]).toBe(1000);
      spy.mockRestore();
    });
  });
});
