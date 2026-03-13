import path from 'path';
import type { Worker as WorkerType } from 'worker_threads';

// Use eval'd require to hide worker_threads from Turbopack's static file tracing
// eslint-disable-next-line no-eval
const { Worker } = eval("require('worker_threads')") as { Worker: new (path: string) => WorkerType };
import { execute, queryOne } from '@/lib/db/index';
import { processEnrichmentQueue, getAudioAnalysisPendingCount } from '@/lib/db/sync';
import { createJob, updateJobProgress, completeJob, failJob, getActiveJob, cleanupStaleJobs, incrementJobErrors } from '@/lib/db/sync-jobs';
import { getReleasesNeedingStreamRefresh, refreshStreamUrls, markNoStreamTracks, getPendingTracksForRelease } from '@/lib/db/catalog';
import { fetchAlbumTracks, publicFetcher } from '@/lib/bandcamp/scraper';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const WORKER_POLL_INTERVAL_MS = 30_000;
const AUDIO_ANALYSIS_DELAY_MS = 1500;

let started = false;
let storedCookie: string | undefined;
let nudgeResolve: (() => void) | null = null;
let audioCancelRequested = false;

export function cancelAudioAnalysis() {
  audioCancelRequested = true;
}

export function ensureWorkersStarted(cookie?: string) {
  if (cookie) storedCookie = cookie;
  if (started) return;
  started = true;

  cleanupStaleJobs().catch((err) => console.error('Failed to clean up stale jobs:', err));

  enrichmentWorkerLoop().catch((err) =>
    console.error('Enrichment worker crashed:', err),
  );

  if (process.env.ENABLE_AUDIO_ANALYSIS === 'true') {
    audioWorkerLoop().catch((err) =>
      console.error('Audio worker crashed:', err),
    );
  }
}

/**
 * Wake up background workers immediately instead of waiting for the next poll.
 * Called after user sync completes and enqueues new work.
 */
export function nudgeWorkers() {
  if (nudgeResolve) {
    nudgeResolve();
    nudgeResolve = null;
  }
}

function sleepOrNudge(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      nudgeResolve = null;
      resolve();
    }, ms);
    nudgeResolve = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}

async function enrichmentWorkerLoop() {
  while (true) {
    try {
      const row = await queryOne<{ c: string }>("SELECT COUNT(*) as c FROM enrichment_queue WHERE status = 'pending'");
      const pendingCount = parseInt(row?.c ?? '0', 10);

      if (pendingCount > 0 && !(await getActiveJob('enrichment'))) {
        const jobId = await createJob('enrichment');
        try {
          await updateJobProgress(jobId, 0, pendingCount);
          await processEnrichmentQueue((processed, remaining) => {
            updateJobProgress(jobId, processed, processed + remaining);
          });
          await completeJob(jobId);
        } catch (err) {
          console.error('Enrichment worker error:', err);
          await failJob(jobId, err instanceof Error ? err.message : String(err));
        }
      }
    } catch (err) {
      console.error('Enrichment worker loop error:', err);
    }

    await sleepOrNudge(WORKER_POLL_INTERVAL_MS);
  }
}

interface AudioWorkerResult {
  trackId: number;
  streamUrl: string;
  bpm: number;
  musicalKey: string;
  keyCamelot: string | null;
  error?: undefined;
}

interface AudioWorkerError {
  trackId: number;
  error: string;
}

type AudioWorkerMessage = AudioWorkerResult | AudioWorkerError;

async function saveAudioResult(result: AudioWorkerResult) {
  await execute(
    "UPDATE catalog_tracks SET bpm = $1, musical_key = $2, key_camelot = $3, bpm_status = 'done' WHERE id = $4",
    [result.bpm, result.musicalKey, result.keyCamelot, result.trackId],
  );
  await execute(
    "UPDATE feed_items SET bpm = $1, musical_key = $2 WHERE track_stream_url = $3 AND bpm IS NULL",
    [result.bpm, result.musicalKey, result.streamUrl],
  );
  await execute(
    "UPDATE wishlist_items SET bpm = $1, musical_key = $2 WHERE stream_url = $3 AND bpm IS NULL",
    [result.bpm, result.musicalKey, result.streamUrl],
  );
}

async function markAudioFailed(trackId: number) {
  await execute(
    "UPDATE catalog_tracks SET bpm_status = 'failed' WHERE id = $1",
    [trackId],
  );
}

const WORKER_TIMEOUT_MS = 120_000;

class WorkerDiedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerDiedError';
  }
}

