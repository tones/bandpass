import path from 'path';
import type { Worker as WorkerType } from 'worker_threads';

// Use eval'd require to hide worker_threads from Turbopack's static file tracing
// eslint-disable-next-line no-eval
const { Worker } = eval("require('worker_threads')") as { Worker: new (path: string) => WorkerType };
import { getDb } from '@/lib/db/index';
import { processEnrichmentQueue, getAudioAnalysisPendingCount } from '@/lib/db/sync';
import { createJob, updateJobProgress, completeJob, failJob, getActiveJob, cleanupStaleJobs } from '@/lib/db/sync-jobs';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const WORKER_POLL_INTERVAL_MS = 30_000;
const AUDIO_ANALYSIS_DELAY_MS = 1500;

let started = false;
let storedCookie: string | undefined;
let nudgeResolve: (() => void) | null = null;

export function ensureWorkersStarted(cookie?: string) {
  if (cookie) storedCookie = cookie;
  if (started) return;
  started = true;

  cleanupStaleJobs();

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
      const db = getDb();
      const { c: pendingCount } = db.prepare(
        "SELECT COUNT(*) as c FROM enrichment_queue WHERE status = 'pending'",
      ).get() as { c: number };

      if (pendingCount > 0 && !getActiveJob('enrichment')) {
        const jobId = createJob('enrichment');
        try {
          updateJobProgress(jobId, 0, pendingCount);
          await processEnrichmentQueue((processed, remaining) => {
            updateJobProgress(jobId, processed, processed + remaining);
          });
          completeJob(jobId);
        } catch (err) {
          console.error('Enrichment worker error:', err);
          failJob(jobId, err instanceof Error ? err.message : String(err));
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

function getNextAudioBatch(limit: number): Array<{ id: number; stream_url: string }> {
  const db = getDb();
  return db.prepare(
    "SELECT id, stream_url FROM catalog_tracks WHERE stream_url IS NOT NULL AND stream_url != '' AND bpm_status IS NULL ORDER BY id DESC LIMIT ?",
  ).all(limit) as Array<{ id: number; stream_url: string }>;
}

function saveAudioResult(result: AudioWorkerResult) {
  const db = getDb();
  db.prepare(
    "UPDATE catalog_tracks SET bpm = ?, musical_key = ?, key_camelot = ?, bpm_status = 'done' WHERE id = ?",
  ).run(result.bpm, result.musicalKey, result.keyCamelot, result.trackId);
  db.prepare(
    "UPDATE feed_items SET bpm = ?, musical_key = ? WHERE track_stream_url = ? AND bpm IS NULL",
  ).run(result.bpm, result.musicalKey, result.streamUrl);
  db.prepare(
    "UPDATE wishlist_items SET bpm = ?, musical_key = ? WHERE stream_url = ? AND bpm IS NULL",
  ).run(result.bpm, result.musicalKey, result.streamUrl);
}

function markAudioFailed(trackId: number) {
  const db = getDb();
  db.prepare(
    "UPDATE catalog_tracks SET bpm_status = 'failed' WHERE id = ?",
  ).run(trackId);
}

const WORKER_TIMEOUT_MS = 120_000;

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
      reject(new Error(`Worker thread error: ${err.message}`));
    };

    const onExit = (code: number) => {
      cleanup();
      reject(new Error(`Worker thread exited with code ${code}`));
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

async function audioWorkerLoop() {
  await sleep(5_000);

  let worker: WorkerType | null = null;

  while (true) {
    try {
      const totalPending = getAudioAnalysisPendingCount();
      if (totalPending === 0) {
        await sleep(WORKER_POLL_INTERVAL_MS);
        continue;
      }

      if (getActiveJob('audio_analysis')) {
        await sleep(WORKER_POLL_INTERVAL_MS);
        continue;
      }

      if (!worker) {
        const workerPath = resolveWorkerPath();
        worker = new Worker(workerPath);

        worker.on('error', (err) => {
          console.error('Audio worker thread error:', err);
          worker = null;
        });
        worker.on('exit', (code) => {
          if (code !== 0) console.error(`Audio worker exited with code ${code}`);
          worker = null;
        });
      }

      const jobId = createJob('audio_analysis');
      let done = 0;

      try {
        updateJobProgress(jobId, 0, totalPending);

        let workerDied = false;

        while (!workerDied) {
          const batch = getNextAudioBatch(50);
          if (batch.length === 0) break;

          for (const track of batch) {
            if (!worker) {
              workerDied = true;
              break;
            }

            try {
              const result = await postToWorker(worker, track, storedCookie);
              if ('error' in result && result.error) {
                console.error(`Audio analysis failed for track ${result.trackId}:`, result.error);
                markAudioFailed(result.trackId);
              } else {
                saveAudioResult(result as AudioWorkerResult);
              }
            } catch (err) {
              console.error(`Worker communication error for track ${track.id}:`, err);
              markAudioFailed(track.id);
              if (worker) {
                try { worker.terminate(); } catch { /* ignore */ }
              }
              worker = null;
              workerDied = true;
              break;
            }

            done++;
            const currentPending = getAudioAnalysisPendingCount();
            updateJobProgress(jobId, done, done + currentPending);

            await sleep(AUDIO_ANALYSIS_DELAY_MS);
          }
        }

        if (workerDied) {
          console.error(`Audio worker died after processing ${done} tracks, will retry on next cycle`);
          failJob(jobId, `Worker died after ${done} tracks`);
        } else {
          completeJob(jobId);
        }
      } catch (err) {
        console.error('Audio worker loop error:', err);
        failJob(jobId, err instanceof Error ? err.message : String(err));
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
