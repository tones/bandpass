# Phase 0: Research & Foundation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up the project, explore what bandcamp-fetch provides, investigate the missing feed API, and document findings so we can design the data model and feature set around reality.

**Architecture:** Next.js 15 App Router, TypeScript, bandcamp-fetch for Bandcamp API access. Research scripts live in `scripts/` and run via `npx tsx`. Results are logged to `docs/research/`.

**Tech Stack:** Next.js 15, TypeScript, bandcamp-fetch, tsx (for running scripts)

---

### Task 1: Initialize Next.js Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`
- Create: `.env.local` (gitignored, holds Bandcamp cookie)
- Create: `.gitignore`

**Step 1: Scaffold Next.js**

```bash
npx create-next-app@latest . --typescript --eslint --tailwind --app --src-dir=false --import-alias="@/*" --use-npm
```

Accept defaults. This creates the full project structure.

**Step 2: Verify it runs**

```bash
npm run dev
```

Open http://localhost:3000 — should see the Next.js welcome page. Stop the dev server.

**Step 3: Install research dependencies**

```bash
npm install bandcamp-fetch
npm install -D tsx
```

**Step 4: Set up env for Bandcamp cookie**

Add to `.env.local`:

```
BANDCAMP_COOKIE=<paste your cookie here>
```

Verify `.env.local` is in `.gitignore` (create-next-app should have added it).

**Step 5: Create research directories**

```bash
mkdir -p scripts docs/research
```

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with bandcamp-fetch"
```

---

### Task 2: Verify Auth & Explore Fan Info

Test that cookie auth works and see what fan profile data looks like.

**Files:**
- Create: `scripts/explore-fan-info.ts`
- Create: `docs/research/fan-info.md` (findings)

**Step 1: Write the exploration script**

```typescript
// scripts/explore-fan-info.ts
import bcfetch from 'bandcamp-fetch';

const cookie = process.env.BANDCAMP_COOKIE;
if (!cookie) {
  console.error('Set BANDCAMP_COOKIE in .env.local');
  process.exit(1);
}

bcfetch.setCookie(cookie);

async function main() {
  console.log('=== Fan Info (authenticated user) ===');
  const me = await bcfetch.fan.getInfo({});
  console.log(JSON.stringify(me, null, 2));

  console.log('\n=== Following Artists & Labels (first page) ===');
  const following = await bcfetch.fan.getFollowingArtistsAndLabels({});
  console.log(`Total: ${JSON.stringify(following).length} bytes`);
  console.log(JSON.stringify(following, null, 2));

  console.log('\n=== Following Genres ===');
  const genres = await bcfetch.fan.getFollowingGenres({});
  console.log(JSON.stringify(genres, null, 2));
}

main().catch(console.error);
```

**Step 2: Run it**

```bash
npx tsx --env-file=.env.local scripts/explore-fan-info.ts
```

If `--env-file` isn't supported by your tsx version, use:
```bash
source .env.local && npx tsx scripts/explore-fan-info.ts
```

**Step 3: Document findings**

Save the output shapes and notable fields to `docs/research/fan-info.md`. Key questions to answer:
- What fields does Fan have? (username, id, url, image, etc.)
- How many artists/labels are we following? Does this match expectations?
- What does "following" mean — does it include auto-follows from purchases?
- What genres are we following?
- What does continuation/pagination look like?

**Step 4: Commit**

```bash
git add scripts/explore-fan-info.ts docs/research/fan-info.md
git commit -m "research: explore fan info and following data"
```

---

### Task 3: Explore Collection & Wishlist

See what your purchased music and wishlist look like.

**Files:**
- Create: `scripts/explore-collection.ts`
- Create: `docs/research/collection.md` (findings)

**Step 1: Write the exploration script**

```typescript
// scripts/explore-collection.ts
import bcfetch from 'bandcamp-fetch';

const cookie = process.env.BANDCAMP_COOKIE;
if (!cookie) {
  console.error('Set BANDCAMP_COOKIE in .env.local');
  process.exit(1);
}

bcfetch.setCookie(cookie);

async function main() {
  console.log('=== Collection (first page) ===');
  const collection = await bcfetch.fan.getCollection({});
  console.log(`Items in first page: ${('items' in collection) ? collection.items?.length : 'unknown'}`);
  console.log(JSON.stringify(collection, null, 2));

  console.log('\n=== Wishlist (first page) ===');
  const wishlist = await bcfetch.fan.getWishlist({});
  console.log(JSON.stringify(wishlist, null, 2));
}

