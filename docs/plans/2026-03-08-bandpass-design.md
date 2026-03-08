# Bandpass Design

**Date:** March 8, 2026
**Status:** Approved — ready for implementation planning

## Problem

Bandcamp is the best place to buy music, but its discovery UX is poor. The feed mashes together different signal types (friends' purchases, new releases, wishlist adds) in a chronological stream with no filtering, no context density, and no pattern surfacing. The Discover page isn't tied to personal taste. Audio previews require clicking away from whatever you're browsing. The data is rich; the interface for navigating it is not.

## Goal

A personal web app that makes it easier to discover music on Bandcamp — starting with a better feed experience. Core use case: surface music you're likely to love based on social signals (friends' purchases) and personal taste patterns, with enough inline context and audio preview to triage quickly.

**Users:** Tim, possibly 1-2 friends later.
**Usage cadence:** A few times a week, aiming for daily-worthy.

## Architecture

Single Next.js (App Router) codebase with two internal layers and a clean boundary between them.

```
UI Layer (app/ routes + React components)
  │
  │  Clean API: getFeed(), getAlbum(), searchByTag(), etc.
  │
Data Service Layer (lib/bandcamp/)
  │
  ├── SQLite cache (better-sqlite3 or drizzle-orm)
  └── Custom Bandcamp API client (wraps internal JSON APIs directly)
```

### UI Layer

Next.js App Router pages and React components. Server components fetch data from the data service (keeping the Bandcamp cookie server-side). Client components handle audio playback, interactive filtering, and shortlist management.

### Data Service Layer

Custom Bandcamp API client (no third-party library — see `docs/research/data-layer-decision.md`) that wraps Bandcamp's internal JSON APIs directly. Owns the SQLite database. Exposes a clean API to the UI layer. Internally handles all caching decisions: check SQLite first, decide if data is fresh enough, fetch from Bandcamp if not, cache the result, return it. The UI layer never knows about the Bandcamp endpoints or SQLite directly.

This boundary is intentional. If the data service ever needs to become a separate API server, it lifts out cleanly.

### Key Technology Choices

- **Next.js with App Router** — server components keep auth server-side; single codebase for server and client
- **TypeScript** — types flow end-to-end from API responses to UI
- **SQLite** — zero-config, file-based, correct for a single-user app
- **Custom Bandcamp API client** — thin typed wrapper over Bandcamp's internal JSON APIs (feed, discovery, collection). No third-party scraping library. See research docs for rationale.

### Auth

Bandcamp session cookie, manually copied from browser DevTools, stored in a local `.env` file. Read only by server-side code. Future: friendlier auth flow for sharing with friends (possibly using the reverse-engineered auth protocol).

### Deployment

Local (`next dev`) for now. Deployable to Fly.io later — SQLite on a persistent volume, no managed database needed. Architecture is the same in both environments.

## Data Model

**Deferred pending Phase 0 research.** The schema will be designed after we investigate what `bandcamp-fetch` actually exposes and what the raw feed/discovery data looks like. Design principles:

- Cache-first: the default behavior is to read from SQLite. Fetch from Bandcamp only when data is missing or stale.
- Each entity type has its own TTL policy (album metadata is long-lived; feed items refresh more aggressively).
- Schema follows features — start with only the tables needed for the first feature, extend as we add capabilities.

### Expected Entities (to be refined)

- Feed items (social activity events)
- Albums (cached metadata, stream URLs, tags)
- Artists
- Labels
- Fans (friends / collectors)
- Shortlist (local triage list, separate from Bandcamp's wishlist)

## UI Design

### Core Principle: One Unified Browse Surface

Feed and Discover are both "lists of releases." Rather than separate pages, they're different filter states of the same view. The source of the recommendation (friend purchase, new release, discovery browse, tag search) is a filter dimension alongside genre, tag, and recency.

### Layout

Dense horizontal list items — album art on the left, metadata stacked to the right (title, artist, label, tags, social signal), action buttons (play, shortlist, Bandcamp link) on the far right. Optimized for vertical scanning and quick triage. 8-10 items visible on screen without scrolling.

### Persistent Audio Player

Bottom-docked player, always visible. Click play on any item and it starts playing without navigating away. Keep browsing while listening. This is the single biggest UX upgrade over Bandcamp's feed.

### Social Signal Amplification

When multiple friends bought the same album, that signal is visually prominent: "Sarah and 2 others bought this." High-overlap purchases are the highest-value discovery signal.

### Filtering

Filter bar toggles between signal types (friends' purchases, new releases, wishlist adds, etc.), with tag/genre filters layered on top. Exact filter options depend on what the API research reveals.

### Shortlist

One-click save (heart icon) from any item. Separate "List" view to review saved items, add optional notes, and link out to Bandcamp to buy.

### Navigation

Top-level tabs (may evolve): Feed, Discover, List. These may merge into filter states of a single view as the design matures.

## Audio Playback

- `bandcamp-fetch` retrieves stream URLs from album/track detail endpoints
- Stream URLs are cached alongside album metadata
- Playback is client-side — browser streams directly from Bandcamp's CDN via HTML `<audio>` element (or howler.js if more control is needed)
- No audio proxying through our server; zero bandwidth cost
- Stream URLs may expire; on playback failure, the data service re-fetches track detail for a fresh URL

## Phase 0: Research (Completed)

Research findings documented in `docs/research/`. Key outcomes:

- **Feed endpoint discovered:** `POST /fan_dash_feed_updates` returns typed JSON with story entries (new releases, friend purchases, also-purchased). No HTML scraping needed.
- **Feed story types:** `nr` (new release), `fp` (friend purchase), `np` (also purchased). Each includes album metadata, tags, art URL, featured track stream URL, and social signal (`also_collected_count`).
- **Fan ID bootstrap:** `GET /api/fan/2/collection_summary` gives us fan_id from the identity cookie. No HTML scraping.
- **bandcamp-fetch evaluated and rejected:** Well-structured but no feed support, zero tests, single maintainer, fragile HTML scraping. Its source taught us the endpoint surface.
- **bandcamp-retriever evaluated:** Has feed support but UNLICENSED. Valuable as reference for response type shapes.
- **Decision: build our own API client.** JSON-first, thin typed wrapper, no third-party scraping dependencies.

## Open Questions

- Stream URL expiration policy — how long are preview URLs valid?
- Rate limiting behavior on feed/discovery endpoints — start gentle, observe.
- Does `collection_items` work with a "start from beginning" token, or needs initial HTML scrape?
- How stable are Bandcamp's internal APIs? Acceptable risk for a personal project.
