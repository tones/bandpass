# Feed Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the feed denser, time-aware, and filterable by date — load more items upfront, show timestamps and date section headers, add time range presets, and auto-fetch when filters yield few results.

**Architecture:** All changes are in the existing Next.js app. The `BandcampAPI.getFeed()` method already supports pagination via `olderThan`. We add a multi-page loading helper, surface dates in the UI, group items by date, and add a time range filter alongside the existing story type filters. Auto-fetch logic lives in `FeedView` — when active filters produce fewer than 10 visible items and more data is available, it loads another page automatically.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, Vitest, React

---

## Milestone Scope

What's IN:
- Load 5 pages (~100 items) on initial server-side render
- Show relative/absolute timestamps on each feed item
- Date section headers grouping items ("Today", "Yesterday", "March 5", "February", etc.)
- Time range preset filter (Last 7 days, Last 30 days, Last 90 days, All)
- Auto-fetch when active filters yield fewer than 10 visible items
- Progress indicator during background loading

What's OUT:
- Full calendar date picker (future enhancement)
- Filter counts next to filter buttons
- Infinite scroll (keeping explicit "Load more" for now)

---

### Task 1: Multi-Page Initial Load

Load ~100 items server-side instead of 20, so filters have enough data to work with on first render.

**Files:**
- Modify: `lib/bandcamp/api.ts`
- Modify: `lib/bandcamp/__tests__/api.test.ts`
- Modify: `app/page.tsx`

**Step 1: Write failing test for `getFeedPages`**

Add to `lib/bandcamp/__tests__/api.test.ts`:

```typescript
describe('getFeedPages', () => {
  it('fetches multiple pages and concatenates items', async () => {
    mockClient.get.mockResolvedValue({ fan_id: 12345 });
    mockClient.postForm
      .mockResolvedValueOnce(feedFixture)
      .mockResolvedValueOnce(feedFixture);

    const feed = await api.getFeedPages({ pages: 2 });

    expect(feed.items).toHaveLength(4);
    expect(mockClient.postForm).toHaveBeenCalledTimes(2);
  });

  it('stops early when a page returns no items', async () => {
    mockClient.get.mockResolvedValue({ fan_id: 12345 });
    mockClient.postForm
      .mockResolvedValueOnce(feedFixture)
      .mockResolvedValueOnce({
        stories: { entries: [], track_list: [], oldest_story_date: 0, newest_story_date: 0 },
        fan_info: {},
        band_info: {},
      });

    const feed = await api.getFeedPages({ pages: 5 });

    expect(feed.items).toHaveLength(2);
    expect(feed.hasMore).toBe(false);
    expect(mockClient.postForm).toHaveBeenCalledTimes(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run lib/bandcamp/__tests__/api.test.ts`
Expected: FAIL — `api.getFeedPages is not a function`

**Step 3: Implement `getFeedPages`**

Add to `lib/bandcamp/api.ts`, in the `BandcampAPI` class:

```typescript
async getFeedPages(options?: { pages?: number; olderThan?: number }): Promise<FeedPage> {
  const pageCount = options?.pages ?? 1;
  let olderThan = options?.olderThan;
  const allItems: FeedItem[] = [];
  let newestStoryDate = 0;
  let oldestStoryDate = 0;
  let hasMore = true;

  for (let i = 0; i < pageCount; i++) {
    const page = await this.getFeed({ olderThan });
    allItems.push(...page.items);
    if (i === 0) newestStoryDate = page.newestStoryDate;
    oldestStoryDate = page.oldestStoryDate;

    if (!page.hasMore) {
      hasMore = false;
      break;
    }
    olderThan = page.oldestStoryDate;
  }

  return { items: allItems, oldestStoryDate, newestStoryDate, hasMore };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/bandcamp/__tests__/api.test.ts`
Expected: PASS

**Step 5: Update `app/page.tsx` to use `getFeedPages`**

Change the `getFeed()` call in `app/page.tsx`:

```typescript
feed = await bandcamp.getFeedPages({ pages: 5 });
```

**Step 6: Commit**

```bash
git add lib/bandcamp/api.ts lib/bandcamp/__tests__/api.test.ts app/page.tsx
git commit -m "feat: load 5 pages (~100 items) on initial render"
```

---

### Task 2: Show Timestamps on Feed Items

Display relative dates for recent items ("2h ago", "yesterday") and absolute dates for older items ("Mar 5", "Feb 14").

**Files:**
- Modify: `components/feed/FeedItem.tsx`

**Step 1: Add `formatRelativeDate` and display it**

Add a date formatting function to `components/feed/FeedItem.tsx` and render it in the card. The function should return:
- "Xm ago" for < 1 hour
- "Xh ago" for < 24 hours
- "yesterday" for 24-48 hours
- "Mon Mar 5" for items within the current year
- "Mon Mar 5, 2025" for items from a different year

```typescript
function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 2) return 'yesterday';

  const day = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (date.getFullYear() !== now.getFullYear()) {
    return `${day}, ${date.getFullYear()}`;
  }
  return day;
}
```

