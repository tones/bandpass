# BandPass

A Bandcamp discovery app. Named after the bandpass filter — let the signal through, cut the noise.

**Status:** Idea stage (March 8, 2026)
**Repo:** TBD — build in a separate repo, likely using Windsurf

## The Problem

Bandcamp is the best place to buy music, but its discovery features are messy and hard to navigate:

- **Feed page:** Shows what friends are buying and new releases from artists you've bought from. Useful data, bad UI — hard to scan, no filtering, no way to surface patterns.
- **Discover page:** Tag/genre filtering, but not tied to personal taste. Browsing is clunky — lots of clicking, no way to cross-reference what you like with what's trending.
- **Search:** Basic. No semantic or taste-aware search.

The data on Bandcamp is incredibly rich. The UI for navigating it is not.

## The Goal

A private app (personal use, maybe shared with 1-2 friends) that makes it easier to explore and discover music on Bandcamp — better than Bandcamp's own UI.

Core use case: "Show me music I'm likely to love that I haven't found yet, based on what I already buy and listen to on Bandcamp."

## What Exists Already

### Official Bandcamp API
Not useful. It's for labels and merch fulfillment — sales reports, order management. No discovery, no feed, no search. Requires applying for access.

### Internal Bandcamp APIs (the real path)
Bandcamp's web and mobile apps hit internal API endpoints that are well-documented by the community:
- `/api/discover/1/discover_web` — powers the Discover page, accepts genre/tag/format params
- `/api/collectionsync/1/collection` — collection sync, uses Bearer token auth
- Feed endpoints — what friends are buying, new releases from followed artists

### bandcamp-fetch (Node.js library)
The best existing tool. MIT-licensed, TypeScript, actively maintained. Wraps Bandcamp's internal endpoints:
- **Discovery** — Discover page with tag/genre filtering
- **Search** — content search
- **Fan collections** — wishlists, purchased music, followed artists/genres
- **Artist/label info** — discographies, profiles
- **Album/track info** — detailed metadata
- **Tag browsing** — releases and highlights by tag
- Supports authenticated sessions via cookies (access to personal collection, feed)

npm: `bandcamp-fetch`
GitHub: https://github.com/patrickkfkan/bandcamp-fetch

### Other scraping tools
- `bandcamp-scraper` (GitHub, 190 stars) — older, less comprehensive
- `bandcamper` — unofficial API server, archived 2019
- Reverse-engineered auth protocol: https://mijailovic.net/2024/04/04/bandcamp-auth/

### Existing discovery apps (none nail this)
- **CampFS** — browse Bandcamp as filesystem. Clever, not a discovery UI.
- **MusicWander** — Last.fm-based niche artist discovery. Not Bandcamp-specific.
- Various Spotify tools (Unheard.FM, Recs.ai, Songstack) — don't touch Bandcamp.

Nobody has built a proper "Bandcamp discovery UI that's better than Bandcamp's."

## Possible Approaches

### 1. Taste-aware discovery
Pull my purchased music and collection. Extract tags, genres, labels, artists. Use those to query Discover with smarter, compound tag combinations than Bandcamp's UI supports. Surface: "here's what's new in the intersection of tags that describe your taste."

### 2. Social graph mining
My feed shows what friends buy. Follow the taste graph: which friends' purchases overlap most with mine? What are *they* buying that I haven't seen? Rank albums by social signal strength weighted by taste similarity.

### 3. Label/artist graph exploration
When I buy an album, I care about the label and the other artists on it. Bandcamp makes it hard to explore label catalogs and artist networks efficiently. Build a graph: artist → label → other artists on that label → their tags → related releases.

### 4. LLM-assisted curation
Feed album descriptions, tags, and artist bios to a model. Cluster and recommend based on stated musical preferences (deep/soulful house, jazzy minor keys, R&B harmony, atmospheric/cinematic, restraint over maximalism). Could use the music identity context from existing notes.

### 5. Better browse UI
Even without smart recommendations — just a cleaner, denser, more scannable interface for browsing Discover results and feed activity. Show more metadata per item. Filter and sort in ways Bandcamp doesn't support.

These aren't mutually exclusive. Start simple (probably #5 or #1), layer on complexity.

## Technical Starting Point

- **Data layer:** `bandcamp-fetch` (Node.js/TypeScript)
- **Auth:** Bandcamp session cookie for authenticated endpoints
- **Frontend:** TBD — could start as CLI scripts, graduate to a simple web app
- **Stack suggestion:** Node/TypeScript backend, lightweight frontend (React or even just static HTML with vanilla JS to start)
- **Hosting:** Local only to start. If deploying, something simple — Vercel, Cloudflare Pages

## Open Questions

- How stable are Bandcamp's internal APIs? Could break at any time. Acceptable risk for a personal project.
- Rate limiting? Unknown. Start gentle, see what happens.
- Does `bandcamp-fetch` cover the feed (friends' purchases) or just collection? Needs investigation.
- What's the minimum viable thing that's already useful? Probably: pull my collection, show me Discover results filtered by my most common tags, in a UI that's denser and more scannable than Bandcamp's.
- How to handle audio preview? Bandcamp has 30-second previews on most tracks. Can `bandcamp-fetch` access stream URLs?

## Tim's Music Context

For reference, Tim's musical taste and identity are documented in the Vector repo at `personal/music/context.md`. Key aesthetic markers for discovery tuning:
- Deep/soulful house, jazzy minor keys, hip-hop with harmonic sophistication
- R&B (70s + neo-soul harmony), ECM-style minimalism, moody cinematic textures
- Bias toward restraint, space, dynamic arc, emotional tension
- Not chasing: festival drops, EDM maximalism, loudness wars
