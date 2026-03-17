/**
 * Background worker: a standalone Node process (Fly.io "worker" group)
 * that runs two loops concurrently:
 *   1. Catalog enrichment -- scrapes album pages for tags/tracks/metadata
 *   2. Audio analysis -- extracts BPM/key via Python Essentia
 *
 * Both loops poll the database, track progress via sync_jobs with periodic
 * heartbeats, and shut down gracefully on SIGTERM/SIGINT.
 */
import http from 'http';
import fs from 'fs';
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
  updateHeartbeat,
} from '../lib/db/sync-jobs';
import { getAudioAnalysisPendingCount, processEnrichmentQueue } from '../lib/db/sync';
import { fetchAlbumTracks, publicFetcher } from '../lib/bandcamp/scraper';
import { isS3Configured, uploadTrackFromFile } from '../lib/s3';
import { sleep } from '../lib/db/utils';
import { EssentiaProcess, AnalyzerPool } from './analyzer';

let shuttingDown = false;
let lastProgressAt = Date.now();
let hasActiveAnalysisJob = false;

const POLL_INTERVAL_MS = 30_000;
const TRACK_DELAY_MS = 750;
const RELEASE_DELAY_MS = 1_000;
const MAX_CONSECUTIVE_FAILURES = 20;
const STALL_THRESHOLD_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Catalog enrichment loop
// ---------------------------------------------------------------------------

async function catalogEnrichmentLoop() {
  console.log('Catalog enrichment loop started');

  while (!shuttingDown) {
    try {
      const row = await queryOne<{ c: string }>(
        "SELECT COUNT(*) as c FROM enrichment_queue WHERE status = 'pending'",
      );
      const pendingCount = parseInt(row?.c ?? '0', 10);

      if (pendingCount > 0 && !(await getActiveJob('enrichment'))) {
        const jobId = await createJob('enrichment');

        const heartbeatInterval = setInterval(async () => {
          try { await updateHeartbeat(jobId); } catch (err) {
            console.error('Catalog enrichment heartbeat failed:', err);
          }
        }, 30_000);

        try {
          await updateHeartbeat(jobId);
          await updateJobProgress(jobId, 0, pendingCount);
          await processEnrichmentQueue((processed, remaining) => {
            updateJobProgress(jobId, processed, processed + remaining);
          });
          await completeJob(jobId);
        } catch (err) {
          console.error('Catalog enrichment error:', err);
          await failJob(jobId, err instanceof Error ? err.message : String(err));
        } finally {
          clearInterval(heartbeatInterval);
        }
      }
    } catch (err) {
      console.error('Catalog enrichment loop error:', err);
    }

    if (!shuttingDown) {
      await sleep(POLL_INTERVAL_MS);
    }
  }

  console.log('Catalog enrichment loop stopped');
}

// ---------------------------------------------------------------------------
// Audio analysis
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 30_000;

function timedFetcher(url: string): Promise<string> {
  return publicFetcher(url, AbortSignal.timeout(FETCH_TIMEOUT_MS));
}

const CONCURRENCY = Math.max(1, parseInt(process.env.ANALYZER_CONCURRENCY ?? '2', 10));
let pool: AnalyzerPool;
let s3Enabled = false;

