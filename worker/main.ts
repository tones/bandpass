import { execute, queryOne } from '../lib/db/index';
import {
  getReleasesNeedingStreamRefresh,
  refreshStreamUrls,
  markNoStreamTracks,
  getPendingTracksForRelease,
} from '../lib/db/catalog';
import {
  createJob,
  updateJobProgress,
  completeJob,
  failJob,
  getActiveJob,
  incrementJobErrors,
  cleanupStaleJobs,
} from '../lib/db/sync-jobs';
import { getAudioAnalysisPendingCount } from '../lib/db/sync';
import { fetchAlbumTracks, publicFetcher } from '../lib/bandcamp/scraper';
import { normalizeBpm, toCamelot, formatKey } from '../lib/audio/camelot';

import type { Essentia } from 'essentia.js';

const POLL_INTERVAL_MS = 30_000;
const TRACK_DELAY_MS = 1_500;
const RELEASE_DELAY_MS = 2_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_CONSECUTIVE_FAILURES = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let essentiaInstance: Essentia | null = null;

async function getEssentia(): Promise<Essentia> {
  if (essentiaInstance) return essentiaInstance;
  console.log('Loading Essentia WASM...');
  const { Essentia, EssentiaWASM } = await import('essentia.js');
  essentiaInstance = new Essentia(EssentiaWASM);
  console.log('Essentia WASM loaded');
  return essentiaInstance;
}

async function analyzeTrack(
  streamUrl: string,
): Promise<{ bpm: number; musicalKey: string; keyCamelot: string | null }> {
  const controller = new AbortController();
  const fetchTimer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(streamUrl, { redirect: 'follow', signal: controller.signal });
  } finally {
    clearTimeout(fetchTimer);
  }

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const mp3Buffer = Buffer.from(await resp.arrayBuffer());

  const decode = (await import('audio-decode')).default;
  const audioBuffer = await decode(mp3Buffer);
  const pcm = audioBuffer.getChannelData(0);

  const essentia = await getEssentia();
  const signal = essentia.arrayToVector(pcm);

  try {
    const bpmResult = essentia.PercivalBpmEstimator(signal);
    const bpm = normalizeBpm(bpmResult.bpm);
    const keyResult = essentia.KeyExtractor(signal);
    const musicalKey = formatKey(keyResult.key, keyResult.scale);
    const keyCamelot = toCamelot(keyResult.key, keyResult.scale);
    return { bpm, musicalKey, keyCamelot };
  } finally {
    signal.delete();
  }
}

async function saveAudioResult(
  trackId: number,
  streamUrl: string,
  result: { bpm: number; musicalKey: string; keyCamelot: string | null },
) {
  await execute(
    "UPDATE catalog_tracks SET bpm = $1, musical_key = $2, key_camelot = $3, bpm_status = 'done' WHERE id = $4",
    [result.bpm, result.musicalKey, result.keyCamelot, trackId],
  );
  await execute(
    'UPDATE feed_items SET bpm = $1, musical_key = $2 WHERE track_stream_url = $3 AND bpm IS NULL',
    [result.bpm, result.musicalKey, streamUrl],
  );
  await execute(
    'UPDATE wishlist_items SET bpm = $1, musical_key = $2 WHERE stream_url = $3 AND bpm IS NULL',
    [result.bpm, result.musicalKey, streamUrl],
  );
}

async function markAudioFailed(trackId: number) {
  await execute(
    "UPDATE catalog_tracks SET bpm_status = 'failed' WHERE id = $1",
    [trackId],
  );
}

async function isJobCancelled(jobId: number): Promise<boolean> {
  const row = await queryOne<{ cancel_requested: boolean }>(
    'SELECT cancel_requested FROM sync_jobs WHERE id = $1',
    [jobId],
  );
  return row?.cancel_requested === true;
}

async function processReleases() {
  const totalPending = await getAudioAnalysisPendingCount();
  if (totalPending === 0) return;

  if (await getActiveJob('audio_analysis')) return;

  const jobId = await createJob('audio_analysis');
  let done = 0;
  let consecutiveFailures = 0;

  try {
    const releases = await getReleasesNeedingStreamRefresh();
    await updateJobProgress(jobId, 0, totalPending, 'analyzing');
    console.log(`Audio analysis: ${releases.length} releases, ${totalPending} tracks pending`);

    for (let ri = 0; ri < releases.length; ri++) {
      if (await isJobCancelled(jobId)) {
        console.log('Audio analysis cancelled by user');
        await failJob(jobId, 'Cancelled by user');
        return;
      }

      const release = releases[ri];
      console.log(`Release ${ri + 1}/${releases.length}: ${release.releaseUrl}`);

      try {
        const album = await fetchAlbumTracks(publicFetcher, release.releaseUrl);
        await refreshStreamUrls(
          release.releaseId,
          album.tracks.map((t) => ({
            trackNum: t.trackNum,
            streamUrl: t.streamUrl,
            trackUrl: t.trackUrl,
          })),
        );
      } catch (err) {
        console.error(`Failed to refresh URLs for release ${release.releaseId}:`, err);
      }

      await markNoStreamTracks(release.releaseId);
      const tracks = await getPendingTracksForRelease(release.releaseId);

      for (const track of tracks) {
        if (await isJobCancelled(jobId)) {
          console.log('Audio analysis cancelled by user');
          await failJob(jobId, 'Cancelled by user');
          return;
        }

        try {
          console.log(`  Track ${track.id}: analyzing...`);
          const result = await analyzeTrack(track.stream_url);
          await saveAudioResult(track.id, track.stream_url, result);
          console.log(`  Track ${track.id}: bpm=${result.bpm} key=${result.musicalKey}`);
          consecutiveFailures = 0;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  Track ${track.id} failed: ${msg}`);
          await markAudioFailed(track.id);
          await incrementJobErrors(jobId);
          consecutiveFailures++;

          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            console.error(`Aborting: ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
            await failJob(jobId, `${MAX_CONSECUTIVE_FAILURES} consecutive track failures`);
            return;
          }

          continue;
        }

        done++;
        const currentPending = await getAudioAnalysisPendingCount();
        await updateJobProgress(jobId, done, done + currentPending, 'analyzing');
        await sleep(TRACK_DELAY_MS);
      }

      await sleep(RELEASE_DELAY_MS);
    }

    await completeJob(jobId);
    console.log(`Audio analysis complete: ${done} tracks processed`);
  } catch (err) {
    console.error('Audio analysis error:', err);
    await failJob(jobId, err instanceof Error ? err.message : String(err));
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  console.log('Audio worker starting...');
  await cleanupStaleJobs();

  // Pre-load Essentia WASM so it's warm for first analysis
  await getEssentia();

  while (true) {
    try {
      await processReleases();
    } catch (err) {
      console.error('Worker loop error:', err);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

main().catch((err) => {
  console.error('Worker fatal:', err);
  process.exit(1);
});
