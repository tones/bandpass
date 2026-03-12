# Bandpass

A Bandcamp discovery app. Named after the bandpass filter — let the signal through, cut the noise.

## What It Does

Bandcamp's feed is noisy. New releases, friend purchases, and recommendations are all mashed together with no way to focus on what matters. Bandpass pulls your entire Bandcamp feed into a fast, filterable interface so you can actually find music worth buying.

When you first connect your Bandcamp account, Bandpass syncs your feed history and continues loading older data in the background. Everything is stored locally so filtering is instant — no waiting for pages to load.

**Browse your feed your way.** Filter by feed type (new releases, friend purchases, also purchased), by specific friends, by genre tag, or by date range. See counts for each filter so you know where the interesting stuff is.

**Listen without leaving.** Every track has an inline waveform player. Click to play, scrub through the waveform, and keep browsing while it plays in a persistent bottom bar.

**Organize with crates.** Bookmark tracks as you scan your feed or browse artist pages. Create multiple named crates to organize your finds — "Jazz," "Friday Picks," whatever you want. A multi-select picker lets you add tracks to any crate from the timeline or artist pages.

**View your Bandcamp wishlist.** Your Bandcamp wishlist appears as a read-only crate in Bandpass, synced from your account. Refresh it anytime to pick up changes.

**Tag enrichment.** Bandpass automatically backfills genre tags for your purchases and wishlist items by scraping album pages in the background. Tags appear on items across the app as they're enriched.

**Explore artist and label catalogs.** Browse any Bandcamp artist or label at `/music`. See their full discography with all tracks expanded, release dates, and genre tags. Play any track inline and bookmark it to a crate. Tags link back to your feed filtered by that genre.

**Works without logging in.** The Music section is fully browsable without a Bandcamp account. Log in to unlock your personal feed and crates.

**Multi-user.** Share the app with friends — each person connects their own Bandcamp account, and their feed data and crates are kept separate.

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
  ├── sync.ts       — Background sync (feed, collection, wishlist, tag enrichment)
  ├── crates.ts     — Crate CRUD (multi-list management, keyed by fanId)
  └── catalog.ts    — Artist/label discography + track cache
  │
Bandcamp Client (lib/bandcamp/)
  │
  ├── api.ts      — BandcampAPI class, normalizes raw responses into domain types
  ├── client.ts   — HTTP client with cookie auth (GET, POST form, POST JSON)
  ├── scraper.ts  — Extracts discography, tracks, tags from Bandcamp HTML pages
  ├── service.ts  — Creates per-request API instance from session cookie
  └── types/      — Raw API response types + normalized domain types
```

Server components load initial data from SQLite. Client components handle audio playback, filtering (via server actions), and crate management (optimistic UI + server action persistence with error rollback). The sync API route (`/api/sync`) triggers background feed syncing into SQLite. The music API route (`/api/music/[slug]`) fetches and caches artist discographies and album tracks.

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
| `lib/bandcamp/` | The Bandcamp API client + HTML scraper |
| `lib/db/` | SQLite database layer (schema, queries, sync, crates, catalog) |
| `components/feed/` | Feed UI components |
| `components/music/` | Music/catalog UI components |

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
- HTML scraper (`lib/bandcamp/scraper.ts`) — extracts structured JSON from Bandcamp's `data-client-items`, `data-tralbum`, and `data-band` HTML attributes for discography, track, and tag data
- Feed fetching via `POST /fan_dash_feed_updates` with cookie auth
- SQLite caching (`data/bandpass.db`) — background sync pulls feed history on first login, then deep syncs older data and smart incremental updates on subsequent visits
- Five-stage sync pipeline: initial feed → deep feed history → collection (purchases) → wishlist → tag enrichment
- Three-section app: Music (default landing page, works without login), Feed (requires login), Crates (requires login)
- Music section browses any Bandcamp artist/label domain — full discography with tracks expanded, release dates, genre tags, inline playback and bookmarking
- Feed page with story type filters (New Releases, Friend Purchases, Also Purchased), friend filter, tag filter with one-click clear, and date range picker
- Tag deep linking — clicking a tag on an artist page links to `/timeline?tag=` pre-filtered
- Waveform audio player (persistent bottom bar with wavesurfer.js, streams via CORS proxy)
- Multi-user session auth via cookie paste (iron-session) — data keyed by Bandcamp `fanId`, survives cookie rotation
- Currency conversion (prices shown in USD with original currency below)
- Crates — create, rename, delete multiple named lists. Bookmark tracks in the feed or on artist pages. Multi-select picker when multiple crates exist. "Open all on Bandcamp" bulk action
- Bandcamp wishlist sync — paginated import of wishlist items, stale item cleanup on refresh
- Tag enrichment queue — background scraping of album pages to backfill genre tags for purchases and wishlist items, with retry and progress tracking
- Authorization — all crate-mutating operations verify fan ownership
- Deep background sync with progress indicator — continues loading older feed history while you browse
- Site-wide password gate (optional, via `SITE_PASSWORD` env var)
- Deployed to Fly.io with GitHub Actions CI/CD (auto-deploy on push to `main`)
