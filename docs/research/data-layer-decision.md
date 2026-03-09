# Data Layer Decision

**Date:** March 8, 2026
**Decision:** Build our own, informed by existing libraries

## Context

We evaluated two existing libraries and mapped Bandcamp's internal API surface:

- **bandcamp-fetch** (MIT, 69 stars) — covers discovery, collection, search, album/track detail. No feed support. ~4,370 LOC. Single maintainer, zero tests, fragile HTML scraping.
- **bandcamp-retriever** (UNLICENSED, 2 stars) — covers feed, collection, write operations. No discovery support. ~6,700 LOC. Single maintainer, zero tests, UNLICENSED.
- **Bandcamp's JSON APIs** — well-documented by the community. The feed, discovery, and collection endpoints are straightforward JSON POST/GET requests. Most data is available without HTML scraping.

Neither library alone covers our needs. Both are fragile, single-maintainer, poorly tested. bandcamp-retriever is legally unusable (UNLICENSED). Using bandcamp-fetch would leave us with a split data layer (library for discovery + custom code for feed).

## Decision

**Build our own focused Bandcamp API client.** Use the existing libraries as reference material for endpoint URLs, payload formats, and response shapes — but don't import either as a dependency.

## Rationale

1. **The endpoints are straightforward.** The feed is a POST with fan_id and a timestamp. Discovery is a POST with genre/tag params. Collection pagination is a POST with a continuation token. These don't need a library — they need a few well-typed fetch calls.

2. **Unified data layer.** One wrapper that handles feed, discovery, collection, and album detail with consistent error handling, auth, caching, and types. No split between library code and custom code.

3. **No fragile dependencies.** We control our own HTML scraping (if any) and can fix breakage immediately rather than waiting for an upstream maintainer.

4. **We can write tests.** Neither library has tests. We can test our wrapper against known response shapes and catch breakage early.

5. **JSON-first approach.** Where bandcamp-fetch scrapes HTML to bootstrap (e.g., fan profile page to get fan_id), we can use JSON endpoints directly (e.g., `/api/fan/2/collection_summary`). This reduces our HTML dependency surface.

## What We'll Build

A `lib/bandcamp/` module within the Next.js project. Thin, typed wrapper over Bandcamp's internal JSON APIs:

### Core Endpoints

| Our method | Bandcamp endpoint | Auth |
|---|---|---|
| `getFanId()` | `GET /api/fan/2/collection_summary` | identity cookie |
| `getFeed(olderThan?)` | `POST /fan_dash_feed_updates` | identity cookie |
| `getCollection(token?)` | `POST /api/fancollection/1/collection_items` | identity cookie |
| `getWishlist(token?)` | `POST /api/fancollection/1/wishlist_items` | identity cookie |
| `getFollowingArtists(token?)` | `POST /api/fancollection/1/following_bands` | none |
| `getFollowingFans(token?)` | `POST /api/fancollection/1/following_fans` | none |
| `discover(params)` | `POST /api/discover/1/discover_web` | none |
| `getRelatedTags(tags)` | `POST /api/tag_search/2/related_tags` | none |
| `refreshStream(url)` | `GET /api/stream/1/refresh` | none |

### Album Detail (may need HTML)

Full album detail with track listings and stream URLs may still require fetching the album HTML page and extracting embedded JSON (`data-tralbum`, `application/ld+json`). This is the one area where HTML parsing is likely unavoidable — but it's a single, well-understood pattern.

We'll investigate whether the feed and discovery responses include enough track/stream data to avoid this for most flows.

### What We Learn From Each Library

**From bandcamp-fetch:**
- Endpoint URLs and payload formats for discovery, tags, collection, stream refresh
- Image URL construction pattern: `${baseUrl}/img/a${imageId}_${formatId}.jpg`
- Album page parsing: `data-tralbum` + `application/ld+json` extraction
- Continuation token format for collection pagination

**From bandcamp-retriever:**
- Feed endpoint (`fan_dash_feed_updates`) implementation and response shape
- Exhaustive TypeScript type definitions for raw API responses (in `types/private/`)
- Feed story types: `nr` (new release), `fp` (friend purchase), `np` (also purchased)
- CSRF crumb handling for write operations (future: follow/wishlist from within BandPass)
- Two-layer type architecture (raw API shapes → normalized public types)

**From michaelherger/Bandcamp-API:**
- OpenAPI 3.0 spec of undocumented endpoints
- `older_than_token` format: `{timestamp}:{tralbum_id}:{tralbum_type}:{index}:{unused}`
- Starting token: `"9999999999:9999999999:a::"` fetches from beginning

## Risks

- **Bandcamp can change endpoints at any time.** Acceptable for a personal project. We'll notice quickly because we use the app regularly.
- **Album detail may require HTML parsing.** We'll minimize this and isolate it behind a clean interface so it's easy to fix if Bandcamp changes their page structure.
- **We're writing more code upfront.** But it's straightforward code (typed fetch calls + response parsing), and we avoid the maintenance burden of fragile upstream dependencies.

## Next Steps

1. Update the design doc to reflect this decision
2. Write a revised implementation plan that starts with the Bandcamp API client
3. First milestone: authenticate, fetch feed, render it — proof that the data layer works end-to-end
