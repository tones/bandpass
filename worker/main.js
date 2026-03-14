"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// worker/main.ts
var import_child_process = require("child_process");
var import_readline = require("readline");
var import_fs3 = __toESM(require("fs"));

// lib/db/index.ts
var import_pg = require("pg");
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var pool = null;
function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  pool = new import_pg.Pool({
    connectionString,
    max: 10
  });
  return pool;
}
async function query(sql, params) {
  await ensureDb();
  const result = await getPool().query(sql, params);
  return result.rows;
}
async function queryOne(sql, params) {
  await ensureDb();
  const result = await getPool().query(sql, params);
  return result.rows[0] ?? null;
}
async function execute(sql, params) {
  await ensureDb();
  const result = await getPool().query(sql, params);
  return { rowCount: result.rowCount ?? 0 };
}
async function transaction(fn) {
  await ensureDb();
  const client2 = await getPool().connect();
  try {
    await client2.query("BEGIN");
    const result = await fn(client2);
    await client2.query("COMMIT");
    return result;
  } catch (err) {
    await client2.query("ROLLBACK");
    throw err;
  } finally {
    client2.release();
  }
}
async function runMigrations() {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const applied = await p.query("SELECT version FROM schema_migrations ORDER BY version");
  const appliedVersions = new Set(applied.rows.map((r) => r.version));
  const candidates = [
    import_path.default.join(__dirname, "migrations"),
    import_path.default.join(process.cwd(), "lib", "db", "migrations")
  ];
  const migrationsDir = candidates.find((d) => import_fs.default.existsSync(d));
  if (!migrationsDir) return;
  const files = import_fs.default.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const version = file.replace(".sql", "");
    if (appliedVersions.has(version)) continue;
    const sql = import_fs.default.readFileSync(import_path.default.join(migrationsDir, file), "utf-8");
    const client2 = await p.connect();
    try {
      await client2.query("BEGIN");
      await client2.query(sql);
      await client2.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
      await client2.query("COMMIT");
      console.log(`Applied migration: ${file}`);
    } catch (err) {
      await client2.query("ROLLBACK");
      throw err;
    } finally {
      client2.release();
    }
  }
}
var migrationsRun = false;
async function ensureDb() {
  if (migrationsRun) return;
  await runMigrations();
  migrationsRun = true;
}

// lib/db/catalog.ts
async function getReleasesNeedingStreamRefresh() {
  const rows = await query(`
    SELECT DISTINCT cr.id AS release_id, cr.url AS release_url
    FROM catalog_tracks ct
    JOIN catalog_releases cr ON cr.id = ct.release_id
    WHERE ct.bpm_status IS NULL
    ORDER BY cr.id
  `);
  return rows.map((r) => ({ releaseId: r.release_id, releaseUrl: r.release_url }));
}
async function refreshStreamUrls(releaseId, freshTracks) {
  await transaction(async (client2) => {
    for (const t of freshTracks) {
      await client2.query(
        "UPDATE catalog_tracks SET stream_url = $1, track_url = COALESCE($2, track_url) WHERE release_id = $3 AND track_num = $4",
        [t.streamUrl, t.trackUrl, releaseId, t.trackNum]
      );
    }
  });
}
async function markNoStreamTracks(releaseId) {
  if (releaseId != null) {
    const result2 = await execute(
      "UPDATE catalog_tracks SET bpm_status = 'no_stream' WHERE release_id = $1 AND bpm_status IS NULL AND (stream_url IS NULL OR stream_url = '')",
      [releaseId]
    );
    return result2.rowCount;
  }
  const result = await execute(
    "UPDATE catalog_tracks SET bpm_status = 'no_stream' WHERE bpm_status IS NULL AND (stream_url IS NULL OR stream_url = '')"
  );
  return result.rowCount;
}
async function getPendingTracksForRelease(releaseId) {
  return query(
    "SELECT id, stream_url FROM catalog_tracks WHERE release_id = $1 AND stream_url IS NOT NULL AND stream_url != '' AND bpm_status IS NULL ORDER BY track_num",
    [releaseId]
  );
}

