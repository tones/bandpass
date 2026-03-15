/**
 * Audio enrichment worker: a standalone Node process (Fly.io "worker" group)
 * that polls for catalog tracks needing BPM/key analysis. For each release,
 * it refreshes stream URLs, spawns a pool of Python Essentia processes
 * (ANALYZER_CONCURRENCY), optionally uploads audio to S3, and writes results
 * back to catalog_tracks. Progress is tracked via sync_jobs with periodic
 * heartbeats. Gracefully shuts down on SIGTERM/SIGINT.
 */
import http from 'http';
import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';
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
import { getAudioAnalysisPendingCount } from '../lib/db/sync';
import { fetchAlbumTracks, publicFetcher } from '../lib/bandcamp/scraper';
import { normalizeBpm, toCamelot, formatKey } from '../lib/audio/camelot';
import { isS3Configured, uploadTrackFromFile } from '../lib/s3';
import { sleep } from '../lib/db/utils';

const POLL_INTERVAL_MS = 30_000;
const TRACK_DELAY_MS = 750;
const RELEASE_DELAY_MS = 1_000;
const MAX_CONSECUTIVE_FAILURES = 20;

class EssentiaProcess {
  private proc: ChildProcess | null = null;
  private rl: Interface | null = null;
  private pending: {
    resolve: (v: { bpm: number; key: string; scale: string; timing: string; file?: string }) => void;
    reject: (e: Error) => void;
  } | null = null;

  constructor(public readonly id: number = 0) {}

  get tag() { return `[analyzer-${this.id}]`; }

  async ensure(): Promise<void> {
    if (this.proc && this.proc.exitCode === null) return;
    await this.start();
  }

  private start(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`${this.tag} Spawning Python Essentia analyzer...`);
      this.proc = spawn('python3', ['worker/analyze.py'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.rl = createInterface({ input: this.proc.stdout! });
      this.rl.on('line', (line) => {
        if (!this.pending) return;
        const { resolve: res, reject: rej } = this.pending;
        this.pending = null;
        try {
          const result = JSON.parse(line);
          if (result.error) rej(new Error(result.error));
          else res(result);
        } catch {
          rej(new Error(`Invalid JSON from analyzer: ${line}`));
        }
      });

      let resolved = false;
      const stderrRl = createInterface({ input: this.proc.stderr! });
      stderrRl.on('line', (line) => {
        if (line.includes('essentia-analyzer ready')) {
          resolved = true;
          console.log(`${this.tag} Python Essentia analyzer ready`);
          resolve();
        } else {
          console.log(`  ${this.tag} [python] ${line}`);
        }
      });

      this.proc.on('exit', (code) => {
        console.log(`${this.tag} Python analyzer exited with code ${code}`);
        if (!resolved) {
          resolved = true;
          reject(new Error(`Analyzer ${this.id} exited before ready (code ${code})`));
        }
        if (this.pending) {
          this.pending.reject(new Error(`Analyzer ${this.id} exited (code ${code})`));
          this.pending = null;
        }
      });

      this.proc.on('error', (err) => {
        console.error(`${this.tag} Failed to spawn Python analyzer:`, err.message);
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`Analyzer ${this.id} did not start within 10s`));
        }
      }, 10_000);
    });
  }

  async analyze(
    streamUrl: string,
  ): Promise<{ bpm: number; musicalKey: string; keyCamelot: string | null; tempFile?: string }> {
    await this.ensure();

    const raw = await new Promise<{ bpm: number; key: string; scale: string; timing: string; file?: string }>(
      (resolve, reject) => {
        this.pending = { resolve, reject };
        this.proc!.stdin!.write(JSON.stringify({ url: streamUrl }) + '\n');
      },
    );

    console.log(`  ${this.tag} [timing] ${raw.timing}`);

    return {
      bpm: normalizeBpm(raw.bpm),
      musicalKey: formatKey(raw.key, raw.scale),
      keyCamelot: toCamelot(raw.key, raw.scale),
      tempFile: raw.file,
    };
  }

  kill() {
    if (this.proc && this.proc.exitCode === null) {
      this.proc.stdin!.end();
      this.proc.kill();
    }
  }
}

class AnalyzerPool {
  private pool: EssentiaProcess[] = [];
  private available: EssentiaProcess[] = [];
  private waiters: ((p: EssentiaProcess) => void)[] = [];

  constructor(private size: number) {}

  async start() {
    console.log(`Starting analyzer pool with ${this.size} processes...`);
    for (let i = 0; i < this.size; i++) {
      const p = new EssentiaProcess(i);
      await p.ensure();
      this.pool.push(p);
      this.available.push(p);
    }
    console.log(`Analyzer pool ready (${this.size} processes)`);
  }

  acquire(): Promise<EssentiaProcess> {
    const p = this.available.pop();
    if (p) return Promise.resolve(p);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  release(p: EssentiaProcess) {
    const waiter = this.waiters.shift();
    if (waiter) waiter(p);
    else this.available.push(p);
  }

  killAll() {
    this.pool.forEach((p) => p.kill());
  }
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
    clearInterval(heartbeatInterval);
    clearInterval(progressInterval);
  }
}

const HEALTH_PORT = parseInt(process.env.WORKER_HEALTH_PORT ?? '8080', 10);

function startHealthServer() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
  server.listen(HEALTH_PORT, () => {
    console.log(`Health check server listening on port ${HEALTH_PORT}`);
  });
}

async function main() {
  startHealthServer();

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  if (process.env.ENABLE_AUDIO_ANALYSIS !== 'true') {
    await execute(
      "UPDATE sync_jobs SET status = 'done', error = NULL, updated_at = NOW() WHERE status = 'running' AND job_type = 'audio_analysis'",
    );
    console.log('Audio worker disabled (ENABLE_AUDIO_ANALYSIS != true). Idling.');
    setInterval(() => {}, 60_000);
    return;
  }

  await cleanupStaleJobs(['audio_analysis']);

  s3Enabled = isS3Configured();
  const pendingAtStart = await getAudioAnalysisPendingCount();
  console.log(`Audio worker starting (S3: ${s3Enabled ? 'on' : 'off'}, concurrency: ${CONCURRENCY}, pending: ${pendingAtStart})`);

  pool = new AnalyzerPool(CONCURRENCY);
  await pool.start();

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

function handleShutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  if (pool) pool.killAll();
  process.exit(0);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
