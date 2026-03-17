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
var import_http = __toESM(require("http"));
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
    max: parseInt(process.env.DB_POOL_SIZE ?? "10", 10)
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
var migrationsPromise = null;
function ensureDb() {
  if (!migrationsPromise) {
    migrationsPromise = runMigrations();
  }
  return migrationsPromise;
}

// lib/db/utils.ts
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// lib/db/catalog.ts
function normalizeDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toISOString().slice(0, 10);
}
async function getCachedAlbumTracks(releaseId) {
  const rows = await query(`
    SELECT * FROM catalog_tracks WHERE release_id = $1 ORDER BY track_num
  `, [releaseId]);
  if (rows.length === 0) return null;
  return rows.map(rowToTrack);
}
function rowToTrack(row) {
  return {
    id: row.id,
    releaseId: row.release_id,
    trackNum: row.track_num,
    title: row.title,
    duration: row.duration,
    streamUrl: row.stream_url,
    trackUrl: row.track_url,
    bpm: row.bpm ?? null,
    musicalKey: row.musical_key ?? null,
    keyCamelot: row.key_camelot ?? null,
    audioStorageKey: row.audio_storage_key ?? null,
    bpmStatus: row.bpm_status ?? null
  };
}
async function cacheAlbumTracks(releaseId, tracks, releaseDate, tags) {
  await transaction(async (client2) => {
    await client2.query("DELETE FROM catalog_tracks WHERE release_id = $1", [releaseId]);
    for (const t of tracks) {
      await client2.query(
        `INSERT INTO catalog_tracks (release_id, track_num, title, duration, stream_url, track_url, bandcamp_track_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [releaseId, t.trackNum, t.title, t.duration, t.streamUrl, t.trackUrl, t.bandcampTrackId ?? null]
      );
    }
    if (releaseDate !== void 0 || tags !== void 0) {
      const normalizedDate = releaseDate ? normalizeDate(releaseDate) : null;
      await client2.query(
        `UPDATE catalog_releases
        SET release_date = COALESCE($1, release_date),
            tags = COALESCE($2::jsonb, tags)
        WHERE id = $3`,
        [normalizedDate, tags ? JSON.stringify(tags) : null, releaseId]
      );
    }
  });
  return await getCachedAlbumTracks(releaseId) ?? [];
}
async function ensureCatalogRelease(url, bandName, bandSlug, title, imageUrl, bandcampId) {
  const byUrl = await queryOne("SELECT id FROM catalog_releases WHERE url = $1", [url]);
  if (byUrl) {
    if (bandcampId != null) {
      await execute("UPDATE catalog_releases SET bandcamp_id = $1 WHERE id = $2 AND bandcamp_id IS NULL", [bandcampId, byUrl.id]);
    }
    return byUrl.id;
  }
  if (bandcampId != null) {
    const byBcId = await queryOne("SELECT id FROM catalog_releases WHERE bandcamp_id = $1", [bandcampId]);
    if (byBcId) return byBcId.id;
  }
  const result = await query(`
    INSERT INTO catalog_releases (band_slug, band_name, band_url, title, url, image_url, release_type, source, bandcamp_id)
    VALUES ($1, $2, $3, $4, $5, $6, 'album', 'enrichment', $7)
    RETURNING id
  `, [bandSlug, bandName, `https://${bandSlug}.bandcamp.com`, title, url, imageUrl, bandcampId ?? null]);
  return result[0].id;
}
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

// lib/db/sync/helpers.ts
var MAX_RETRIES = 3;
var INITIAL_BACKOFF_MS = 5e3;
async function withRetry(fn) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err instanceof Error && err.message.includes("429");
      if (!is429 || attempt === MAX_RETRIES) throw err;
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      console.warn(`Rate limited (429), backing off ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(backoff);
    }
  }
  throw new Error("Unreachable");
}

// lib/db/sync/feed.ts
var SIX_MONTHS_SECONDS = 180 * 24 * 60 * 60;

// lib/bandcamp/scraper.ts
var publicFetcher = async (url, signal) => {
  const res = await fetch(url, signal ? { signal } : void 0);
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
function extractSlug(artistUrl) {
  try {
    const url = new URL(artistUrl);
    const host = url.hostname;
    if (host.endsWith(".bandcamp.com")) {
      return host.replace(".bandcamp.com", "");
    }
    return host;
  } catch {
    return artistUrl;
  }
}

// lib/db/sync/enrichment.ts
var ENRICHMENT_DELAY_MS = 1e3;
var MAX_BACKOFF_MS = 3e4;
var BACKOFF_THRESHOLD = 5;
var MAX_CONSECUTIVE_FAILURES = 20;
var FETCH_TIMEOUT_MS = 3e4;
function timedFetcher(url) {
  return publicFetcher(url, AbortSignal.timeout(FETCH_TIMEOUT_MS));
}
async function processEnrichmentQueue(onProgress) {
  const pending = await query(
    "SELECT album_url FROM enrichment_queue WHERE status = 'pending' ORDER BY created_at ASC"
  );
  if (pending.length === 0) return 0;
  let processed = 0;
  let consecutiveFailures = 0;
  for (const { album_url } of pending) {
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(`Aborting enrichment batch after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
      break;
    }
    try {
      const album = await withRetry(() => fetchAlbumTracks(timedFetcher, album_url));
      const slug = extractSlug(new URL(album_url).origin);
      const releaseId = await ensureCatalogRelease(
        album_url,
        album.artist,
        slug,
        album.title,
        album.imageUrl,
        album.bandcampId
      );
      await cacheAlbumTracks(
        releaseId,
        album.tracks.map((t) => ({
          trackNum: t.trackNum,
          title: t.title,
          duration: t.duration,
          streamUrl: t.streamUrl,
          trackUrl: t.trackUrl,
          bandcampTrackId: t.bandcampTrackId
        })),
        album.releaseDate,
        album.tags
      );
      await execute("UPDATE feed_items SET release_id = $1 WHERE album_url = $2 AND release_id IS NULL", [releaseId, album_url]);
      await execute("UPDATE wishlist_items SET release_id = $1 WHERE item_url = $2 AND release_id IS NULL", [releaseId, album_url]);
      await execute(`
        UPDATE feed_items fi SET track_id = ct.id
        FROM catalog_tracks ct
        WHERE ct.bandcamp_track_id = fi.bandcamp_track_id
          AND ct.release_id = $1
          AND fi.release_id = $1 AND fi.track_id IS NULL
          AND fi.bandcamp_track_id IS NOT NULL
      `, [releaseId]);
      await execute("UPDATE enrichment_queue SET status = 'done', processed_at = NOW() WHERE album_url = $1", [album_url]);
      consecutiveFailures = 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Enrichment failed for ${album_url}:`, message);
      await execute(
        `UPDATE enrichment_queue SET status = 'failed', processed_at = NOW(),
         retry_count = retry_count + 1, last_error = $2
         WHERE album_url = $1`,
        [album_url, message.slice(0, 500)]
      );
      consecutiveFailures++;
    }
    processed++;
    onProgress?.(processed, pending.length - processed);
    if (processed < pending.length) {
      let delay = ENRICHMENT_DELAY_MS;
      if (consecutiveFailures >= BACKOFF_THRESHOLD) {
        delay = Math.min(ENRICHMENT_DELAY_MS * Math.pow(2, consecutiveFailures - BACKOFF_THRESHOLD), MAX_BACKOFF_MS);
      }
      await sleep(delay);
    }
  }
  return processed;
}

// lib/db/sync/audio.ts
async function getAudioAnalysisPendingCount() {
  const row = await queryOne(
    "SELECT COUNT(*) AS c FROM catalog_tracks WHERE stream_url IS NOT NULL AND stream_url != '' AND bpm_status IS NULL"
  );
  return parseInt(row.c, 10);
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
function trackKey2(trackId) {
  return `tracks/${trackId}.mp3`;
}
async function uploadTrackFromFile(trackId, filePath) {
  const key = trackKey2(trackId);
  await getClient().send(
    new import_client_s3.PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: import_fs2.default.createReadStream(filePath),
      ContentType: "audio/mpeg"
    })
  );
  return key;
}

// worker/analyzer.ts
var import_child_process = require("child_process");
var import_readline = require("readline");

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

// worker/analyzer.ts
var ANALYZE_TIMEOUT_MS = 12e4;
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
  async analyze(streamUrl, timeoutMs = ANALYZE_TIMEOUT_MS) {
    await this.ensure();
    const raw = await new Promise(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending = null;
          this.kill();
          this.proc = null;
          reject(new Error(`Analysis timed out after ${timeoutMs / 1e3}s`));
        }, timeoutMs);
        this.pending = {
          resolve: (v) => {
            clearTimeout(timer);
            resolve(v);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          }
        };
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

// worker/main.ts
var shuttingDown = false;
var lastProgressAt = Date.now();
var hasActiveAnalysisJob = false;
var POLL_INTERVAL_MS = 3e4;
var TRACK_DELAY_MS = 750;
var RELEASE_DELAY_MS = 1e3;
var MAX_CONSECUTIVE_FAILURES2 = 20;
var STALL_THRESHOLD_MS = 10 * 60 * 1e3;
async function catalogEnrichmentLoop() {
  console.log("Catalog enrichment loop started");
  while (!shuttingDown) {
    try {
      const row = await queryOne(
        "SELECT COUNT(*) as c FROM enrichment_queue WHERE status = 'pending'"
      );
      const pendingCount = parseInt(row?.c ?? "0", 10);
      if (pendingCount > 0 && !await getActiveJob("enrichment")) {
        const jobId = await createJob("enrichment");
        const heartbeatInterval = setInterval(async () => {
          try {
            await updateHeartbeat(jobId);
          } catch (err) {
            console.error("Catalog enrichment heartbeat failed:", err);
          }
        }, 3e4);
        try {
          await updateHeartbeat(jobId);
          await updateJobProgress(jobId, 0, pendingCount);
          await processEnrichmentQueue((processed, remaining) => {
            updateJobProgress(jobId, processed, processed + remaining);
          });
          await completeJob(jobId);
        } catch (err) {
          console.error("Catalog enrichment error:", err);
          await failJob(jobId, err instanceof Error ? err.message : String(err));
        } finally {
          clearInterval(heartbeatInterval);
        }
      }
    } catch (err) {
      console.error("Catalog enrichment loop error:", err);
    }
    if (!shuttingDown) {
      await sleep(POLL_INTERVAL_MS);
    }
  }
  console.log("Catalog enrichment loop stopped");
}
var FETCH_TIMEOUT_MS2 = 3e4;
function timedFetcher2(url) {
  return publicFetcher(url, AbortSignal.timeout(FETCH_TIMEOUT_MS2));
}
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
  if (await getActiveJob("audio_analysis")) return;
  const jobId = await createJob("audio_analysis");
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
        const album = await fetchAlbumTracks(timedFetcher2, release.releaseUrl);
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
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES2) {
          console.error(`Aborting: ${MAX_CONSECUTIVE_FAILURES2} consecutive failures`);
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
              if (done % 10 === 0) {
                const currentPending = await getAudioAnalysisPendingCount();
                await updateJobProgress(jobId, done, done + currentPending, "analyzing");
              }
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
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES2) {
          await failJob(jobId, `${MAX_CONSECUTIVE_FAILURES2} consecutive track failures`);
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
    hasActiveAnalysisJob = false;
    clearInterval(heartbeatInterval);
    clearInterval(progressInterval);
  }
}
var HEALTH_PORT = parseInt(process.env.WORKER_HEALTH_PORT ?? "8080", 10);
function startHealthServer() {
  const server = import_http.default.createServer((_req, res) => {
    const stalledMs = Date.now() - lastProgressAt;
    if (hasActiveAnalysisJob && stalledMs > STALL_THRESHOLD_MS) {
      res.writeHead(503, { "Content-Type": "text/plain" });
      res.end(`stalled: no progress for ${Math.round(stalledMs / 1e3)}s`);
    } else {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    }
  });
  server.listen(HEALTH_PORT, () => {
    console.log(`Health check server listening on port ${HEALTH_PORT}`);
  });
}
async function audioAnalysisLoop() {
  if (process.env.ENABLE_AUDIO_ANALYSIS !== "true") {
    await execute(
      "UPDATE sync_jobs SET status = 'done', error = NULL, updated_at = NOW() WHERE status = 'running' AND job_type = 'audio_analysis'"
    );
    console.log("Audio analysis disabled (ENABLE_AUDIO_ANALYSIS != true). Loop idle.");
    while (!shuttingDown) await sleep(6e4);
    return;
  }
  s3Enabled = isS3Configured();
  const pendingAtStart = await getAudioAnalysisPendingCount();
  console.log(`Audio analysis starting (S3: ${s3Enabled ? "on" : "off"}, concurrency: ${CONCURRENCY}, pending: ${pendingAtStart})`);
  pool2 = new AnalyzerPool(CONCURRENCY);
  await pool2.start();
  while (!shuttingDown) {
    try {
      await processReleases();
    } catch (err) {
      console.error("Audio analysis loop error:", err);
    }
    if (!shuttingDown) {
      await sleep(POLL_INTERVAL_MS);
    }
  }
  console.log("Audio analysis loop stopped");
}
async function main() {
  startHealthServer();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  await cleanupStaleJobs(["enrichment", "audio_analysis"]);
  console.log("Worker starting...");
  await Promise.all([
    catalogEnrichmentLoop(),
    audioAnalysisLoop()
  ]);
}
main().catch((err) => {
  console.error("Worker fatal:", err);
  process.exit(1);
});
function handleShutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  shuttingDown = true;
  if (pool2) pool2.killAll();
  setTimeout(() => process.exit(0), 5e3);
}
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));
