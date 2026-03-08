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
        <div className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-900 px-6 py-3">
          <div className="mx-auto flex max-w-5xl items-center gap-4">
            <img
              src={playingItem.album.imageUrl}
              alt=""
              className="h-12 w-12 rounded"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{playingItem.track?.title}</div>
              <div className="truncate text-xs text-zinc-400">
                {playingItem.artist.name} — {playingItem.album.title}
              </div>
            </div>
            <audio src={playingTrackUrl} autoPlay controls className="h-8 w-64" />
            <a
              href={playingItem.album.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
            >
              Bandcamp ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
