# Bandpass MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a working Bandcamp feed viewer with audio playback and shortlisting — the minimum vertical slice that proves the architecture end-to-end.

**Architecture:** Next.js 15 App Router with a custom Bandcamp API client (`lib/bandcamp/`). Server components fetch feed data (keeping the identity cookie server-side). Client components handle audio playback, filtering, and shortlist state. No SQLite caching in this milestone — data fetched live from Bandcamp on each visit. Caching is Phase 2.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, Vitest, React

---

## Milestone Scope

What's IN:
- Bandcamp API client (getFanId, getFeed)
- Feed page showing stories (new releases, friend purchases)
- Feed item cards with album art, metadata, tags, social signal
- Filter bar (story type toggles)
- Persistent bottom audio player
- Local shortlist (client-side state, not persisted to disk yet)
- Link to Bandcamp for each item

What's OUT (Phase 2+):
- SQLite caching
- Discovery/browse endpoint
- Persisted shortlist (saved to disk/DB)
- Collection/wishlist viewing
- Album detail page

---

### Task 1: Scaffold Next.js Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `.gitignore`, `.env.local`

**Step 1: Scaffold**

```bash
npx create-next-app@latest . --typescript --eslint --tailwind --app --src-dir=false --import-alias="@/*" --use-npm --turbopack
```

If the directory is non-empty (because of docs/), either move docs temporarily or use `--yes` flag. The scaffolder may prompt about the existing directory.

**Step 2: Verify it runs**

```bash
npm run dev
```

Visit http://localhost:3000. Confirm Next.js welcome page loads. Stop the server.

**Step 3: Set up env**

Create `.env.local`:
```
BANDCAMP_IDENTITY=<paste identity cookie value here>
```

Verify `.env.local` is in `.gitignore`.

**Step 4: Install test framework**

```bash
npm install -D vitest @vitejs/plugin-react
```

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with Vitest"
```

---

### Task 2: Define Bandcamp API Response Types

These types describe what Bandcamp's endpoints actually return (the "wire format"). Keep them separate from our normalized domain types.

**Files:**
- Create: `lib/bandcamp/types/api.ts`

**Step 1: Write the types**

```typescript
// lib/bandcamp/types/api.ts

// --- Collection Summary (GET /api/fan/2/collection_summary) ---

export interface BandcampCollectionSummary {
  fan_id: number;
  collection_summary: {
    fan_id: number;
    tralbum_lookup: Record<string, unknown>;
    follows: {
      following: Record<string, boolean>;
    };
    url: string;
    username: string;
  };
}

// --- Feed (POST /fan_dash_feed_updates) ---

export interface BandcampFeedResponse {
  ok: boolean;
  stories: {
    entries: BandcampFeedStory[];
    oldest_story_date: number;
    newest_story_date: number;
    track_list: {
      entries: BandcampFeedTrack[];
    };
    feed_timestamp: number | null;
  };
  fan_info: Record<string, BandcampFanInfo>;
  band_info: Record<string, BandcampBandInfo>;
  story_collectors: Record<string, unknown>;
  item_lookup: Record<string, { item_type: 'a' | 't'; purchased: boolean }>;
}

export interface BandcampFeedStory {
  fan_id: number;
  item_id: number;
  item_type: 'a' | 't';
  tralbum_id: number;
  band_id: number;
  story_type: 'nr' | 'fp' | 'np';
  story_date: string;
  item_title: string;
  item_url: string;
  item_art_url: string;
  item_art_id: number;
  band_name: string;
  band_url: string;
  genre_id: number;
  is_purchasable: boolean;
  currency: string;
  price: number;
  album_id: number;
  album_title: string;
  featured_track_title: string;
  featured_track_number: number;
  featured_track_duration: number;
  featured_track_url: string | null;
  also_collected_count: number;
  num_streamable_tracks: number;
  tags: { name: string; norm_name: string }[];
}

