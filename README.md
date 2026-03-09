# Bandpass

A Bandcamp discovery app. Named after the bandpass filter — let the signal through, cut the noise.

## What It Does

Bandcamp's feed is noisy. New releases, friend purchases, and recommendations are all mashed together with no way to focus on what matters. Bandpass pulls your entire Bandcamp feed into a fast, filterable interface so you can actually find music worth buying.

When you first connect your Bandcamp account, Bandpass syncs six months of your feed history. After that, it checks for new items each time you visit. Everything is stored locally so filtering is instant — no waiting for pages to load.

**Browse your feed your way.** Filter by feed type (new releases, friend purchases, also purchased), by specific friends, by genre tag, or by date range. See counts for each filter so you know where the interesting stuff is.

**Listen without leaving.** Every track has an inline waveform player. Click to play, scrub through the waveform, and keep browsing while it plays in a persistent bottom bar.

**Build a shortlist.** Heart tracks as you scan your feed. They're saved to a shortlist page where you can relisten, remove items, or open them all on Bandcamp when you're ready to buy.

**Multi-user.** Share the app with friends — each person connects their own Bandcamp account, and their feed data and shortlist are kept separate.

## Architecture

```
UI Layer (app/ routes + React components)
  │
  │  Server actions query SQLite, client components render
  │
Data Layer (lib/db/)
  │
  ├── index.ts      — SQLite connection + schema (better-sqlite3, versioned migrations)
  ├── queries.ts    — getFeedItems(), getTagCounts(), getFriendCounts()
  ├── sync.ts       — Background sync (full 6-month + smart incremental)
  └── shortlist.ts  — Shortlist CRUD (persisted to SQLite, keyed by fanId)
  │
Bandcamp Client (lib/bandcamp/)
  │
  ├── api.ts      — BandcampAPI class, normalizes raw responses into domain types
  ├── client.ts   — HTTP client with cookie auth (GET, POST form, POST JSON)
  ├── service.ts  — Creates per-request API instance from session cookie
  └── types/      — Raw API response types + normalized domain types
```

Server components load initial data from SQLite. Client components handle audio playback, filtering (via server actions), and shortlist toggling (optimistic UI + server action persistence). The sync API route (`/api/sync`) triggers background feed syncing into SQLite.

See `docs/plans/2026-03-08-bandpass-design.md` for the full design document.

## Key Files

| Path | Purpose |
|---|---|
| `docs/bandpass.md` | Original idea and motivation |
| `docs/plans/2026-03-08-bandpass-design.md` | Approved design document |
| `docs/research/bandcamp-api-surface.md` | Map of Bandcamp's internal API endpoints |
| `docs/research/data-layer-decision.md` | Why we built our own API client |
| `docs/research/bandcamp-fetch-evaluation.md` | Evaluation of bandcamp-fetch library |
| `scripts/inspect-feed.ts` | Diagnostic script — dumps raw feed response shapes |
| `scripts/feed-depth.ts` | Diagnostic script — measures how far back the feed goes |
| `lib/bandcamp/` | The Bandcamp API client |
| `lib/db/` | SQLite database layer (schema, queries, sync) |
| `components/feed/` | Feed UI components |

> **Note:** The diagnostic scripts in `scripts/` require a `BANDCAMP_IDENTITY` environment variable containing a valid Bandcamp identity cookie. Example: `BANDCAMP_IDENTITY="..." npx tsx scripts/inspect-feed.ts`

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- better-sqlite3 (SQLite)
- iron-session (encrypted cookie sessions)
- wavesurfer.js (waveform audio player)
- react-day-picker (date range filter)
- Vitest

## Implementation Details

- Custom Bandcamp API client (`lib/bandcamp/`) — thin typed wrapper over Bandcamp's internal JSON APIs, no third-party scraping libraries
- Feed fetching via `POST /fan_dash_feed_updates` with cookie auth
- SQLite caching (`data/bandpass.db`) — background sync pulls ~6 months of feed history on first login, then smart incremental updates on subsequent visits (scans past known items to find backdated entries)
- Feed page with story type filters (New Releases, Friend Purchases, Also Purchased), friend filter, tag filter, and date range picker
- Waveform audio player (persistent bottom bar with wavesurfer.js, streams via CORS proxy)
- Multi-user session auth via cookie paste (iron-session) — data keyed by Bandcamp `fanId`, survives cookie rotation
- Currency conversion (prices shown in USD with original currency below)
- Persistent shortlist — heart tracks in the feed, view/manage them on `/shortlist` with remove, clear all, and "Open all on Bandcamp" bulk action
- Initial sync loading screen with progress bar for new accounts
- Site-wide password gate (optional, via `SITE_PASSWORD` env var)
- Deployed to Fly.io with GitHub Actions CI/CD (auto-deploy on push to `main`)
- 31 tests covering HTTP client, API normalization, smart sync algorithm, DB queries, and session logic
