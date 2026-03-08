# Bandpass

A Bandcamp discovery app. Named after the bandpass filter — let the signal through, cut the noise.

## What It Does

Shows your Bandcamp social feed (friend purchases, new releases from followed artists) in a dense, filterable UI with inline audio playback. Better than Bandcamp's own feed.

## Status (March 8, 2026)

**MVP is working.** The app fetches your live Bandcamp feed, renders it with filtering, audio playback, and a shortlist.

### What's built
- Custom Bandcamp API client (`lib/bandcamp/`) — thin typed wrapper over Bandcamp's internal JSON APIs, no third-party scraping libraries
- Feed fetching via `POST /fan_dash_feed_updates` with cookie auth
- Feed page with story type filters (Friends, New Releases, Also Purchased)
- Inline audio player (persistent bottom bar, streams from Bandcamp's CDN)
- One-click shortlist (client-side state, not persisted yet)
- 12 tests covering the HTTP client and API normalization layer

### What's not built yet (Phase 2)
- SQLite caching (currently fetches live from Bandcamp on every visit)
- Discovery/browse endpoint integration
- Persisted shortlist (saved to disk/DB)
- Album detail page (full track listing)
- Social graph analysis (which friends have the most taste overlap)

## Getting Started

### Prerequisites
- Node.js 22+
- A Bandcamp account with an active session

### Setup

```bash
npm install
```

Get your Bandcamp identity cookie:
1. Log in to bandcamp.com
2. Open DevTools → Application → Cookies → bandcamp.com
3. Copy the value of the `identity` cookie

Create `.env.local`:
```
BANDCAMP_IDENTITY=<paste your identity cookie value>
```

### Run

```bash
npm run dev
```

Open http://localhost:3000

### Test

```bash
npm test
```

## Architecture

```
UI Layer (app/ routes + React components)
  │
  │  Clean API: getFeed(), getFanId()
  │
Data Service Layer (lib/bandcamp/)
  │
  ├── api.ts      — BandcampAPI class, normalizes raw responses into domain types
  ├── client.ts   — HTTP client with cookie auth (GET, POST form, POST JSON)
  ├── service.ts  — Singleton, reads cookie from env
  └── types/      — Raw API response types + normalized domain types
```

Server components fetch data (keeping the cookie server-side). Client components handle audio playback, filtering, and shortlist state.

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
| `lib/bandcamp/` | The Bandcamp API client |
| `components/feed/` | Feed UI components |

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- Vitest
