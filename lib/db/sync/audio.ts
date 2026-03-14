/**
 * Audio analysis queue counters: pending tracks needing BPM/key analysis
 * and completed track count. The actual analysis runs in worker/main.ts.
 */
import { queryOne } from '../index';

export async function getAudioAnalysisPendingCount(): Promise<number> {
  const row = await queryOne<{ c: string }>(
    "SELECT COUNT(*) AS c FROM catalog_tracks WHERE stream_url IS NOT NULL AND stream_url != '' AND bpm_status IS NULL",
  );
  return parseInt(row!.c, 10);
}

export async function getAudioAnalysisDoneCount(): Promise<number> {
  const row = await queryOne<{ c: string }>(
    "SELECT COUNT(*) AS c FROM catalog_tracks WHERE bpm_status = 'done'",
  );
  return parseInt(row!.c, 10);
}
