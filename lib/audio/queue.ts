import { query, queryOne, execute } from '@/lib/db/index';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const AUDIO_ANALYSIS_DELAY_MS = 1500;
const BATCH_SIZE = 50;

/**
 * Process all tracks that haven't been analyzed yet: download MP3, detect BPM +
 * key via Essentia.js WASM, store results on catalog_tracks, and backfill to
 * feed_items and wishlist_items. Loops in batches until no pending tracks remain.
 */
export async function processAudioAnalysisQueue(
  cookie?: string,
  onProgress?: (processed: number, remaining: number) => void,
): Promise<number> {
  const { analyzeTrack } = await import('@/lib/audio/analyze');

  let totalProcessed = 0;

  while (true) {
    const pending = await query<{ id: number; stream_url: string }>(
      "SELECT id, stream_url FROM catalog_tracks WHERE stream_url IS NOT NULL AND stream_url != '' AND bpm_status IS NULL ORDER BY id DESC LIMIT $1",
      [BATCH_SIZE],
    );
    if (pending.length === 0) break;

    const countRow = await queryOne<{ count: string }>(
      "SELECT COUNT(*) as count FROM catalog_tracks WHERE stream_url IS NOT NULL AND stream_url != '' AND bpm_status IS NULL",
    );
    const totalRemaining = countRow ? Number(countRow.count) : 0;

    for (const track of pending) {
      try {
        const result = await analyzeTrack(track.stream_url, cookie);
        await execute(
          "UPDATE catalog_tracks SET bpm = $1, musical_key = $2, key_camelot = $3, bpm_status = 'done' WHERE id = $4",
          [result.bpm, result.musicalKey, result.keyCamelot, track.id],
        );
        await execute(
          "UPDATE feed_items SET bpm = $1, musical_key = $2 WHERE track_stream_url = $3 AND bpm IS NULL",
          [result.bpm, result.musicalKey, track.stream_url],
        );
        await execute(
          "UPDATE wishlist_items SET bpm = $1, musical_key = $2 WHERE stream_url = $3 AND bpm IS NULL",
          [result.bpm, result.musicalKey, track.stream_url],
        );
      } catch (err) {
        console.error(`Audio analysis failed for track ${track.id}:`, err);
        await execute("UPDATE catalog_tracks SET bpm_status = 'failed' WHERE id = $1", [
          track.id,
        ]);
      }

      totalProcessed++;
      onProgress?.(totalProcessed, totalRemaining - totalProcessed);

      await sleep(AUDIO_ANALYSIS_DELAY_MS);
    }
  }

  return totalProcessed;
}