main().catch(console.error);
```

**Step 2: Run it**

```bash
npx tsx --env-file=.env.local scripts/explore-collection.ts
```

**Step 3: Document findings**

Save to `docs/research/collection.md`. Key questions:
- What fields does each collection item have? (album URL, artist, tags, purchase date, etc.)
- Are tags included in collection items, or do we need a separate album detail fetch?
- How does pagination work? What does `continuation` look like?
- How many items total in the collection?
- Wishlist: same shape as collection, or different?

**Step 4: Commit**

```bash
git add scripts/explore-collection.ts docs/research/collection.md
git commit -m "research: explore collection and wishlist data"
```

---

### Task 4: Explore Discovery API

See what the Discover page gives us — genres, tags, filtering options, result shapes.

**Files:**
- Create: `scripts/explore-discovery.ts`
- Create: `docs/research/discovery.md` (findings)

**Step 1: Write the exploration script**

```typescript
// scripts/explore-discovery.ts
import bcfetch from 'bandcamp-fetch';

async function main() {
  console.log('=== Discovery Options ===');
  const options = await bcfetch.discovery.getAvailableOptions();
  console.log(JSON.stringify(options, null, 2));

  console.log('\n=== Discover: electronic, sorted by new ===');
  const results = await bcfetch.discovery.discover({
    genre: 'electronic',
    sortBy: 'new',
    size: 5
  });
  console.log(JSON.stringify(results, null, 2));

  console.log('\n=== Discover: custom tags ["deep-house", "jazz"] ===');
  const tagResults = await bcfetch.discovery.discover({
    genre: 'electronic',
    customTags: ['deep-house', 'jazz'],
    size: 5
  });
  console.log(JSON.stringify(tagResults, null, 2));

  console.log('\n=== Related Tags for ["deep-house", "soulful"] ===');
  const related = await bcfetch.tag.getRelated({
    tags: ['deep-house', 'soulful']
  });
  console.log(JSON.stringify(related, null, 2));
}

main().catch(console.error);
```

**Step 2: Run it**

```bash
npx tsx scripts/explore-discovery.ts
```

Note: Discovery doesn't require auth.

**Step 3: Document findings**

Save to `docs/research/discovery.md`. Key questions:
- What genres and subgenres are available?
- What sort options exist? (new, popular, etc.)
- What does a discovery result item look like? (title, artist, tags, image, stream URL?)
- Do discovery results include stream URLs, or do we need a separate album detail fetch?
- How do custom tags work? Can we combine multiple?
- What does continuation look like for paging through results?

**Step 4: Commit**

```bash
git add scripts/explore-discovery.ts docs/research/discovery.md
git commit -m "research: explore discovery and tag APIs"
```

---

### Task 5: Explore Album Detail & Stream URLs

See what a full album detail looks like, including stream URLs for audio preview.

**Files:**
- Create: `scripts/explore-album-detail.ts`
- Create: `docs/research/album-detail.md` (findings)

**Step 1: Write the exploration script**

Use an album URL from your collection (you'll know one from Task 3's output).

```typescript
// scripts/explore-album-detail.ts
import bcfetch from 'bandcamp-fetch';

const cookie = process.env.BANDCAMP_COOKIE;
if (!cookie) {
  console.error('Set BANDCAMP_COOKIE in .env.local');
  process.exit(1);
}

bcfetch.setCookie(cookie);

async function main() {
  // Replace with an actual album URL from your collection
  const albumUrl = process.argv[2];
  if (!albumUrl) {
    console.error('Usage: npx tsx scripts/explore-album-detail.ts <album-url>');
    console.error('Example: npx tsx scripts/explore-album-detail.ts https://artist.bandcamp.com/album/name');
    process.exit(1);
  }

  console.log(`=== Album Detail: ${albumUrl} ===`);
  const album = await bcfetch.album.getInfo({
    albumUrl,
    includeRawData: true
  });
  console.log(JSON.stringify(album, null, 2));

  if (album.tracks && album.tracks.length > 0) {
    const track = album.tracks[0];
    console.log('\n=== First Track Stream Info ===');
    console.log('streamUrl:', track.streamUrl);
    console.log('streamUrlHQ:', (track as any).streamUrlHQ);

    if (track.streamUrl) {
      console.log('\n=== Stream URL Test ===');
      const test = await bcfetch.stream.test(track.streamUrl);
      console.log('Valid:', test.ok, 'Status:', test.status);
    }
  }
}

