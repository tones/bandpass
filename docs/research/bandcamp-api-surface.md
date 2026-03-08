# Bandcamp API Surface — Research Findings

**Date:** March 8, 2026

## Key Discovery: The Feed Endpoint Exists and Is Well-Documented

The social feed is served by a proper JSON API endpoint. Multiple independent projects use it successfully.

### The Feed: `POST /fan_dash_feed_updates`

```
POST https://bandcamp.com/fan_dash_feed_updates
Content-Type: application/x-www-form-urlencoded
Cookie: identity=<identity_cookie>

fan_id=<numeric_fan_id>&older_than=<unix_timestamp>
```

**Response shape:**
```json
{
  "ok": true,
  "stories": {
    "entries": [ ... ],
    "oldest_story_date": 1709000000,
    "newest_story_date": 1709500000,
    "track_list": { "entries": [ ... ] },
    "feed_timestamp": 1709500000
  },
  "fan_info": { "<fan_id>": { ... } },
  "band_info": { "<band_id>": { "name": "...", "band_id": 123, "image_id": 456, "followed": true } },
  "story_collectors": { ... },
  "item_lookup": { ... }
}
```

**Story types** (the `story_type` field):
- `"nr"` — New Release from a followed artist
- `"fp"` — Friend Purchased (someone you follow bought something)
- `"np"` — Someone Also Purchased (community purchase activity)

**Each story entry contains:**
- `fan_id`, `item_id`, `item_type` (album `"a"` or track `"t"`)
- `tralbum_id`, `band_id`, `story_type`, `story_date`
- `item_title`, `item_url`, `item_art_url`
- `band_name`, `band_url`, `genre_id`
- `is_purchasable`, `currency`, `price`
- `album_id`, `album_title`
- `featured_track_title`, `featured_track_duration`, `featured_track_url`
- `also_collected_count` (social signal — how many others bought this)
- `tags[]` with `name` and `norm_name`

**Pagination:** Use `oldest_story_date` from the response as the next `older_than` value.

### Getting fan_id: `GET /api/fan/2/collection_summary`

```
GET https://bandcamp.com/api/fan/2/collection_summary
Cookie: identity=<identity_cookie>
```

Returns `fan_id`, collection overview, and follow data. This bootstraps everything — no HTML scraping needed to get started.

## Complete Endpoint Map

### Authenticated Endpoints (require identity cookie)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/fan/2/collection_summary` | GET | Fan ID + collection overview |
| `/fan_dash_feed_updates` | POST | Social feed (the main one) |
| `/fan_feed_poll` | POST | Feed polling (older, needs CSRF crumb) |

### Collection/Fan Endpoints (fan_id + token pagination)

All use POST with body: `{ "fan_id": N, "older_than_token": "...", "count": N }`

| Endpoint | Purpose |
|---|---|
| `/api/fancollection/1/collection_items` | Purchased music |
| `/api/fancollection/1/wishlist_items` | Wishlist |
| `/api/fancollection/1/following_bands` | Followed artists/labels |
| `/api/fancollection/1/following_genres` | Followed genres |
| `/api/fancollection/1/followers` | Fan's followers |
| `/api/fancollection/1/following_fans` | Fans the user follows |

Starting token format: `"9999999999:9999999999:a::"` (fetches from beginning).

### Discovery Endpoints (no auth needed)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/discover/1/discover_web` | POST | Browse by genre/tag/sort/location |
| `/api/hub/2/dig_deeper` | POST | Discovery deep dig |
| `/api/tag_search/2/related_tags` | POST | Related tags |
| `/api/bcsearch_public_api/1/tag_search` | POST | Tag autocomplete |
| `/api/location/1/geoname_search` | POST | Location autocomplete |

