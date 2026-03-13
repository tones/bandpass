# Plan: Dedicated Audio Worker Machine

## Status: Draft — revisit if in-process worker proves unreliable

## Problem

Running CPU-heavy audio analysis (Essentia.js WASM) in worker threads on the
same Fly.io machine that serves web requests causes recurring infrastructure
issues:

- Fly auto-stop kills background work when no HTTP traffic arrives
- WASM module (~323MB) competes with web server for RAM
- Worker thread timeouts require careful tuning around WASM reload overhead
- Deploying the web app kills in-flight analysis
- Shared CPU means analysis slows down web responses and vice versa

## Architecture

```
┌─────────────────┐          ┌──────────────────────┐
│   Web Machine   │  HTTP    │   Worker Machine     │
│   (shared-1x)   │◄────────►│   (shared-2x, 1GB)  │
│                 │ internal │                      │
│ - Serves pages  │ API      │ - Loads WASM once    │
│ - Owns SQLite   │          │ - No timeout pressure│
│ - Exposes       │          │ - Dedicated CPU      │
│   /api/internal │          │ - Own lifecycle      │
│   endpoints     │          │                      │
└─────────────────┘          └──────────────────────┘
```

The web server keeps SQLite and exposes 2-3 internal API endpoints (protected
by a shared secret via env var). The worker is a standalone Node.js script that
polls for work, analyzes audio, and posts results back.

## Internal API Endpoints (on web server)

All protected by `Authorization: Bearer <WORKER_SECRET>` header.

### GET /api/internal/audio-work

Returns the next release to process (URL + track list with stream URLs).
Handles stream URL refresh server-side before returning.

### POST /api/internal/audio-results

Accepts `{ trackId, bpm, musicalKey, keyCamelot }` or `{ trackId, error }`.
Saves result to DB, updates job progress.

### POST /api/internal/audio-status

Accepts `{ status: 'idle' | 'processing', currentTrackId? }`.
Lets the web server show worker health on the Account page.

## Worker Script (worker-main.js)

Standalone Node.js entry point (not Next.js):

1. Load Essentia WASM once on startup
2. Poll `GET /api/internal/audio-work` every few seconds
3. For each track: fetch audio, decode, analyze BPM+Key
4. Post results to `POST /api/internal/audio-results`
5. No artificial timeouts — just run until done or error
6. On error, log it, post the error, move to next track
7. Sleep when no work available

## Fly.io Setup

Option A — separate Fly app (`bandpass-worker`):
- Own `fly.worker.toml` with `[build]` pointing to a worker Dockerfile
- Own machine size (shared-cpu-2x, 1GB RAM recommended)
- Communicates with web app via internal Fly networking (`.internal` DNS)

Option B — process group in same app:
- Add `[processes]` to `fly.toml`: `worker = "node worker-main.js"`
- Simpler deployment but shares Docker image
- SQLite volume can only attach to one machine, so still needs HTTP API

Option A is cleaner for independent lifecycle and scaling.

## What This Solves

- **Auto-stopping**: Worker has own lifecycle, not tied to HTTP traffic
- **CPU/RAM contention**: Dedicated resources for analysis
- **WASM reload cascade**: Loads once, stays warm indefinitely
- **Timeout tuning**: No timeouts needed — worker runs at its own pace
- **Deploy interference**: Deploying web app doesn't affect worker

## Estimated Cost

- ~$5-7/month for a shared-2x Fly machine with 1GB RAM
- Worker can be stopped when no analysis work is pending

## Migration Path

1. Create internal API endpoints on web server
2. Build standalone worker script with Essentia analysis logic
3. Create `fly.worker.toml` and worker Dockerfile
4. Deploy worker, verify it processes tracks
5. Remove worker thread code from web server (`lib/sync/workers.ts` audio loop)
6. Remove `ENABLE_AUDIO_ANALYSIS` env var, esbuild worker step, etc.

## What We Keep

- Stream URL refresh logic (moves to API endpoint or stays in web server)
- SQLite job/progress tracking (web server still owns this)
- Account page UI for progress display (reads from same DB)
- Enrichment queue worker (lightweight, stays in web server process)
