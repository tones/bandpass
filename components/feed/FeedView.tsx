// components/feed/FeedView.tsx
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { DateRange } from 'react-day-picker';
import type { FeedPage, FeedItem, StoryType } from '@/lib/bandcamp';
import { FeedItemCard } from './FeedItem';
import { DateHeader } from './DateHeader';
import { FilterBar } from './FilterBar';
import { WaveformPlayer } from './WaveformPlayer';
import { loadMoreFeed } from '@/app/feed/actions';

type FeedListEntry =
  | { type: 'header'; label: string }
  | { type: 'item'; item: FeedItem };

function getDateRangeBounds(range: DateRange | undefined): { from: Date | null; to: Date | null } {
  if (!range?.from) return { from: null, to: null };
  const from = new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate());
  const to = range.to
    ? new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate() + 1)
    : new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  return { from, to };
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

interface FeedViewProps {
  initialFeed: FeedPage;
}

export function FeedView({ initialFeed }: FeedViewProps) {
  const [items, setItems] = useState<FeedItem[]>(initialFeed.items);
  const [oldestDate, setOldestDate] = useState(initialFeed.oldestStoryDate);
  const [hasMore, setHasMore] = useState(initialFeed.hasMore);
  const [loading, setLoading] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<StoryType>>(new Set());
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [shortlist, setShortlist] = useState<Set<string>>(new Set());
  const [playingTrackUrl, setPlayingTrackUrl] = useState<string | null>(null);
  const [playingItem, setPlayingItem] = useState<FeedItem | null>(null);

  const autoFetchingRef = useRef(false);

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

  const bounds = getDateRangeBounds(dateRange);
  const filtered = items.filter((item) => {
    if (activeFilters.size > 0 && !activeFilters.has(item.storyType)) return false;
    if (bounds.from || bounds.to) {
      const d = new Date(item.date);
      if (bounds.from && d < bounds.from) return false;
      if (bounds.to && d >= bounds.to) return false;
    }
    return true;
  });

  useEffect(() => {
    const MIN_VISIBLE = 10;

    const needsMoreForFilter = filtered.length < MIN_VISIBLE;
    const needsMoreForRange = bounds.from && items.length > 0 &&
      new Date(items[items.length - 1].date) > bounds.from;

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
  }, [filtered.length, hasMore, loading, oldestDate, bounds.from, items]);

  const grouped = groupByDate(filtered);

  return (
    <div className="pb-24">
      <FilterBar
        activeFilters={activeFilters}
        onToggle={toggleFilter}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      />
      <div>
        {grouped.map((entry) =>
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
      </div>
      {hasMore && (
        <div className="flex justify-center py-6">
          {loading ? (
            <span className="text-xs text-zinc-500">
              Loading more... ({items.length} items loaded)
            </span>
          ) : (
            <button
              onClick={loadMore}
              disabled={loading}
              className="rounded-lg bg-zinc-800 px-6 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
            >
              Load more
            </button>
          )}
        </div>
      )}
      {playingItem && playingTrackUrl && (
        <WaveformPlayer item={playingItem} trackUrl={playingTrackUrl} />
      )}
    </div>
  );
}