Render it in the item card, next to the story type label:

```tsx
<span className="shrink-0 text-xs text-zinc-600">
  {formatRelativeDate(new Date(item.date))}
</span>
```

Note: `item.date` is serialized as a string when passed from server to client components (Next.js JSON serialization), so wrap it in `new Date()`.

**Step 2: Verify visually**

Run: `npm run dev`, visit http://localhost:3000
Expected: Each feed item shows a relative timestamp (e.g., "3h ago", "Mon Mar 5") near the story type label.

**Step 3: Commit**

```bash
git add components/feed/FeedItem.tsx
git commit -m "feat: show relative timestamps on feed items"
```

---

### Task 3: Date Section Headers

Group feed items by date and insert visual section headers between groups.

**Files:**
- Create: `components/feed/DateHeader.tsx`
- Modify: `components/feed/FeedView.tsx`

**Step 1: Create `DateHeader` component**

Create `components/feed/DateHeader.tsx`:

```tsx
interface DateHeaderProps {
  label: string;
}

export function DateHeader({ label }: DateHeaderProps) {
  return (
    <div className="sticky top-12 z-[5] border-b border-zinc-800/50 bg-zinc-950/90 px-6 py-2 backdrop-blur">
      <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </span>
    </div>
  );
}
```

Note: `top-12` accounts for the FilterBar which is `sticky top-0`. Adjust if FilterBar height changes.

**Step 2: Add date grouping logic to `FeedView`**

Add a helper function that takes a sorted (newest-first) list of `FeedItem`s and returns a list of `{ type: 'header', label } | { type: 'item', item }` entries:

```typescript
type FeedListEntry =
  | { type: 'header'; label: string }
  | { type: 'item'; item: FeedItem };

function groupByDate(items: FeedItem[]): FeedListEntry[] {
  const result: FeedListEntry[] = [];
  let lastLabel = '';

  for (const item of items) {
    const label = dateSectionLabel(new Date(item.date));
    if (label !== lastLabel) {
      result.push({ type: 'header', label });
      lastLabel = label;
    }
    result.push({ type: 'item', item });
  }
  return result;
}

function dateSectionLabel(date: Date): string {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateStart >= todayStart) return 'Today';
  if (dateStart >= yesterdayStart) return 'Yesterday';

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
```

**Step 3: Update `FeedView` render to use grouped entries**

Replace the existing `filtered.map(...)` with the grouped rendering:

```tsx
const grouped = groupByDate(filtered);

{grouped.map((entry, i) =>
  entry.type === 'header' ? (
    <DateHeader key={`header-${entry.label}`} label={entry.label} />
  ) : (
    <FeedItemCard
      key={entry.item.id}
      item={entry.item}
      isShortlisted={shortlist.has(entry.item.id)}
      isPlaying={playingTrackUrl === entry.item.track?.streamUrl}
      onToggleShortlist={() => toggleShortlist(entry.item.id)}
      onPlay={() => handlePlay(entry.item)}
    />
  ),
)}
```

**Step 4: Verify visually**

Run: `npm run dev`, visit http://localhost:3000
Expected: Feed items are grouped under date section headers like "Today", "Yesterday", "Wednesday, March 5".

**Step 5: Commit**

```bash
git add components/feed/DateHeader.tsx components/feed/FeedView.tsx
git commit -m "feat: add date section headers to group feed items"
```

---

### Task 4: Time Range Preset Filter

Add preset time range buttons (Last 7 days, Last 30 days, Last 90 days, All) to the filter bar.

**Files:**
- Modify: `components/feed/FilterBar.tsx`
- Modify: `components/feed/FeedView.tsx`

**Step 1: Define time range type and presets**

Add to `FilterBar.tsx`:

```typescript
export type TimeRange = '7d' | '30d' | '90d' | 'all';

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All' },
];
```

**Step 2: Update `FilterBar` to accept and render time range**

Update the `FilterBarProps` interface:

```typescript
interface FilterBarProps {
  activeFilters: Set<StoryType>;
  onToggle: (type: StoryType) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}
```

Add a time range selector section in the filter bar, visually separated from the story type buttons:

```tsx
<div className="flex items-center gap-3 border-l border-zinc-800 pl-3 ml-3">
  <select
    value={timeRange}
    onChange={(e) => onTimeRangeChange(e.target.value as TimeRange)}
    className="rounded bg-zinc-800/50 px-2 py-1 text-sm text-zinc-400 outline-none hover:bg-zinc-800"
  >
    {TIME_RANGES.map(({ value, label }) => (
      <option key={value} value={value}>{label}</option>
    ))}
  </select>
</div>
```

**Step 3: Add time range state and filtering to `FeedView`**

In `FeedView.tsx`:

```typescript
import type { TimeRange } from './FilterBar';

const [timeRange, setTimeRange] = useState<TimeRange>('all');
```

