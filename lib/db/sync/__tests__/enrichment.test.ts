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
import { enqueueForEnrichment, getEnrichmentPendingCount, processEnrichmentQueue } from '../enrichment';

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
        .mockResolvedValueOnce({ rowCount: 1 });

      const count = await enqueueForEnrichment(1);
      expect(count).toBe(2);
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('skips duplicates (ON CONFLICT DO NOTHING)', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [{ album_url: 'https://a.bc.com/album/x' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 });

      const count = await enqueueForEnrichment(1);
      expect(count).toBe(0);
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

    it('marks failed items and continues', async () => {
      vi.mocked(query).mockResolvedValue([
        { album_url: 'https://bad.bandcamp.com/album/fail' },
      ]);
      vi.mocked(fetchAlbumTracks).mockRejectedValue(new Error('404'));

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const count = await processEnrichmentQueue();

      expect(count).toBe(1);
      const failCall = vi.mocked(execute).mock.calls.find(([sql]) => sql.includes("status = 'failed'"));
      expect(failCall).toBeDefined();
      spy.mockRestore();
    });
  });
});
