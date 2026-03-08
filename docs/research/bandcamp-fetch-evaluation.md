# bandcamp-fetch Evaluation

**Date:** March 8, 2026
**Repo:** https://github.com/patrickkfkan/bandcamp-fetch
**Version evaluated:** 3.0.0 (released Sep 12, 2025)

## Summary

bandcamp-fetch is a well-structured, mid-weight TypeScript scraping library (~4,370 LOC). It's not a thin wrapper — there's real parsing logic, thoughtful type modeling, and clean architecture. But it has significant risks as a dependency (single maintainer, zero tests, fragile to Bandcamp HTML changes) and doesn't cover our most important feature (the social feed).

**Recommendation: Learn from it, don't depend on it.** Its source code is the best available map of Bandcamp's internal API surface. Use that knowledge to build our own focused data layer.

---

## Maintenance Health

| Metric | Value | Risk |
|---|---|---|
| Last commit | Sep 12, 2025 (6 months ago) | Moderate |
| Maintainer | 1 person (patrickkfkan), 100% of commits | High (bus factor) |
| Test coverage | Zero — no tests, no test framework | High |
| Open issues | 0 (all 11 ever filed are closed) | Low |
| npm downloads | ~500/month | Low adoption |
| Dependencies | 4 runtime (cheerio, html-entities, node-cache, bottleneck) | Low risk |

Development happens in reactive bursts: silence until Bandcamp breaks the scraper, then a flurry of fixes. v2.0.0 was a 3-day rewrite in Nov 2024. v3.0.0 was a same-day fix in Sep 2025 after Bandcamp changed their HTML. The primary consumer appears to be the author's own Volumio music player plugin.

## Architecture

Clean domain-driven structure. Every feature area follows the same pattern:

```
{domain}/
  {Domain}API.ts       — request orchestration
  {Domain}Parser.ts    — static parsing methods
```

11 domain areas: album, track, band, fan, discovery, search, article, show, autocomplete, stream, image, tag. Each API class also has a `Limiter*` subclass for optional rate limiting via Bottleneck.

## How It Talks to Bandcamp

**Uses both HTML scraping and internal JSON API calls.** The split:

### HTML Scraping (GET → parse embedded JSON)
- Album/Track pages: extracts `<script type="application/ld+json">` and `<script data-tralbum>` JSON
- Fan pages: extracts `#pagedata[data-blob]` attribute (massive JSON blob)
- Search results: parses CSS-class-based HTML structure with Cheerio
- Band/Artist pages: extracts embedded data
- Discovery/Daily pages: extracts constants from inline scripts

**Key insight:** It rarely parses raw HTML markup. Instead, it uses Cheerio to locate embedded JSON blobs that Bandcamp server-side-renders into HTML attributes and script tags. Clever, but still fragile to structural changes.

### Internal JSON API Calls (POST)

| Endpoint | Used For |
|---|---|
| `/api/discover/1/discover_web` | Discovery browse |
| `/api/fancollection/1/collection_items` | Collection pagination |
| `/api/fancollection/1/wishlist_items` | Wishlist pagination |
| `/api/fancollection/1/following_bands` | Following pagination |
| `/api/fancollection/1/following_genres` | Following genres pagination |
| `/api/tag_search/2/related_tags` | Related tags |
| `/api/hub/2/dig_deeper` | Discovery deep dig |
| `/api/bcradio_api/1/get_show` | Radio shows |
| `/api/bcweekly/3/list` | Show listing |
| `/api/bcsearch_public_api/1/tag_search` | Autocomplete |
| `/api/location/1/geoname_search` | Location autocomplete |
| `/api/stream/1/refresh` | Stream URL refresh |

### Auth
Cookie passed as raw `Cookie` header on every request. No auth flow, no login, no token refresh, no session management. Consumer provides the cookie string.

### No browser-like headers
No User-Agent, no Referer, no Accept-Language. Just the bare request with optional cookie.

## Parsing Substance

The library does meaningful work beyond fetching:

- **Image URL construction** from `(baseUrl, imageId, formatId)` tuples
- **Stream URL extraction** — both `mp3-128` and `mp3-v0` (HQ) from track data
- **Artist URL reconstruction** from `url_hints.subdomain`
- **Multi-source merging** — album info combines LD+JSON structured data with `data-tralbum` player data
- **Fallback chains** — band info tries main page → music page → first discography item
- **Pagination** — cursor-based continuation for fan collections, cursor-based for discovery, page-number for search

TypeScript types are well-defined: `MediaKind` (base for Album/Track), `UserKind` (base for Fan/Artist/Label), full interface hierarchy.

## What It Doesn't Cover

**The social feed.** Zero feed-related code. Searched for `feed`, `activity`, `notification`, `story` across the entire source — nothing. The Fan API covers static profile data only: who the fan is, what they own, what they follow. No temporal/event data.

This means for our #1 feature (the feed), we'd need custom code regardless.

## Error Handling & Resilience

- **429 detection** — throws `FetchError` with code 429
- **No retry logic, no backoff** for any error
- **No handling of 403/404/500** — non-429 errors silently proceed to parsing, which then throws `ParseError`
- **Rate limiting** — opt-in via `limiter.*` variants (Bottleneck, `maxConcurrent: 5, minTime: 200ms`)
- **No response validation** beyond parse-or-throw

## What We Learn From It

Even if we don't use the library, its source is valuable:

1. **Endpoint map** — the full list of internal API URLs, methods, and payload formats
2. **Data extraction patterns** — where JSON blobs live in Bandcamp's HTML pages
3. **Pagination protocol** — the `{fanId, token}` continuation pattern for fan collections
4. **Image URL format** — how to construct image URLs at arbitrary sizes
5. **Stream URL format** — where `mp3-128` and `mp3-v0` stream URLs live in track data
6. **Discovery API params** — how to query the discover endpoint with genre/tag/sort/location

## Risk Summary

| Factor | Assessment |
|---|---|
| Will it break? | Yes, when Bandcamp changes HTML. Has happened multiple times. |
| Will it get fixed? | Eventually — single maintainer responds reactively, ~5 week lag. |
| Can we fix it ourselves? | Yes, but then we're maintaining a fork. |
| Is it tested? | No. Regressions found only at runtime. |
| Does it cover our #1 feature? | No. No feed support at all. |
| Is the parsing substantial? | Yes — non-trivial to reimplement from scratch. |
| Are the endpoints valuable? | Very — best available documentation of Bandcamp's internal APIs. |