Add a `timeRangeCutoff` computed value:

```typescript
function getTimeRangeCutoff(range: TimeRange): Date | null {
  if (range === 'all') return null;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return new Date(Date.now() - days * 86400000);
}
```

Update the filtering logic to apply both story type and time range:

```typescript
const cutoff = getTimeRangeCutoff(timeRange);
const filtered = items.filter((item) => {
  if (activeFilters.size > 0 && !activeFilters.has(item.storyType)) return false;
  if (cutoff && new Date(item.date) < cutoff) return false;
  return true;
});
```

Pass the new props to `FilterBar`:

```tsx
<FilterBar
  activeFilters={activeFilters}
  onToggle={toggleFilter}
  timeRange={timeRange}
  onTimeRangeChange={setTimeRange}
/>
```

**Step 4: Verify visually**

Run: `npm run dev`, visit http://localhost:3000
Expected: A dropdown appears next to the story type filters. Selecting "Last 7 days" filters out older items.

**Step 5: Commit**

```bash
git add components/feed/FilterBar.tsx components/feed/FeedView.tsx
git commit -m "feat: add time range preset filter (7d/30d/90d/all)"
```

---

### Task 5: Auto-Fetch When Filters Yield Few Results

When the active filters produce fewer than 10 visible items and more data is available, automatically load another page in the background.

**Files:**
- Modify: `components/feed/FeedView.tsx`

**Step 1: Add auto-fetch effect**

Add a `useEffect` to `FeedView` that watches the filtered item count:

```typescript
import { useState, useCallback, useEffect, useRef } from 'react';

const autoFetchingRef = useRef(false);

useEffect(() => {
  const MIN_VISIBLE = 10;
  if (filtered.length >= MIN_VISIBLE || !hasMore || loading || autoFetchingRef.current) return;

  autoFetchingRef.current = true;
  setLoading(true);

  loadMoreFeed(oldestDate).then((next) => {
    setItems((prev) => [...prev, ...next.items]);
    setOldestDate(next.oldestStoryDate);
    setHasMore(next.hasMore);
    setLoading(false);
    autoFetchingRef.current = false;
  }).catch(() => {
    setLoading(false);
    autoFetchingRef.current = false;
  });
}, [filtered.length, hasMore, loading, oldestDate]);
```

This will trigger automatically when filters narrow results below 10 items, loading one more page at a time until enough items match or the feed is exhausted.

**Step 2: Add loading progress indicator**

Replace the simple "Loading..." text in the load more button area with a progress bar or message showing how many items are loaded:

```tsx
{loading && (
  <div className="py-3 text-center text-xs text-zinc-500">
    Loading more... ({items.length} items loaded)
  </div>
)}
```

**Step 3: Verify behavior**

Run: `npm run dev`, visit http://localhost:3000
Expected: Click "New Releases" when there are few/no results — the app automatically loads more pages until new releases appear or the feed is exhausted. A progress indicator shows during loading.

**Step 4: Commit**

```bash
git add components/feed/FeedView.tsx
git commit -m "feat: auto-fetch more items when filters yield few results"
```

---

### Task 6: Background Loading for Time Range Changes

When the user selects a time range that extends beyond loaded data (e.g., "Last 30 days" but only 7 days loaded), trigger background loading until the range is covered.

**Files:**
- Modify: `components/feed/FeedView.tsx`

**Step 1: Add time-range-aware auto-fetch**

Extend the auto-fetch effect from Task 5 to also check whether the loaded data covers the selected time range. The oldest loaded item's date should be compared against the time range cutoff:

```typescript
useEffect(() => {
  const MIN_VISIBLE = 10;
  const cutoff = getTimeRangeCutoff(timeRange);

  const needsMoreForFilter = filtered.length < MIN_VISIBLE;
  const needsMoreForRange = cutoff && items.length > 0 &&
    new Date(items[items.length - 1].date) > cutoff;
  
  if ((!needsMoreForFilter && !needsMoreForRange) || !hasMore || loading || autoFetchingRef.current) return;

  autoFetchingRef.current = true;
  setLoading(true);

  loadMoreFeed(oldestDate).then((next) => {
    setItems((prev) => [...prev, ...next.items]);
    setOldestDate(next.oldestStoryDate);
    setHasMore(next.hasMore);
    setLoading(false);
    autoFetchingRef.current = false;
  }).catch(() => {
    setLoading(false);
    autoFetchingRef.current = false;
  });
}, [filtered.length, hasMore, loading, oldestDate, timeRange, items]);
```

This replaces the effect from Task 5 — it handles both the "too few visible items" case and the "time range not fully loaded" case.

**Step 2: Verify behavior**

Run: `npm run dev`, visit http://localhost:3000
Expected: Selecting "Last 30 days" triggers background loading until ~30 days of data is loaded. Progress shows in the loading indicator.

**Step 3: Commit**

```bash
git add components/feed/FeedView.tsx
git commit -m "feat: auto-fetch to cover selected time range"
```