function postToWorker(worker: WorkerType, track: { id: number; stream_url: string }, cookie?: string): Promise<AudioWorkerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Worker timeout after ${WORKER_TIMEOUT_MS / 1000}s for track ${track.id}`));
    }, WORKER_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      (worker as unknown as NodeJS.EventEmitter).removeListener('message', onMessage);
      (worker as unknown as NodeJS.EventEmitter).removeListener('error', onError);
      (worker as unknown as NodeJS.EventEmitter).removeListener('exit', onExit);
    };

    const onMessage = (msg: AudioWorkerMessage) => {
      if ('trackId' in msg && msg.trackId === track.id) {
        cleanup();
        resolve(msg);
      }
    };

    const onError = (err: Error) => {
      cleanup();
      reject(new WorkerDiedError(`Worker thread error: ${err.message}`));
    };

    const onExit = (code: number) => {
      cleanup();
      reject(new WorkerDiedError(`Worker thread exited with code ${code}`));
    };

    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.on('exit', onExit);
    worker.postMessage({ trackId: track.id, streamUrl: track.stream_url, cookie });
  });
}

function resolveWorkerPath(): string {
  return path.join(process.cwd(), 'lib', 'audio', 'worker.js');
}

const MAX_CONSECUTIVE_FAILURES = 20;
const URL_REFRESH_DELAY_MS = 2_000;

function spawnWorker(): WorkerType {
  const workerPath = resolveWorkerPath();
  console.log('Spawning audio analysis worker thread...');
  return new Worker(workerPath);
}

async function audioWorkerLoop() {
  await sleep(5_000);

  let worker: WorkerType | null = null;

  while (true) {
    try {
      const totalPending = await getAudioAnalysisPendingCount();
      if (totalPending === 0) {
        await sleep(WORKER_POLL_INTERVAL_MS);
        continue;
      }

      if (await getActiveJob('audio_analysis')) {
        await sleep(WORKER_POLL_INTERVAL_MS);
        continue;
      }

      audioCancelRequested = false;
      const jobId = await createJob('audio_analysis');
      let done = 0;
      let consecutiveFailures = 0;
      let aborted = false;

      try {
        const releases = await getReleasesNeedingStreamRefresh();
        await updateJobProgress(jobId, 0, totalPending, 'analyzing');
        console.log(`Audio analysis: ${releases.length} releases to process, ${totalPending} tracks pending`);

        for (let ri = 0; ri < releases.length && !aborted; ri++) {
          if (audioCancelRequested) {
            console.log('Audio analysis cancelled by user');
            await failJob(jobId, 'Cancelled by user');
            aborted = true;
            break;
          }

          const release = releases[ri];
          console.log(`Processing release ${ri + 1}/${releases.length}: ${release.releaseUrl}`);

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
            console.error(`Failed to refresh URLs for release ${release.releaseId} (${release.releaseUrl}):`, err);
          }

          await markNoStreamTracks(release.releaseId);

          const tracks = await getPendingTracksForRelease(release.releaseId);

          for (const track of tracks) {
            if (audioCancelRequested) {
              console.log('Audio analysis cancelled by user');
              await failJob(jobId, 'Cancelled by user');
              aborted = true;
              break;
            }

            if (!worker) {
              try {
                worker = spawnWorker();
              } catch (spawnErr) {
                console.error('Failed to spawn audio worker:', spawnErr);
                await failJob(jobId, `Cannot spawn worker: ${spawnErr}`);
                aborted = true;
                break;
              }
            }

            try {
              const result = await postToWorker(worker, track, storedCookie);
              if ('error' in result && result.error) {
                console.error(`Track ${result.trackId} error: ${result.error} (url: ${track.stream_url.slice(0, 80)}...)`);
                await markAudioFailed(result.trackId);
                await incrementJobErrors(jobId);
                consecutiveFailures++;
              } else {
                await saveAudioResult(result as AudioWorkerResult);
                consecutiveFailures = 0;
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`Worker crash for track ${track.id}: ${msg} (url: ${track.stream_url.slice(0, 80)}...)`);
              await markAudioFailed(track.id);
              await incrementJobErrors(jobId);

              if (worker) {
                try { worker.terminate(); } catch { /* ignore */ }
              }
              worker = null;

              consecutiveFailures++;
              if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                console.error(`Aborting: ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
                await failJob(jobId, `${MAX_CONSECUTIVE_FAILURES} consecutive track failures`);
                aborted = true;
                break;
              }

              continue;
            }

            done++;
            const currentPending = await getAudioAnalysisPendingCount();
            await updateJobProgress(jobId, done, done + currentPending, 'analyzing');

            await sleep(AUDIO_ANALYSIS_DELAY_MS);
          }

          if (!aborted) {
            await sleep(URL_REFRESH_DELAY_MS);
          }
        }

        if (!aborted) {
          await completeJob(jobId);
          console.log(`Audio analysis job completed: ${done} tracks processed`);
        }
      } catch (err) {
        console.error('Audio worker loop error:', err);
        await failJob(jobId, err instanceof Error ? err.message : String(err));
        if (worker) {
          try { worker.terminate(); } catch { /* ignore */ }
          worker = null;
        }
      }
    } catch (err) {
      console.error('Audio worker outer loop error:', err);
    }

    await sleep(WORKER_POLL_INTERVAL_MS);
  }
}