// lib/db/sync-jobs.ts
function toISOString(val) {
  return val instanceof Date ? val.toISOString() : val;
}
function rowToJob(row) {
  return {
    id: row.id,
    jobType: row.job_type,
    fanId: row.fan_id,
    status: row.status,
    progressDone: row.progress_done,
    progressTotal: row.progress_total,
    progressErrors: row.progress_errors ?? 0,
    subPhase: row.sub_phase,
    error: row.error,
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
    lastHeartbeat: row.last_heartbeat ? toISOString(row.last_heartbeat) : null
  };
}
async function createJob(jobType, fanId) {
  const row = await queryOne(
    "INSERT INTO sync_jobs (job_type, fan_id, status) VALUES ($1, $2, 'running') RETURNING id",
    [jobType, fanId ?? null]
  );
  if (!row) throw new Error("Failed to insert sync job");
  return row.id;
}
async function updateJobProgress(jobId, done, total, subPhase) {
  await execute(
    "UPDATE sync_jobs SET progress_done = $1, progress_total = $2, sub_phase = $3, updated_at = NOW() WHERE id = $4",
    [done, total, subPhase ?? null, jobId]
  );
}
async function incrementJobErrors(jobId) {
  await execute(
    "UPDATE sync_jobs SET progress_errors = progress_errors + 1, updated_at = NOW() WHERE id = $1",
    [jobId]
  );
}
async function completeJob(jobId) {
  await execute(
    "UPDATE sync_jobs SET status = 'done', updated_at = NOW() WHERE id = $1",
    [jobId]
  );
}
async function failJob(jobId, error) {
  await execute(
    "UPDATE sync_jobs SET status = 'failed', error = $1, updated_at = NOW() WHERE id = $2",
    [error, jobId]
  );
}
async function getActiveJob(jobType, fanId) {
  const row = fanId != null ? await queryOne(
    "SELECT * FROM sync_jobs WHERE job_type = $1 AND fan_id = $2 AND status = 'running' ORDER BY id DESC LIMIT 1",
    [jobType, fanId]
  ) : await queryOne(
    "SELECT * FROM sync_jobs WHERE job_type = $1 AND status = 'running' ORDER BY id DESC LIMIT 1",
    [jobType]
  );
  return row ? rowToJob(row) : null;
}
async function updateHeartbeat(jobId) {
  await execute(
    "UPDATE sync_jobs SET last_heartbeat = NOW() WHERE id = $1",
    [jobId]
  );
}
async function cleanupStaleJobs(jobTypes) {
  let result;
  if (jobTypes && jobTypes.length > 0) {
    const placeholders = jobTypes.map((_, i) => `$${i + 1}`).join(", ");
    result = await execute(
      `UPDATE sync_jobs SET status = 'failed', error = 'Server restarted', updated_at = NOW() WHERE status = 'running' AND job_type IN (${placeholders})`,
      jobTypes
    );
  } else {
    result = await execute(
      "UPDATE sync_jobs SET status = 'failed', error = 'Server restarted', updated_at = NOW() WHERE status = 'running'"
    );
  }
  if (result.rowCount > 0) {
    console.log(`Cleaned up ${result.rowCount} stale running job(s) from previous server instance`);
  }
}

// lib/bandcamp/scraper.ts
var publicFetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch error: ${res.status}`);
  return res.text();
};
function extractJsonAttr(html, attrName) {
  const pattern = new RegExp(`${attrName}="([^"]*)"`, "s");
  const match = html.match(pattern);
  if (!match?.[1]) return null;
  const decoded = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'");
  try {
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}
function parseTags(html) {
  const tags = [];
  const tagPattern = /<a[^>]*class="tag"[^>]*>([^<]+)<\/a>/g;
  let match;
  while ((match = tagPattern.exec(html)) !== null) {
    const tag = match[1].trim().toLowerCase();
    if (tag) tags.push(tag);
  }
  return [...new Set(tags)].sort();
}
function artIdToUrl(artId, size = 5) {
  return `https://f4.bcbits.com/img/a${artId}_${size}.jpg`;
}
async function fetchAlbumTracks(fetchHtml, albumUrl) {
  const html = await fetchHtml(albumUrl);
  const tralbum = extractJsonAttr(html, "data-tralbum");
  if (!tralbum) {
    throw new Error("Could not extract track data from album page");
  }
  const artId = tralbum.current?.art_id ?? tralbum.art_id ?? 0;
  const baseUrl = tralbum.url ? new URL(tralbum.url).origin : "";
  const tracks = (tralbum.trackinfo ?? []).map((t) => ({
    trackNum: t.track_num,
    title: t.title,
    duration: t.duration,
    streamUrl: t.file?.["mp3-128"] ?? null,
    trackUrl: t.title_link ? t.title_link.startsWith("http") ? t.title_link : `${baseUrl}${t.title_link}` : null,
    bandcampTrackId: t.track_id ?? null
  }));
  const releaseDate = tralbum.current?.release_date ?? tralbum.album_release_date ?? tralbum.current?.publish_date ?? null;
  const tags = parseTags(html);
  return {
    title: tralbum.current?.title ?? "",
    artist: tralbum.current?.artist ?? tralbum.artist ?? "",
    imageUrl: artId ? artIdToUrl(artId) : "",
    releaseDate,
    tags,
    tracks,
    bandcampId: tralbum.id ?? null
  };
}