main().catch(console.error);
```

**Step 2: Run it**

```bash
npx tsx --env-file=.env.local scripts/explore-album-detail.ts "https://someartist.bandcamp.com/album/somealbum"
```

Replace with a real album URL from Task 3.

**Step 3: Document findings**

Save to `docs/research/album-detail.md`. Key questions:
- What metadata fields are available? (title, artist, label, tags, description, release date, etc.)
- Are stream URLs present for all tracks, or only purchased ones?
- What's the difference between `streamUrl` and `streamUrlHQ`?
- What does the raw data contain that the parsed data doesn't?
- Does `stream.test()` work? What about `stream.refresh()`?

**Step 4: Commit**

```bash
git add scripts/explore-album-detail.ts docs/research/album-detail.md
git commit -m "research: explore album detail and stream URLs"
```

---

### Task 6: Investigate Feed Endpoints (The Big Unknown)

`bandcamp-fetch` does NOT expose the social feed. We need to investigate Bandcamp's internal feed endpoints directly. This is the most important research task.

**Files:**
- Create: `scripts/explore-feed.ts`
- Create: `docs/research/feed.md` (findings)

**Step 1: Manual browser investigation**

Before writing code, open Bandcamp in a browser and observe the feed:

1. Go to `https://bandcamp.com/` while logged in
2. Open DevTools → Network tab
3. Look at the feed page and note which API requests fire
4. Look for endpoints like `/api/fan/2/collection_summary`, `/api/fan/2/feed`, or similar
5. Note the request method, headers (especially the cookie), and response shape

Document the endpoints you find.

**Step 2: Write the exploration script**

Based on what you find in Step 1, write a script that hits the feed endpoint directly using fetch. This is a starting template — the actual endpoint and params will depend on what you observe:

```typescript
// scripts/explore-feed.ts
const cookie = process.env.BANDCAMP_COOKIE;
if (!cookie) {
  console.error('Set BANDCAMP_COOKIE in .env.local');
  process.exit(1);
}

async function fetchFeed() {
  // These endpoints are guesses based on community documentation.
  // Adjust based on what you actually see in DevTools.
  const endpoints = [
    'https://bandcamp.com/api/fan/2/collection_summary',
    'https://bandcamp.com/api/fan/1/feed',
  ];

  for (const url of endpoints) {
    console.log(`\n=== Trying: ${url} ===`);
    try {
      const response = await fetch(url, {
        headers: {
          'Cookie': cookie,
          'Accept': 'application/json',
        },
      });
      console.log(`Status: ${response.status}`);
      if (response.ok) {
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
      } else {
        const text = await response.text();
        console.log('Response:', text.substring(0, 500));
      }
    } catch (err) {
      console.error('Error:', err);
    }
  }
}

fetchFeed().catch(console.error);
```

**Step 3: Run it**

```bash
npx tsx --env-file=.env.local scripts/explore-feed.ts
```

**Step 4: Iterate**

This task will likely require multiple iterations:
- Adjust endpoints based on what you find in DevTools
- Try different request bodies (some endpoints may be POST with JSON bodies)
- Try different auth header formats (Cookie vs Bearer token)
- Look at the response shapes, pagination, event types

**Step 5: Document findings**

Save to `docs/research/feed.md`. Key questions:
- What endpoint(s) serve the feed?
- What HTTP method and headers are required?
- What event types appear? (purchases, wishlist adds, new releases, etc.)
- What data is in each event? (album info, fan info, timestamp, etc.)
- How is pagination handled?
- Is there a way to filter by event type?
- How much data comes back per request?

**Step 6: Commit**

```bash
git add scripts/explore-feed.ts docs/research/feed.md
git commit -m "research: investigate Bandcamp feed endpoints"
```

---

### Task 7: Compile Research Summary & Decide Next Steps

Bring all findings together into a single summary that drives the Phase 1 design.

**Files:**
- Create: `docs/research/summary.md`

**Step 1: Write the research summary**

Compile findings from all research tasks into `docs/research/summary.md`:

1. **What bandcamp-fetch gives us** — list each API area and what's useful
2. **What's missing** — feed, anything else we need to build ourselves
3. **Data shapes** — the key entities we've seen and their fields
4. **Gaps and risks** — anything that didn't work, rate limiting observations, auth issues
5. **Recommended feature set for Phase 1** — based on what data is actually available
6. **Recommended data model** — schema proposal based on real data shapes

**Step 2: Review with Tim**

Present the summary. Collaboratively decide:
- What features to build in Phase 1
- What the database schema should look like
- Whether to build a feed wrapper ourselves or pivot to discovery-first

**Step 3: Commit**

```bash
git add docs/research/summary.md
git commit -m "research: compile Phase 0 findings and recommendations"
```

---

## Execution Notes

- **Tasks 2-5 can mostly run independently** but Task 5 needs an album URL from Task 3's output.
- **Task 6 is the riskiest** — it involves reverse-engineering endpoints not covered by bandcamp-fetch. Budget extra time here.
- **Task 7 is a checkpoint** — stop and review with Tim before proceeding to Phase 1.
- **All scripts use `npx tsx`** for running TypeScript directly without a build step.
- **Rate limiting**: use `bcfetch.limiter.*` variants if you hit 429 errors. Start without the limiter; add it if needed.
- **Cookie format**: The Bandcamp cookie value can be obtained from browser DevTools → Application → Cookies → bandcamp.com. Copy the full cookie string.