export interface BandcampFeedTrack {
  track_id: number;
  title: string;
  artist: string;
  album_id: number;
  album_title: string;
  band_id: number;
  band_name: string;
  band_url: string;
  item_art_id: number;
  duration: number;
  file: Record<string, string>;
  track_number: number;
}

export interface BandcampFanInfo {
  fan_id: number;
  name: string;
  username: string;
  image_id: number;
  trackpipe_url: string;
}

export interface BandcampBandInfo {
  name: string;
  band_id: number;
  image_id: number;
  genre_id: number;
  followed: boolean;
}
```

**Step 2: Commit**

```bash
git add lib/bandcamp/types/api.ts
git commit -m "feat: define Bandcamp API response types"
```

---

### Task 3: Define Normalized Domain Types

These are OUR types — what the UI layer works with. Decoupled from Bandcamp's wire format.

**Files:**
- Create: `lib/bandcamp/types/domain.ts`
- Create: `lib/bandcamp/types/index.ts`

**Step 1: Write domain types**

```typescript
// lib/bandcamp/types/domain.ts

export type StoryType = 'new_release' | 'friend_purchase' | 'also_purchased';

export interface FeedItem {
  id: string;
  storyType: StoryType;
  date: Date;
  album: {
    id: number;
    title: string;
    url: string;
    imageUrl: string;
  };
  artist: {
    id: number;
    name: string;
    url: string;
  };
  track: {
    title: string;
    duration: number;
    streamUrl: string | null;
  } | null;
  tags: string[];
  price: { amount: number; currency: string } | null;
  socialSignal: {
    fan: { name: string; username: string } | null;
    alsoCollectedCount: number;
  };
}

export interface FeedPage {
  items: FeedItem[];
  oldestStoryDate: number;
  newestStoryDate: number;
  hasMore: boolean;
}
```

**Step 2: Write barrel export**

```typescript
// lib/bandcamp/types/index.ts
export * from './api';
export * from './domain';
```

**Step 3: Commit**

```bash
git add lib/bandcamp/types/
git commit -m "feat: define normalized domain types for feed"
```

---

### Task 4: Build the Bandcamp HTTP Client

The core HTTP layer — handles auth and request formatting.

**Files:**
- Create: `lib/bandcamp/client.ts`
- Test: `lib/bandcamp/__tests__/client.test.ts`

**Step 1: Write failing tests**

```typescript
// lib/bandcamp/__tests__/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BandcampClient } from '../client';

describe('BandcampClient', () => {
  let client: BandcampClient;

  beforeEach(() => {
    client = new BandcampClient('test-identity-cookie');
  });

  it('throws if no identity cookie provided', () => {
    expect(() => new BandcampClient('')).toThrow('Identity cookie is required');
  });

  it('sends identity cookie on authenticated GET requests', async () => {
    const mockResponse = { fan_id: 12345, collection_summary: {} };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    await client.get('/api/fan/2/collection_summary');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://bandcamp.com/api/fan/2/collection_summary',
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: 'identity=test-identity-cookie',
        }),
      })
    );

    fetchSpy.mockRestore();
  });

  it('sends form-encoded body on authenticated POST requests', async () => {
    const mockResponse = { ok: true, stories: { entries: [] } };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    await client.postForm('/fan_dash_feed_updates', {
      fan_id: '12345',
      older_than: '1709000000',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://bandcamp.com/fan_dash_feed_updates',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: 'identity=test-identity-cookie',
        }),
      })
    );

    const call = fetchSpy.mock.calls[0];
    const body = (call[1] as RequestInit).body as string;
    expect(body).toContain('fan_id=12345');
    expect(body).toContain('older_than=1709000000');

    fetchSpy.mockRestore();
  });

  it('sends JSON body on POST requests to fancollection endpoints', async () => {
    const mockResponse = { items: [], more_available: false };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    await client.postJson('/api/fancollection/1/collection_items', {
      fan_id: 12345,
      older_than_token: '9999999999:9999999999:a::',
      count: 20,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://bandcamp.com/api/fancollection/1/collection_items',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Cookie: 'identity=test-identity-cookie',
        }),
      })
    );

    fetchSpy.mockRestore();
  });

  it('throws on non-OK responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Forbidden', { status: 403 })
    );

    await expect(client.get('/api/fan/2/collection_summary')).rejects.toThrow(
      'Bandcamp API error: 403'
    );

    vi.restoreAllMocks();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../client'`