// lib/db/sync.ts
var SIX_MONTHS_SECONDS = 180 * 24 * 60 * 60;
async function getAudioAnalysisPendingCount() {
  const row = await queryOne(
    "SELECT COUNT(*) AS c FROM catalog_tracks WHERE stream_url IS NOT NULL AND stream_url != '' AND bpm_status IS NULL"
  );
  return parseInt(row.c, 10);
}

// lib/audio/camelot.ts
var CAMELOT_MAP = {
  "C major": "8B",
  "G major": "9B",
  "D major": "10B",
  "A major": "11B",
  "E major": "12B",
  "B major": "1B",
  "F# major": "2B",
  "Gb major": "2B",
  "Db major": "3B",
  "C# major": "3B",
  "Ab major": "4B",
  "G# major": "4B",
  "Eb major": "5B",
  "D# major": "5B",
  "Bb major": "6B",
  "A# major": "6B",
  "F major": "7B",
  "A minor": "8A",
  "E minor": "9A",
  "B minor": "10A",
  "F# minor": "11A",
  "Gb minor": "11A",
  "C# minor": "12A",
  "Db minor": "12A",
  "G# minor": "1A",
  "Ab minor": "1A",
  "Eb minor": "2A",
  "D# minor": "2A",
  "Bb minor": "3A",
  "A# minor": "3A",
  "F minor": "4A",
  "C minor": "5A",
  "G minor": "6A",
  "D minor": "7A"
};
function toCamelot(key, scale) {
  return CAMELOT_MAP[`${key} ${scale}`] ?? null;
}
function formatKey(key, scale) {
  return `${key}${scale === "minor" ? "m" : ""}`;
}
function normalizeBpm(bpm) {
  if (bpm <= 0) return 0;
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}

// lib/s3.ts
var import_client_s3 = require("@aws-sdk/client-s3");
var import_s3_request_presigner = require("@aws-sdk/s3-request-presigner");
var import_fs2 = __toESM(require("fs"));
var client = null;
function getClient() {
  if (client) return client;
  client = new import_client_s3.S3Client({ region: process.env.AWS_S3_REGION || "us-east-2" });
  return client;
}
function getBucket() {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error("AWS_S3_BUCKET is not set");
  return bucket;
}
function isS3Configured() {
  return !!(process.env.AWS_S3_BUCKET && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}
function trackKey(trackId) {
  return `tracks/${trackId}.mp3`;
}
async function uploadTrackFromFile(trackId, filePath) {
  const key = trackKey(trackId);
  const body = import_fs2.default.readFileSync(filePath);
  await getClient().send(
    new import_client_s3.PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: "audio/mpeg"
    })
  );
  return key;
}

