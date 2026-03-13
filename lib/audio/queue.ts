import { getDb } from '@/lib/db/index';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const AUDIO_ANALYSIS_DELAY_MS = 1500;

/**
 * Process tracks that haven't been analyzed yet: download MP3, detect BPM + key
 * via Essentia.js WASM, store results on catalog_tracks, and backfill to
 * feed_items and wishlist_items.
 */
export async function processAudioAnalysisQueue(
  cookie?: string,
  limit = 50,
  onProgress?: (processed: number, remaining: number) => void,
): Promise<number> {
  const db = getDb();

  const pending = db.prepare(
    "SELECT id, stream_url FROM catalog_tracks WHERE stream_url IS NOT NULL AND stream_url != '' AND bpm_status IS NULL ORDER BY id DESC LIMIT ?",
  ).all(limit) as Array<{ id: number; stream_url: string }>;

  if (pending.length === 0) return 0;

  const { analyzeTrack } = await import('@/lib/audio/analyze');

  const updateTrack = db.prepare(
    "UPDATE catalog_tracks SET bpm = ?, musical_key = ?, key_camelot = ?, bpm_status = 'done' WHERE id = ?",
  );
  const markFailed = db.prepare(
    "UPDATE catalog_tracks SET bpm_status = 'failed' WHERE id = ?",
  );
  const backfillFeed = db.prepare(
    "UPDATE feed_items SET bpm = ?, musical_key = ? WHERE track_stream_url = ? AND bpm IS NULL",
  );
  const backfillWishlist = db.prepare(
    "UPDATE wishlist_items SET bpm = ?, musical_key = ? WHERE stream_url = ? AND bpm IS NULL",
  );

  let processed = 0;

  for (const track of pending) {
    try {
      const result = await analyzeTrack(track.stream_url, cookie);
      updateTrack.run(result.bpm, result.musicalKey, result.keyCamelot, track.id);
      backfillFeed.run(result.bpm, result.musicalKey, track.stream_url);
      backfillWishlist.run(result.bpm, result.musicalKey, track.stream_url);
    } catch (err) {
      console.error(`Audio analysis failed for track ${track.id}:`, err);
      markFailed.run(track.id);
    }

    processed++;
    onProgress?.(processed, pending.length - processed);

    if (processed < pending.length) {
      await sleep(AUDIO_ANALYSIS_DELAY_MS);
    }
  }

  return processed;
}