### Other Endpoints

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/stream/1/refresh` | GET | None | Refresh expired stream URLs |
| `/api/salesfeed/1/get` | GET | None | Currently selling items (global) |
| `/api/bcweekly/3/list` | GET | None | Bandcamp Weekly shows |
| `/api/collectionsync/1/collection` | GET | Bearer token (mobile) | Mobile app collection sync |

## Feed vs. Discovery: Different Data Sources

**Feed** (`/fan_dash_feed_updates`): Personalized social stream. New releases from artists you follow, purchases by fans you follow. Requires auth. Temporal — events have dates.

**Discovery** (`/api/discover/1/discover_web`): Public browse. Filter by genre, subgenre, tags, location, sort order. No auth needed. Not personalized — same results for everyone with the same filters.

They are completely different endpoints and data sources. But the output items (albums/tracks with metadata, art, stream URLs, tags) are similar enough to render in the same UI. The design concept of a unified browse surface with "source" as a filter dimension holds up.

## The HTML Scraping Question

**For our use case, we may not need HTML scraping at all.** Here's why:

1. **Fan ID** — available from `/api/fan/2/collection_summary` (JSON, no HTML)
2. **Feed** — `/fan_dash_feed_updates` (JSON)
3. **Collection** — `/api/fancollection/1/collection_items` can be called directly with fan_id and a starting token
4. **Discovery** — `/api/discover/1/discover_web` (JSON)
5. **Album detail** — this is the one area where we might still need to fetch an HTML page (to get full track listings with stream URLs), unless the feed/discovery responses include enough track data

bandcamp-fetch scrapes HTML primarily to bootstrap (get fan_id and initial page data). If `collection_summary` gives us fan_id and the fancollection APIs accept a "start from beginning" token, the HTML scraping layer becomes unnecessary for most flows.

## Auth: Simpler Than Expected

Two auth mechanisms exist:

1. **Identity cookie** (web) — the one we'll use. Long-lived, obtained from browser. Works with all web API endpoints. Just set `Cookie: identity=<value>`.

2. **Bearer token** (mobile) — requires a complex challenge-response protocol (HMAC-SHA256 + Hashcash proof-of-work). Only needed for `/api/collectionsync/1/collection`. We don't need this.

For our manual-cookie-paste approach, the identity cookie is all we need. It's URL-encoded JSON containing user ID and hash.

## Another Library: bandcamp-retriever

Discovered during research: [lufinkey/bandcamp-retriever](https://github.com/lufinkey/bandcamp-retriever) — a TypeScript/Node.js library that covers the feed, collection, and search. More relevant to our use case than bandcamp-fetch because it actually supports the feed endpoint. Worth evaluating.

## Other Relevant Projects

| Project | Language | Relevance |
|---|---|---|
| [michaelherger/Bandcamp-API](https://github.com/michaelherger/Bandcamp-API) | OpenAPI YAML | Best API documentation — full OpenAPI 3.0 spec |
| [lufinkey/bandcamp-retriever](https://github.com/lufinkey/bandcamp-retriever) | TypeScript | Feed + collection + search library |
| [gadgetmies/fomoplayer](https://github.com/gadgetmies/fomoplayer) | JS | Chrome extension that fetches and plays feed |
| [bandaid-IH/bandaid](https://github.com/bandaid-IH/bandaid) | Node.js | Web app that sorts Bandcamp feed |
| [har-nick/BandKit](https://github.com/har-nick/BandKit) | Kotlin | Clean feed API implementation |
| [JeffreyGaydos/bandcamp-rss-feeds](https://github.com/JeffreyGaydos/bandcamp-rss-feeds) | Python | Collection/wishlist to RSS |

## Open Questions for Hands-On Testing

- Does `collection_items` work with a "start from beginning" token directly, or does it need an initial HTML scrape?
- How much track/stream data is included in feed story entries vs. needing a separate album detail fetch?
- How long does the identity cookie last before expiring?
- Rate limiting behavior on the feed endpoint?
- What does the `also_collected_count` field actually represent — total collectors, or just friends?