// worker/main.ts
var POLL_INTERVAL_MS = 3e4;
var TRACK_DELAY_MS = 1500;
var RELEASE_DELAY_MS = 2e3;
var MAX_CONSECUTIVE_FAILURES = 20;
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
var EssentiaProcess = class {
  constructor(id = 0) {
    this.id = id;
    this.proc = null;
    this.rl = null;
    this.pending = null;
  }
  get tag() {
    return `[analyzer-${this.id}]`;
  }
  async ensure() {
    if (this.proc && this.proc.exitCode === null) return;
    await this.start();
  }
  start() {
    return new Promise((resolve, reject) => {
      console.log(`${this.tag} Spawning Python Essentia analyzer...`);
      this.proc = (0, import_child_process.spawn)("python3", ["worker/analyze.py"], {
        stdio: ["pipe", "pipe", "pipe"]
      });
      this.rl = (0, import_readline.createInterface)({ input: this.proc.stdout });
      this.rl.on("line", (line) => {
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
      const stderrRl = (0, import_readline.createInterface)({ input: this.proc.stderr });
      stderrRl.on("line", (line) => {
        if (line.includes("essentia-analyzer ready")) {
          resolved = true;
          console.log(`${this.tag} Python Essentia analyzer ready`);
          resolve();
        } else {
          console.log(`  ${this.tag} [python] ${line}`);
        }
      });
      this.proc.on("exit", (code) => {
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
      this.proc.on("error", (err) => {
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
      }, 1e4);
    });
  }
  async analyze(streamUrl) {
    await this.ensure();
    const raw = await new Promise(
      (resolve, reject) => {
        this.pending = { resolve, reject };
        this.proc.stdin.write(JSON.stringify({ url: streamUrl }) + "\n");
      }
    );
    console.log(`  ${this.tag} [timing] ${raw.timing}`);
    return {
      bpm: normalizeBpm(raw.bpm),
      musicalKey: formatKey(raw.key, raw.scale),
      keyCamelot: toCamelot(raw.key, raw.scale),
      tempFile: raw.file
    };
  }
  kill() {
    if (this.proc && this.proc.exitCode === null) {
      this.proc.stdin.end();
      this.proc.kill();
    }
  }
};
var AnalyzerPool = class {
  constructor(size) {
    this.size = size;
    this.pool = [];
    this.available = [];
    this.waiters = [];
  }
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
  acquire() {
    const p = this.available.pop();
    if (p) return Promise.resolve(p);
    return new Promise((resolve) => this.waiters.push(resolve));
  }
  release(p) {
    const waiter = this.waiters.shift();
    if (waiter) waiter(p);
    else this.available.push(p);
  }
  killAll() {
    this.pool.forEach((p) => p.kill());
  }
};
var CONCURRENCY = Math.max(1, parseInt(process.env.ANALYZER_CONCURRENCY ?? "2", 10));
var pool2;
var s3Enabled = false;
async function saveAudioResult(trackId, streamUrl, result, audioStorageKey) {
  await execute(
    "UPDATE catalog_tracks SET bpm = $1, musical_key = $2, key_camelot = $3, bpm_status = 'done', audio_storage_key = COALESCE($5, audio_storage_key) WHERE id = $4",
    [result.bpm, result.musicalKey, result.keyCamelot, trackId, audioStorageKey ?? null]
  );
  await execute(
    "UPDATE feed_items SET bpm = $1, musical_key = $2 WHERE track_stream_url = $3 AND bpm IS NULL",
    [result.bpm, result.musicalKey, streamUrl]
  );
  await execute(
    "UPDATE wishlist_items SET bpm = $1, musical_key = $2 WHERE stream_url = $3 AND bpm IS NULL",
    [result.bpm, result.musicalKey, streamUrl]
  );
}
async function markAudioFailed(trackId) {
  await execute("UPDATE catalog_tracks SET bpm_status = 'failed' WHERE id = $1", [trackId]);
}
async function isJobCancelled(jobId) {
  const row = await queryOne(
    "SELECT cancel_requested FROM sync_jobs WHERE id = $1",
    [jobId]
  );
  return row?.cancel_requested === true;
}
async function analyzeTrack(analyzer, track, jobId) {
  try {
    console.log(`  ${analyzer.tag} Track ${track.id}: analyzing...`);
    const result = await analyzer.analyze(track.stream_url);
    let storageKey;
    if (s3Enabled && result.tempFile) {
      try {
        storageKey = await uploadTrackFromFile(track.id, result.tempFile);
        console.log(`  ${analyzer.tag} Track ${track.id}: uploaded to S3 (${storageKey})`);
      } catch (uploadErr) {
        console.error(`  ${analyzer.tag} Track ${track.id}: S3 upload failed, continuing without storage:`, uploadErr);
      }
    }
    if (result.tempFile) {
      try {
        import_fs3.default.unlinkSync(result.tempFile);
      } catch {
      }
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
  if (await getActiveJob("audio_analysis")) return;
  const jobId = await createJob("audio_analysis");
  let done = 0;
  let errors = 0;
  let consecutiveFailures = 0;
  let cancelled = false;
  const startedAt = Date.now();
  const heartbeatInterval = setInterval(async () => {
    try {
      await updateHeartbeat(jobId);
    } catch (err) {
      console.error("Heartbeat update failed:", err);
    }
  }, 3e4);
  const progressInterval = setInterval(async () => {
    const elapsed = (Date.now() - startedAt) / 1e3;
    const rate = done > 0 ? (elapsed / done).toFixed(1) : "?";
    const currentPending = await getAudioAnalysisPendingCount().catch(() => null);
    const remaining = currentPending ?? "?";
    const eta = done > 0 && typeof currentPending === "number" ? `${Math.round(currentPending * elapsed / done / 60)}min` : "?";
    console.log(`[progress] done=${done} errors=${errors} remaining=${remaining} rate=${rate}s/track eta=${eta}`);
  }, 6e4);
  try {
    await updateHeartbeat(jobId);
    const releases = await getReleasesNeedingStreamRefresh();
    await updateJobProgress(jobId, 0, totalPending, "analyzing");
    console.log(`Audio analysis: ${releases.length} releases, ${totalPending} tracks pending (concurrency: ${CONCURRENCY})`);
    for (let ri = 0; ri < releases.length; ri++) {
      if (cancelled) break;
      if (await isJobCancelled(jobId)) {
        console.log("Audio analysis cancelled by user");
        await failJob(jobId, "Cancelled by user");
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
            trackUrl: t.trackUrl
          }))
        );
      } catch (err) {
        console.error(`Failed to refresh URLs for release ${release.releaseId}:`, err);
      }
      await markNoStreamTracks(release.releaseId);
      const tracks = await getPendingTracksForRelease(release.releaseId);
      const inflight = [];
      for (const track of tracks) {
        if (cancelled) break;
        if (await isJobCancelled(jobId)) {
          console.log("Audio analysis cancelled by user, waiting for in-flight tracks...");
          cancelled = true;
          break;
        }
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.error(`Aborting: ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
          cancelled = true;
          break;
        }
        const analyzer = await pool2.acquire();
        await sleep(TRACK_DELAY_MS);
        inflight.push(
          analyzeTrack(analyzer, track, jobId).then(async (success) => {
            pool2.release(analyzer);
            if (success) {
              consecutiveFailures = 0;
              done++;
              const currentPending = await getAudioAnalysisPendingCount();
              await updateJobProgress(jobId, done, done + currentPending, "analyzing");
            } else {
              consecutiveFailures++;
              errors++;
            }
          }).catch(() => {
            pool2.release(analyzer);
          })
        );
      }
      await Promise.allSettled(inflight);
      if (cancelled) {
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          await failJob(jobId, `${MAX_CONSECUTIVE_FAILURES} consecutive track failures`);
        } else {
          await failJob(jobId, "Cancelled by user");
        }
        return;
      }
      await sleep(RELEASE_DELAY_MS);
    }
    await completeJob(jobId);
    console.log(`Audio analysis complete: ${done} tracks processed`);
  } catch (err) {
    console.error("Audio analysis error:", err);
    await failJob(jobId, err instanceof Error ? err.message : String(err));
  } finally {
    clearInterval(heartbeatInterval);
    clearInterval(progressInterval);
  }
}
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  if (process.env.ENABLE_AUDIO_ANALYSIS !== "true") {
    await execute(
      "UPDATE sync_jobs SET status = 'done', error = NULL, updated_at = NOW() WHERE status = 'running' AND job_type = 'audio_analysis'"
    );
    console.log("Audio worker disabled (ENABLE_AUDIO_ANALYSIS != true). Idling.");
    setInterval(() => {
    }, 6e4);
    return;
  }
  await cleanupStaleJobs(["audio_analysis"]);
  s3Enabled = isS3Configured();
  const pendingAtStart = await getAudioAnalysisPendingCount();
  console.log(`Audio worker starting (S3: ${s3Enabled ? "on" : "off"}, concurrency: ${CONCURRENCY}, pending: ${pendingAtStart})`);
  pool2 = new AnalyzerPool(CONCURRENCY);
  await pool2.start();
  while (true) {
    try {
      await processReleases();
    } catch (err) {
      console.error("Worker loop error:", err);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}
main().catch((err) => {
  console.error("Worker fatal:", err);
  process.exit(1);
});
