# Plan: Audio Worker Separation

## Status: Ready to execute (after Postgres migration is verified)

## Prerequisite

The Postgres migration must be complete and verified. The web app should be running against Postgres with all existing functionality intact, including the current in-process audio analysis via worker threads.

## Goal

Move audio analysis out of the web server and into a dedicated Fly machine via process groups. Eliminate WASM cold start cascades, CPU contention, timeout tuning, and deploy interference.

## Architecture (after this plan)

```
┌─────────────────┐       ┌───────────┐       ┌──────────────────┐
│   Web Machine   │──────►│  Postgres │◄──────│  Worker Machine  │
│ shared-cpu-1x   │       │  (Fly)    │       │ shared-cpu-2x    │
│ 512MB RAM       │       └───────────┘       │ 2GB RAM          │
│ node server.js  │                           │ node worker/main │
└─────────────────┘                           └──────────────────┘
```

Both machines connect directly to Postgres. No HTTP API between them. Single `fly deploy` updates both via process groups.

## Implementation

### 1. Create worker/main.ts

Standalone Node.js entry point (not Next.js). Does not use Next.js server, routing, or middleware.

```
1. Connect to Postgres (same DATABASE_URL as web server)
2. Load Essentia WASM (once -- stays warm forever)
3. Loop:
   a. Query Postgres for next release needing analysis
      (SELECT from catalog_tracks/catalog_releases WHERE bpm_status IS NULL)
   b. If none, sleep 30s, repeat
   c. Refresh stream URLs for that release:
      - Scrape the Bandcamp album page (fetchAlbumTracks)
      - Update stream_url in catalog_tracks
      - Mark tracks with no stream as 'no_stream'
   d. For each track in release with a valid stream URL:
      - Fetch MP3 (with 10s timeout)
      - Decode to PCM (audio-decode)
      - Analyze BPM + Key (Essentia)
      - Write results to catalog_tracks (bpm, musical_key, key_camelot, bpm_status='done')
      - Backfill to feed_items and wishlist_items where stream URL matches
      - On error: mark track bpm_status='failed', log error, continue to next track
   e. Rate-limit delay (1.5s between tracks)
   f. Delay between releases (2s)
```

No timeouts. No worker thread lifecycle management. Analysis runs to completion. If a 5MB track takes 90 seconds to analyze, that's fine -- nothing kills the process.

### 2. Code reuse

The worker imports directly from the existing codebase:

- `lib/db/catalog.ts` -- getReleasesNeedingStreamRefresh(), refreshStreamUrls(), getPendingTracksForRelease(), markNoStreamTracks()
- `lib/db/sync-jobs.ts` -- createJob(), updateJobProgress(), completeJob(), failJob(), incrementJobErrors()
- `lib/bandcamp/scraper.ts` -- fetchAlbumTracks(), publicFetcher
- `lib/audio/camelot.ts` -- normalizeBpm(), toCamelot(), formatKey()

The actual Essentia analysis logic from `lib/audio/worker.ts` gets inlined into the worker's main loop (no separate worker thread needed since the machine is dedicated to this task).

### 3. Compile with esbuild

The worker needs bundling for production. Update `package.json`:

```json
{
  "build:worker": "esbuild worker/main.ts --bundle --platform=node --format=cjs --outfile=worker/main.js --external:essentia.js --external:audio-decode --external:pg"
}
```

### 4. Update fly.dev.toml

```toml
app = 'bandpass-dev'
primary_region = 'sjc'

[processes]
  web = "node server.js"
  worker = "node worker/main.js"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = 'stop'
  auto_start_machines = true
  min_machines_running = 0
  processes = ["web"]

[[vm]]
  memory = '512mb'
  cpu_kind = 'shared'
  cpus = 1
  processes = ["web"]

[[vm]]
  memory = '2gb'
  cpu_kind = 'shared'
  cpus = 2
  processes = ["worker"]
```

The worker has no `[http_service]` -- it's a background process, not a web server. It gets its own machine with 2 shared CPUs and 2GB RAM for Essentia WASM.

### 5. Update Dockerfile

Add the compiled worker script to the Docker image:

```dockerfile
COPY --from=builder --chown=nextjs:nodejs /app/worker/main.js ./worker/main.js
```

Keep essentia.js, audio-decode, and related audio dependencies in the image (worker needs them).

### 6. Remove audio analysis from web server

Strip from `lib/sync/workers.ts`:
- The entire `audioWorkerLoop()` function
- `spawnWorker()`, `postToWorker()`, `WorkerDiedError`, `saveAudioResult()`, `markAudioFailed()`
- `WORKER_TIMEOUT_MS`, `MAX_CONSECUTIVE_FAILURES`, `URL_REFRESH_DELAY_MS`, `AUDIO_ANALYSIS_DELAY_MS`
- `audioCancelRequested`, `cancelAudioAnalysis()`
- The `ENABLE_AUDIO_ANALYSIS` check in `ensureWorkersStarted()`
- Audio-related imports from `lib/db/catalog.ts` and `lib/bandcamp/scraper.ts`

Keep in `lib/sync/workers.ts`:
- `enrichmentWorkerLoop()` (lightweight, works fine in-process)
- `ensureWorkersStarted()` (still needed for enrichment)
- `nudgeWorkers()` / `sleepOrNudge()`

### 7. Update Account page

Strip from `components/AccountView.tsx`:
- The "Stop analysis" button (worker runs independently, stop via `fly machines stop`)
- Possibly replace with a simple "Worker status" indicator that reads from sync_jobs

The audio analysis progress display (done/errors/remaining counts) can stay -- it reads from sync_jobs which the worker updates.

### 8. Clean up

- Remove `ENABLE_AUDIO_ANALYSIS` env var from fly.dev.toml and fly.toml
- Remove `lib/audio/worker.ts` (the old worker thread script)
- Remove the esbuild step for `lib/audio/worker.ts` (replaced by `worker/main.ts`)
- Remove the `eval("require('worker_threads')")` hack from workers.ts
- Remove worker thread audio COPY lines from Dockerfile
- Remove `cancelAudioAnalysis` export and DELETE handler from `app/api/sync/route.ts`

## Future: Parallelism (optional follow-up)

Once the single-threaded worker is verified, parallelism can be added:

- The worker's main loop spawns N worker threads (e.g., 2-3)
- Main thread fetches tracks from Postgres and downloads MP3s at Bandcamp's rate limit (1 every ~2s)
- Worker threads receive decoded PCM buffers and run Essentia analysis in parallel
- Each thread loads WASM once and keeps it warm
- With 3 parallel threads: ~1 track every 5 seconds instead of every 15

This is a natural extension of the single-threaded design, not a rewrite.

## What this eliminates

- WASM cold start cascade (WASM loads once, stays warm indefinitely)
- CPU contention between web serving and audio analysis
- Fly auto-stop killing analysis (worker machine runs independently)
- Timeout tuning (no timeouts -- analysis runs to completion)
- Deploy interference (process groups restart together, but worker resumes from Postgres state)
- Worker thread lifecycle management (spawn, timeout, kill, respawn)
- The esbuild + eval('require') worker thread compilation workaround

## Estimated cost

- Worker machine: ~$5-7/month (shared-cpu-2x, 2GB RAM)
- Web machine can potentially be downsized (no longer needs RAM for Essentia WASM): saves ~$2-3/month
- Net increase: ~$3-5/month