async function saveAudioResult(
  trackId: number,
  streamUrl: string,
  result: { bpm: number; musicalKey: string; keyCamelot: string | null },
  audioStorageKey?: string,
) {
  await execute(
    "UPDATE catalog_tracks SET bpm = $1, musical_key = $2, key_camelot = $3, bpm_status = 'done', audio_storage_key = COALESCE($5, audio_storage_key) WHERE id = $4",
    [result.bpm, result.musicalKey, result.keyCamelot, trackId, audioStorageKey ?? null],
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
  await execute("UPDATE catalog_tracks SET bpm_status = 'failed' WHERE id = $1", [trackId]);
}

async function isJobCancelled(jobId: number): Promise<boolean> {
  const row = await queryOne<{ cancel_requested: boolean }>(
    'SELECT cancel_requested FROM sync_jobs WHERE id = $1',
    [jobId],
  );
  return row?.cancel_requested === true;
}

async function analyzeTrack(
  analyzer: EssentiaProcess,
  track: { id: number; stream_url: string },
  jobId: number,
): Promise<boolean> {
  try {
    console.log(`  ${analyzer.tag} Track ${track.id}: analyzing...`);
    const result = await analyzer.analyze(track.stream_url);

    let storageKey: string | undefined;
    if (s3Enabled && result.tempFile) {
      try {
        storageKey = await uploadTrackFromFile(track.id, result.tempFile);
        console.log(`  ${analyzer.tag} Track ${track.id}: uploaded to S3 (${storageKey})`);
      } catch (uploadErr) {
        console.error(`  ${analyzer.tag} Track ${track.id}: S3 upload failed, continuing without storage:`, uploadErr);
      }
    }

    if (result.tempFile) {
      try { fs.unlinkSync(result.tempFile); } catch {}
    }

    await saveAudioResult(track.id, track.stream_url, result, storageKey);
    lastProgressAt = Date.now();
    console.log(`  ${analyzer.tag} Track ${track.id}: bpm=${result.bpm} key=${result.musicalKey}`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ${analyzer.tag} Track ${track.id} failed: ${msg}`);
    await markAudioFailed(track.id);
    await incrementJobErrors(jobId);
    return false;
  }
}

async function processReleases() {
  const totalPending = await getAudioAnalysisPendingCount();
  if (totalPending === 0) return;

  if (await getActiveJob('audio_analysis')) return;

  const jobId = await createJob('audio_analysis');
  hasActiveAnalysisJob = true;
  lastProgressAt = Date.now();
  let done = 0;
  let errors = 0;
  let consecutiveFailures = 0;
  let cancelled = false;
  const startedAt = Date.now();

  const heartbeatInterval = setInterval(async () => {
    try {
      await updateHeartbeat(jobId);
    } catch (err) {
      console.error('Heartbeat update failed:', err);
    }
  }, 30_000);

  const progressInterval = setInterval(async () => {
    const elapsed = (Date.now() - startedAt) / 1000;
    const rate = done > 0 ? (elapsed / done).toFixed(1) : '?';
    const currentPending = await getAudioAnalysisPendingCount().catch(() => null);
    const remaining = currentPending ?? '?';
    const eta = done > 0 && typeof currentPending === 'number'
      ? `${Math.round((currentPending * elapsed) / done / 60)}min`
      : '?';
    console.log(`[progress] done=${done} errors=${errors} remaining=${remaining} rate=${rate}s/track eta=${eta}`);
  }, 60_000);

  try {
    await updateHeartbeat(jobId);

    const releases = await getReleasesNeedingStreamRefresh();
    await updateJobProgress(jobId, 0, totalPending, 'analyzing');
    console.log(`Audio analysis: ${releases.length} releases, ${totalPending} tracks pending (concurrency: ${CONCURRENCY})`);

    for (let ri = 0; ri < releases.length; ri++) {
      if (cancelled) break;

      if (await isJobCancelled(jobId)) {
        console.log('Audio analysis cancelled by user');
        await failJob(jobId, 'Cancelled by user');
        return;
      }

      const release = releases[ri];
      console.log(`Release ${ri + 1}/${releases.length}: ${release.releaseUrl}`);

      try {
        const album = await fetchAlbumTracks(timedFetcher, release.releaseUrl);
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

      const inflight: Promise<void>[] = [];

      for (const track of tracks) {
        if (cancelled) break;

        if (await isJobCancelled(jobId)) {
          console.log('Audio analysis cancelled by user, waiting for in-flight tracks...');
          cancelled = true;
          break;
        }

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.error(`Aborting: ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
          cancelled = true;
          break;
        }

        const analyzer = await pool.acquire();
        await sleep(TRACK_DELAY_MS);

        inflight.push(
          analyzeTrack(analyzer, track, jobId)
            .then(async (success) => {
              pool.release(analyzer);
              if (success) {
                consecutiveFailures = 0;
                done++;
                if (done % 10 === 0) {
                  const currentPending = await getAudioAnalysisPendingCount();
                  await updateJobProgress(jobId, done, done + currentPending, 'analyzing');
                }
              } else {
                consecutiveFailures++;
                errors++;
              }
            })
            .catch(() => {
              pool.release(analyzer);
            }),
        );
      }

      await Promise.allSettled(inflight);

      if (cancelled) {
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          await failJob(jobId, `${MAX_CONSECUTIVE_FAILURES} consecutive track failures`);
        } else {
          await failJob(jobId, 'Cancelled by user');
        }
        return;
      }

      await sleep(RELEASE_DELAY_MS);
    }

    await completeJob(jobId);
    console.log(`Audio analysis complete: ${done} tracks processed`);
  } catch (err) {
    console.error('Audio analysis error:', err);
    await failJob(jobId, err instanceof Error ? err.message : String(err));
  } finally {
    hasActiveAnalysisJob = false;
    clearInterval(heartbeatInterval);
    clearInterval(progressInterval);
  }
}

const HEALTH_PORT = parseInt(process.env.WORKER_HEALTH_PORT ?? '8080', 10);

function startHealthServer() {
  const server = http.createServer((_req, res) => {
    const stalledMs = Date.now() - lastProgressAt;

    if (hasActiveAnalysisJob && stalledMs > STALL_THRESHOLD_MS) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end(`stalled: no progress for ${Math.round(stalledMs / 1000)}s`);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    }
  });
  server.listen(HEALTH_PORT, () => {
    console.log(`Health check server listening on port ${HEALTH_PORT}`);
  });
}

async function audioAnalysisLoop() {
  if (process.env.ENABLE_AUDIO_ANALYSIS !== 'true') {
    await execute(
      "UPDATE sync_jobs SET status = 'done', error = NULL, updated_at = NOW() WHERE status = 'running' AND job_type = 'audio_analysis'",
    );
    console.log('Audio analysis disabled (ENABLE_AUDIO_ANALYSIS != true). Loop idle.');
    while (!shuttingDown) await sleep(60_000);
    return;
  }

  s3Enabled = isS3Configured();
  const pendingAtStart = await getAudioAnalysisPendingCount();
  console.log(`Audio analysis starting (S3: ${s3Enabled ? 'on' : 'off'}, concurrency: ${CONCURRENCY}, pending: ${pendingAtStart})`);

  pool = new AnalyzerPool(CONCURRENCY);
  await pool.start();

  while (!shuttingDown) {
    try {
      await processReleases();
    } catch (err) {
      console.error('Audio analysis loop error:', err);
    }

    if (!shuttingDown) {
      await sleep(POLL_INTERVAL_MS);
    }
  }

  console.log('Audio analysis loop stopped');
}

async function main() {
  startHealthServer();

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  await cleanupStaleJobs(['enrichment', 'audio_analysis']);

  console.log('Worker starting...');
  await Promise.all([
    catalogEnrichmentLoop(),
    audioAnalysisLoop(),
  ]);
}

main().catch((err) => {
  console.error('Worker fatal:', err);
  process.exit(1);
});

function handleShutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  shuttingDown = true;
  if (pool) pool.killAll();
  setTimeout(() => process.exit(0), 5_000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