**Step 3: Write the implementation**

```typescript
// lib/bandcamp/client.ts

const BASE_URL = 'https://bandcamp.com';

export class BandcampClient {
  private cookie: string;

  constructor(identityCookie: string) {
    if (!identityCookie) {
      throw new Error('Identity cookie is required');
    }
    this.cookie = identityCookie;
  }

  private authHeaders(): Record<string, string> {
    return { Cookie: `identity=${this.cookie}` };
  }

  async get<T = unknown>(path: string): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: this.authHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Bandcamp API error: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  async postForm<T = unknown>(
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const body = new URLSearchParams(params).toString();
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!response.ok) {
      throw new Error(`Bandcamp API error: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  async postJson<T = unknown>(
    path: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Bandcamp API error: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: 4 tests PASS

**Step 5: Commit**

```bash
git add lib/bandcamp/client.ts lib/bandcamp/__tests__/client.test.ts
git commit -m "feat: Bandcamp HTTP client with cookie auth"
```

---

### Task 5: Implement getFanId and getFeed

The two API methods needed for the feed.

**Files:**
- Create: `lib/bandcamp/api.ts`
- Test: `lib/bandcamp/__tests__/api.test.ts`
- Create: `lib/bandcamp/__tests__/fixtures/feed-response.json` (test fixture)

**Step 1: Create a test fixture**

Save a realistic (but fake) feed response to use in tests. This shape is based on our research of the `fan_dash_feed_updates` response:

```json
{
  "ok": true,
  "stories": {
    "entries": [
      {
        "fan_id": 111,
        "item_id": 1001,
        "item_type": "a",
        "tralbum_id": 1001,
        "band_id": 501,
        "story_type": "fp",
        "story_date": "1709500000",
        "item_title": "Midnight Sessions",
        "item_url": "https://kokoroko.bandcamp.com/album/midnight-sessions",
        "item_art_url": "https://f4.bcbits.com/img/a1234567890_10.jpg",
        "item_art_id": 1234567890,
        "band_name": "Kokoroko",
        "band_url": "https://kokoroko.bandcamp.com",
        "genre_id": 15,
        "is_purchasable": true,
        "currency": "USD",
        "price": 10.0,
        "album_id": 1001,
        "album_title": "Midnight Sessions",
        "featured_track_title": "Something Good",
        "featured_track_number": 1,
        "featured_track_duration": 245.5,
        "featured_track_url": null,
        "also_collected_count": 3,
        "num_streamable_tracks": 8,
        "tags": [
          { "name": "jazz", "norm_name": "jazz" },
          { "name": "afrobeat", "norm_name": "afrobeat" }
        ]
      },
      {
        "fan_id": 0,
        "item_id": 1002,
        "item_type": "a",
        "tralbum_id": 1002,
        "band_id": 502,
        "story_type": "nr",
        "story_date": "1709400000",
        "item_title": "Blue Hour",
        "item_url": "https://floatingpoints.bandcamp.com/album/blue-hour",
        "item_art_url": "https://f4.bcbits.com/img/a9876543210_10.jpg",
        "item_art_id": 9876543210,
        "band_name": "Floating Points",
        "band_url": "https://floatingpoints.bandcamp.com",
        "genre_id": 1,
        "is_purchasable": true,
        "currency": "GBP",
        "price": 8.0,
        "album_id": 1002,
        "album_title": "Blue Hour",
        "featured_track_title": "Vocoder",
        "featured_track_number": 3,
        "featured_track_duration": 312.0,
        "featured_track_url": "https://t4.bcbits.com/stream/abc123/mp3-128/999",
        "also_collected_count": 0,
        "num_streamable_tracks": 10,
        "tags": [
          { "name": "electronic", "norm_name": "electronic" },
          { "name": "ambient", "norm_name": "ambient" }
        ]
      }
    ],
    "oldest_story_date": 1709400000,
    "newest_story_date": 1709500000,
    "track_list": {
      "entries": [
        {
          "track_id": 999,
          "title": "Vocoder",
          "artist": "Floating Points",
          "album_id": 1002,
          "album_title": "Blue Hour",
          "band_id": 502,
          "band_name": "Floating Points",
          "band_url": "https://floatingpoints.bandcamp.com",
          "item_art_id": 9876543210,
          "duration": 312.0,
          "file": { "mp3-128": "https://t4.bcbits.com/stream/abc123/mp3-128/999" },
          "track_number": 3
        }
      ]
    },
    "feed_timestamp": 1709500000
  },
  "fan_info": {
    "111": {
      "fan_id": 111,
      "name": "Sarah",
      "username": "sarahmusic",
      "image_id": 7777,
      "trackpipe_url": "https://bandcamp.com/sarahmusic"
    }
  },
  "band_info": {
    "501": { "name": "Kokoroko", "band_id": 501, "image_id": 5001, "genre_id": 15, "followed": true },
    "502": { "name": "Floating Points", "band_id": 502, "image_id": 5002, "genre_id": 1, "followed": true }
  },
  "story_collectors": {},
  "item_lookup": {}
}
```

**Step 2: Write failing tests**

```typescript
// lib/bandcamp/__tests__/api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BandcampAPI } from '../api';
import { BandcampClient } from '../client';
import feedFixture from './fixtures/feed-response.json';

vi.mock('../client');

describe('BandcampAPI', () => {
  let api: BandcampAPI;
  let mockClient: { get: ReturnType<typeof vi.fn>; postForm: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      postForm: vi.fn(),
    };
    vi.mocked(BandcampClient).mockImplementation(() => mockClient as unknown as BandcampClient);
    api = new BandcampAPI('test-cookie');
  });

  describe('getFanId', () => {
    it('returns the fan_id from collection_summary', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      const fanId = await api.getFanId();
      expect(fanId).toBe(12345);
      expect(mockClient.get).toHaveBeenCalledWith('/api/fan/2/collection_summary');
    });
  });

  describe('getFeed', () => {
    it('returns normalized feed items', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postForm.mockResolvedValue(feedFixture);

      const feed = await api.getFeed();

      expect(feed.items).toHaveLength(2);
      expect(feed.oldestStoryDate).toBe(1709400000);
      expect(feed.hasMore).toBe(true);
    });

    it('normalizes story types correctly', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postForm.mockResolvedValue(feedFixture);

      const feed = await api.getFeed();

      expect(feed.items[0].storyType).toBe('friend_purchase');
      expect(feed.items[1].storyType).toBe('new_release');
    });

    it('resolves fan info for friend purchases', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postForm.mockResolvedValue(feedFixture);

      const feed = await api.getFeed();

      expect(feed.items[0].socialSignal.fan).toEqual({
        name: 'Sarah',
        username: 'sarahmusic',
      });
      expect(feed.items[1].socialSignal.fan).toBeNull();
    });

    it('resolves stream URLs from track_list', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postForm.mockResolvedValue(feedFixture);

      const feed = await api.getFeed();

      expect(feed.items[1].track?.streamUrl).toBe(
        'https://t4.bcbits.com/stream/abc123/mp3-128/999'
      );
    });

    it('passes older_than for pagination', async () => {
      mockClient.get.mockResolvedValue({ fan_id: 12345 });
      mockClient.postForm.mockResolvedValue(feedFixture);

      await api.getFeed({ olderThan: 1709000000 });

      expect(mockClient.postForm).toHaveBeenCalledWith(
        '/fan_dash_feed_updates',
        { fan_id: '12345', older_than: '1709000000' },
      );
    });
  });
});
```

**Step 3: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../api'`

**Step 4: Write the implementation**

```typescript
// lib/bandcamp/api.ts
import { BandcampClient } from './client';
import type {
  BandcampCollectionSummary,
  BandcampFeedResponse,
  BandcampFeedStory,
  BandcampFanInfo,
} from './types/api';
import type { FeedItem, FeedPage, StoryType } from './types/domain';

const STORY_TYPE_MAP: Record<string, StoryType> = {
  nr: 'new_release',
  fp: 'friend_purchase',
  np: 'also_purchased',
};

export class BandcampAPI {
  private client: BandcampClient;
  private fanIdCache: number | null = null;

  constructor(identityCookie: string) {
    this.client = new BandcampClient(identityCookie);
  }

  async getFanId(): Promise<number> {
    if (this.fanIdCache) return this.fanIdCache;
    const summary = await this.client.get<BandcampCollectionSummary>(
      '/api/fan/2/collection_summary',
    );
    this.fanIdCache = summary.fan_id;
    return summary.fan_id;
  }

  async getFeed(options?: { olderThan?: number }): Promise<FeedPage> {
    const fanId = await this.getFanId();
    const olderThan = options?.olderThan ?? Math.floor(Date.now() / 1000);

    const raw = await this.client.postForm<BandcampFeedResponse>(
      '/fan_dash_feed_updates',
      {
        fan_id: String(fanId),
        older_than: String(olderThan),
      },
    );

    const trackStreamUrls = new Map<number, string>();
    if (raw.stories.track_list?.entries) {
      for (const t of raw.stories.track_list.entries) {
        const url = t.file?.['mp3-128'];
        if (url) trackStreamUrls.set(t.track_id, url);
      }
    }

    const items = raw.stories.entries.map((story) =>
      this.normalizeStory(story, raw.fan_info, trackStreamUrls),
    );

    return {
      items,
      oldestStoryDate: raw.stories.oldest_story_date,
      newestStoryDate: raw.stories.newest_story_date,
      hasMore: items.length > 0,
    };
  }

  private normalizeStory(
    story: BandcampFeedStory,
    fanInfo: Record<string, BandcampFanInfo>,
    trackStreamUrls: Map<number, string>,
  ): FeedItem {
    const fan = story.fan_id && fanInfo[String(story.fan_id)];

    let streamUrl = story.featured_track_url;
    if (!streamUrl && story.tralbum_id) {
      streamUrl = trackStreamUrls.get(story.tralbum_id) ?? null;
    }

    return {
      id: `${story.story_type}-${story.tralbum_id}-${story.fan_id}-${story.story_date}`,
      storyType: STORY_TYPE_MAP[story.story_type] ?? 'also_purchased',
      date: new Date(Number(story.story_date) * 1000),
      album: {
        id: story.album_id,
        title: story.album_title || story.item_title,
        url: story.item_url,
        imageUrl: story.item_art_url,
      },
      artist: {
        id: story.band_id,
        name: story.band_name,
        url: story.band_url,
      },
      track: story.featured_track_title
        ? {
            title: story.featured_track_title,
            duration: story.featured_track_duration,
            streamUrl,
          }
        : null,
      tags: story.tags?.map((t) => t.name) ?? [],
      price: story.is_purchasable
        ? { amount: story.price, currency: story.currency }
        : null,
      socialSignal: {
        fan: fan ? { name: fan.name, username: fan.username } : null,
        alsoCollectedCount: story.also_collected_count,
      },
    };
  }
}
```

**Step 5: Run tests to verify they pass**

```bash
npm test
```

Expected: all tests PASS

**Step 6: Commit**

```bash
git add lib/bandcamp/api.ts lib/bandcamp/__tests__/api.test.ts lib/bandcamp/__tests__/fixtures/
git commit -m "feat: BandcampAPI with getFanId and getFeed"
```

---

### Task 6: Create the Data Service (Server-Side Entry Point)

A singleton that Next.js server components use to get feed data.

**Files:**
- Create: `lib/bandcamp/index.ts`
- Create: `lib/bandcamp/service.ts`

**Step 1: Write the service**

```typescript
// lib/bandcamp/service.ts
import { BandcampAPI } from './api';

let instance: BandcampAPI | null = null;

export function getBandcamp(): BandcampAPI {
  if (!instance) {
    const cookie = process.env.BANDCAMP_IDENTITY;
    if (!cookie) {
      throw new Error(
        'BANDCAMP_IDENTITY environment variable is not set. ' +
        'Copy your identity cookie from Bandcamp DevTools into .env.local',
      );
    }
    instance = new BandcampAPI(cookie);
  }
  return instance;
}
```

```typescript
// lib/bandcamp/index.ts
export { getBandcamp } from './service';
export { BandcampAPI } from './api';
export type * from './types/domain';
```

**Step 2: Commit**

```bash
git add lib/bandcamp/service.ts lib/bandcamp/index.ts
git commit -m "feat: Bandcamp data service singleton"
```

---

### Task 7: Build the Feed Page (Server Component)

The main page — fetches feed data server-side and renders it.

**Files:**
- Modify: `app/page.tsx`
- Create: `app/feed/actions.ts` (server action for pagination)

**Step 1: Replace the default page**

```typescript
// app/page.tsx
import { getBandcamp } from '@/lib/bandcamp';
import { FeedView } from '@/components/feed/FeedView';

export default async function Home() {
  const bandcamp = getBandcamp();

  let feed;
  let error: string | null = null;

  try {
    feed = await bandcamp.getFeed();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load feed';
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">Bandpass</h1>
      </header>
      {error ? (
        <div className="p-6 text-red-400">{error}</div>
      ) : feed ? (
        <FeedView initialFeed={feed} />
      ) : null}
    </main>
  );
}
```

**Step 2: Create the server action for loading more**

```typescript
// app/feed/actions.ts
'use server';

import { getBandcamp } from '@/lib/bandcamp';
import type { FeedPage } from '@/lib/bandcamp';

export async function loadMoreFeed(olderThan: number): Promise<FeedPage> {
  const bandcamp = getBandcamp();
  return bandcamp.getFeed({ olderThan });
}
```

**Step 3: Commit**

```bash
git add app/page.tsx app/feed/actions.ts
git commit -m "feat: feed page with server-side data fetching"
```

---

### Task 8: Build the Feed UI Components

The feed list, individual feed items, and filter bar.

**Files:**
- Create: `components/feed/FeedView.tsx`
- Create: `components/feed/FeedItem.tsx`
- Create: `components/feed/FilterBar.tsx`

**Step 1: FeedView (client component — manages state, filtering, pagination)**

```tsx
// components/feed/FeedView.tsx
'use client';

import { useState, useCallback } from 'react';
import type { FeedPage, FeedItem, StoryType } from '@/lib/bandcamp';
import { FeedItemCard } from './FeedItem';
import { FilterBar } from './FilterBar';
import { loadMoreFeed } from '@/app/feed/actions';

interface FeedViewProps {
  initialFeed: FeedPage;
}

export function FeedView({ initialFeed }: FeedViewProps) {
  const [items, setItems] = useState<FeedItem[]>(initialFeed.items);
  const [oldestDate, setOldestDate] = useState(initialFeed.oldestStoryDate);
  const [hasMore, setHasMore] = useState(initialFeed.hasMore);
  const [loading, setLoading] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<StoryType>>(new Set());
  const [shortlist, setShortlist] = useState<Set<string>>(new Set());
  const [playingTrackUrl, setPlayingTrackUrl] = useState<string | null>(null);
  const [playingItem, setPlayingItem] = useState<FeedItem | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const next = await loadMoreFeed(oldestDate);
      setItems((prev) => [...prev, ...next.items]);
      setOldestDate(next.oldestStoryDate);
      setHasMore(next.hasMore);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, oldestDate]);

  const toggleFilter = useCallback((type: StoryType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const toggleShortlist = useCallback((id: string) => {
    setShortlist((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handlePlay = useCallback((item: FeedItem) => {
    if (item.track?.streamUrl) {
      setPlayingTrackUrl(item.track.streamUrl);
      setPlayingItem(item);
    }
  }, []);

  const filtered = activeFilters.size === 0
    ? items
    : items.filter((item) => activeFilters.has(item.storyType));

  return (
    <div className="pb-24">
      <FilterBar activeFilters={activeFilters} onToggle={toggleFilter} />
      <div className="divide-y divide-zinc-800/50">
        {filtered.map((item) => (
          <FeedItemCard
            key={item.id}
            item={item}
            isShortlisted={shortlist.has(item.id)}
            isPlaying={playingTrackUrl === item.track?.streamUrl}
            onToggleShortlist={() => toggleShortlist(item.id)}
            onPlay={() => handlePlay(item)}
          />
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center py-6">
          <button
            onClick={loadMore}
            disabled={loading}
            className="rounded-lg bg-zinc-800 px-6 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
      {playingItem && playingTrackUrl && (
        <AudioPlayer item={playingItem} streamUrl={playingTrackUrl} />
      )}
    </div>
  );
}

function AudioPlayer({ item, streamUrl }: { item: FeedItem; streamUrl: string }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-900 px-6 py-3">
      <div className="mx-auto flex max-w-5xl items-center gap-4">
        <img
          src={item.album.imageUrl}
          alt=""
          className="h-12 w-12 rounded"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item.track?.title}</div>
          <div className="truncate text-xs text-zinc-400">
            {item.artist.name} — {item.album.title}
          </div>
        </div>
        <audio src={streamUrl} autoPlay controls className="h-8 w-64" />
        <a
          href={item.album.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
        >
          Bandcamp ↗
        </a>
      </div>
    </div>
  );
}
```

**Step 2: FeedItem card**

```tsx
// components/feed/FeedItem.tsx
import type { FeedItem } from '@/lib/bandcamp';

interface FeedItemCardProps {
  item: FeedItem;
  isShortlisted: boolean;
  isPlaying: boolean;
  onToggleShortlist: () => void;
  onPlay: () => void;
}

const STORY_LABELS: Record<string, string> = {
  friend_purchase: 'Friend purchased',
  new_release: 'New release',
  also_purchased: 'Also purchased',
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function FeedItemCard({
  item,
  isShortlisted,
  isPlaying,
  onToggleShortlist,
  onPlay,
}: FeedItemCardProps) {
  const signal = item.socialSignal;
  const signalText = signal.fan
    ? signal.alsoCollectedCount > 0
      ? `${signal.fan.name} and ${signal.alsoCollectedCount} others`
      : signal.fan.name
    : signal.alsoCollectedCount > 0
      ? `${signal.alsoCollectedCount} collectors`
      : null;

  return (
    <div
      className={`flex items-center gap-4 px-6 py-3 transition-colors hover:bg-zinc-900/50 ${
        isPlaying ? 'bg-zinc-900/80' : ''
      }`}
    >
      {/* Album art + play button */}
      <button
        onClick={onPlay}
        disabled={!item.track?.streamUrl}
        className="group relative h-16 w-16 shrink-0 overflow-hidden rounded"
      >
        <img src={item.album.imageUrl} alt="" className="h-full w-full object-cover" />
        {item.track?.streamUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="text-xl">{isPlaying ? '⏸' : '▶'}</span>
          </div>
        )}
      </button>

      {/* Metadata */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium">{item.album.title}</span>
          <span className="shrink-0 text-xs text-zinc-500">
            {STORY_LABELS[item.storyType]}
          </span>
        </div>
        <div className="truncate text-sm text-zinc-400">
          {item.artist.name}
          {item.track && (
            <span className="text-zinc-600">
              {' · '}{item.track.title} ({formatDuration(item.track.duration)})
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-1.5">
          {item.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
              {tag}
            </span>
          ))}
          {signalText && (
            <span className="text-xs text-amber-500/80">{signalText}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        {item.price && (
          <span className="text-xs text-zinc-500">
            {item.price.currency === 'USD' ? '$' : item.price.currency}{' '}
            {item.price.amount}
          </span>
        )}
        <button
          onClick={onToggleShortlist}
          className={`rounded p-1.5 text-lg transition-colors ${
            isShortlisted
              ? 'text-rose-400 hover:text-rose-300'
              : 'text-zinc-600 hover:text-zinc-400'
          }`}
          title={isShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
        >
          {isShortlisted ? '♥' : '♡'}
        </button>
        <a
          href={item.album.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded p-1.5 text-sm text-zinc-600 hover:text-zinc-400"
          title="Open on Bandcamp"
        >
          ↗
        </a>
      </div>
    </div>
  );
}
```

**Step 3: FilterBar**

```tsx
// components/feed/FilterBar.tsx
import type { StoryType } from '@/lib/bandcamp';

interface FilterBarProps {
  activeFilters: Set<StoryType>;
  onToggle: (type: StoryType) => void;
}

const FILTERS: { type: StoryType; label: string }[] = [
  { type: 'friend_purchase', label: 'Friends' },
  { type: 'new_release', label: 'New Releases' },
  { type: 'also_purchased', label: 'Also Purchased' },
];

export function FilterBar({ activeFilters, onToggle }: FilterBarProps) {
  return (
    <div className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 px-6 py-3 backdrop-blur">
      <div className="flex gap-2">
        {FILTERS.map(({ type, label }) => {
          const active = activeFilters.has(type);
          return (
            <button
              key={type}
              onClick={() => onToggle(type)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                active
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          );
        })}
        {activeFilters.size > 0 && (
          <button
            onClick={() => activeFilters.forEach((t) => onToggle(t))}
            className="px-2 text-xs text-zinc-500 hover:text-zinc-400"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add components/
git commit -m "feat: feed UI with filtering, shortlist, and audio player"
```

---

### Task 9: Update Layout and Smoke Test

Clean up the layout and verify the full stack works.

**Files:**
- Modify: `app/layout.tsx`

**Step 1: Update the layout**

Replace the default layout with a clean dark theme:

```tsx
// app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Bandpass',
  description: 'Bandcamp discovery, filtered',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
```

**Step 2: Verify globals.css has Tailwind directives**

Ensure `app/globals.css` starts with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Remove any default Next.js styling below the directives.

**Step 3: Smoke test**

1. Paste your Bandcamp `identity` cookie value into `.env.local`:
   ```
   BANDCAMP_IDENTITY=<your cookie value>
   ```

2. Run:
   ```bash
   npm run dev
   ```

3. Visit http://localhost:3000
4. Verify: feed items appear, filter buttons work, clicking an album art plays audio, heart button toggles, Bandcamp link opens

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: complete MVP feed viewer with audio playback"
```

---

## What's Next (Phase 2)

After this milestone is working end-to-end:

1. **SQLite caching** — cache feed responses so the app loads instantly and refreshes in the background
2. **Discovery endpoint** — add `discover()` to the API client and a discovery filter to the unified browse view
3. **Persisted shortlist** — save shortlisted items to SQLite with notes
4. **Album detail** — click an album to see full track listing and play individual tracks
5. **Social graph** — surface which friends have the most taste overlap
6. **Better audio player** — seek bar, queue management, keyboard shortcuts
