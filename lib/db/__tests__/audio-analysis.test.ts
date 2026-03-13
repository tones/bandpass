import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedCatalogRelease, seedCatalogTrack, seedFeedItem, seedWishlistItem } from './helpers';

vi.mock('../index', () => {
  let db: Database.Database;
  return {
    getDb: () => db,
    __setDb: (newDb: Database.Database) => { db = newDb; },
  };
});

vi.mock('@/lib/audio/analyze', () => ({
  analyzeTrack: vi.fn().mockResolvedValue({
    bpm: 128.0,
    musicalKey: 'Am',
    keyCamelot: '8A',
  }),
}));

const { __setDb } = await import('../index') as { getDb: () => Database.Database; __setDb: (db: Database.Database) => void };
const { getAudioAnalysisPendingCount, getAudioAnalysisDoneCount } = await import('../sync');
const { processAudioAnalysisQueue } = await import('@/lib/audio/queue');
const { analyzeTrack } = await import('@/lib/audio/analyze') as { analyzeTrack: ReturnType<typeof vi.fn> };

describe('audio analysis queue', () => {
  let db: Database.Database;
  const fanId = 123;

  beforeEach(() => {
    db = createTestDb();
    __setDb(db);
    analyzeTrack.mockClear();
  });

  it('getAudioAnalysisPendingCount returns count of unanalyzed tracks with streams', () => {
    const releaseId = seedCatalogRelease(db);
    seedCatalogTrack(db, releaseId, { streamUrl: 'https://stream1.mp3' });
    seedCatalogTrack(db, releaseId, { streamUrl: 'https://stream2.mp3' });
    seedCatalogTrack(db, releaseId, { streamUrl: null });

    expect(getAudioAnalysisPendingCount()).toBe(2);
  });

  it('getAudioAnalysisDoneCount returns count of completed tracks', () => {
    const releaseId = seedCatalogRelease(db);
    const trackId = seedCatalogTrack(db, releaseId);
    db.prepare("UPDATE catalog_tracks SET bpm_status = 'done' WHERE id = ?").run(trackId);

    expect(getAudioAnalysisDoneCount()).toBe(1);
  });

  it('processAudioAnalysisQueue analyzes tracks and stores results', async () => {
    const releaseId = seedCatalogRelease(db);
    seedCatalogTrack(db, releaseId, { streamUrl: 'https://stream.mp3', title: 'Track 1' });

    const count = await processAudioAnalysisQueue(undefined, 10);
    expect(count).toBe(1);
    expect(analyzeTrack).toHaveBeenCalledWith('https://stream.mp3', undefined);

    const row = db.prepare('SELECT bpm, musical_key, key_camelot, bpm_status FROM catalog_tracks WHERE id = 1').get() as {
      bpm: number; musical_key: string; key_camelot: string; bpm_status: string;
    };
    expect(row.bpm).toBe(128.0);
    expect(row.musical_key).toBe('Am');
    expect(row.key_camelot).toBe('8A');
    expect(row.bpm_status).toBe('done');
  });

  it('backfills BPM/key to feed_items by stream URL', async () => {
    const releaseId = seedCatalogRelease(db);
    seedCatalogTrack(db, releaseId, { streamUrl: 'https://stream.mp3' });
    seedFeedItem(db, fanId, { id: 'feed-1', storyType: 'my_purchase' });
    db.prepare("UPDATE feed_items SET track_stream_url = 'https://stream.mp3' WHERE id = 'feed-1'").run();

    await processAudioAnalysisQueue(undefined, 10);

    const row = db.prepare("SELECT bpm, musical_key FROM feed_items WHERE id = 'feed-1'").get() as {
      bpm: number; musical_key: string;
    };
    expect(row.bpm).toBe(128.0);
    expect(row.musical_key).toBe('Am');
  });

  it('backfills BPM/key to wishlist_items by stream URL', async () => {
    const releaseId = seedCatalogRelease(db);
    seedCatalogTrack(db, releaseId, { streamUrl: 'https://stream.mp3' });
    seedWishlistItem(db, fanId, { id: 'wl-1', streamUrl: 'https://stream.mp3' });

    await processAudioAnalysisQueue(undefined, 10);

    const row = db.prepare("SELECT bpm, musical_key FROM wishlist_items WHERE id = 'wl-1'").get() as {
      bpm: number; musical_key: string;
    };
    expect(row.bpm).toBe(128.0);
    expect(row.musical_key).toBe('Am');
  });

  it('marks track as failed when analyzeTrack throws', async () => {
    analyzeTrack.mockRejectedValueOnce(new Error('decode error'));
    const releaseId = seedCatalogRelease(db);
    seedCatalogTrack(db, releaseId, { streamUrl: 'https://bad-stream.mp3' });

    const count = await processAudioAnalysisQueue(undefined, 10);
    expect(count).toBe(1);

    const row = db.prepare('SELECT bpm_status FROM catalog_tracks WHERE id = 1').get() as { bpm_status: string };
    expect(row.bpm_status).toBe('failed');
  });

  it('skips tracks that are already done', async () => {
    const releaseId = seedCatalogRelease(db);
    const trackId = seedCatalogTrack(db, releaseId, { streamUrl: 'https://stream.mp3' });
    db.prepare("UPDATE catalog_tracks SET bpm_status = 'done', bpm = 120 WHERE id = ?").run(trackId);

    const count = await processAudioAnalysisQueue(undefined, 10);
    expect(count).toBe(0);
    expect(analyzeTrack).not.toHaveBeenCalled();
  });

  it('reports progress via callback', async () => {
    const releaseId = seedCatalogRelease(db);
    seedCatalogTrack(db, releaseId, { title: 'T1', streamUrl: 'https://s1.mp3' });
    seedCatalogTrack(db, releaseId, { title: 'T2', streamUrl: 'https://s2.mp3', trackNum: 2 });

    const progressUpdates: Array<[number, number]> = [];
    await processAudioAnalysisQueue(undefined, 10, (processed, remaining) => {
      progressUpdates.push([processed, remaining]);
    });

    expect(progressUpdates).toEqual([[1, 1], [2, 0]]);
  });
});
