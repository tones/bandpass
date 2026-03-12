'use client';

import { useState, useCallback, useTransition } from 'react';
import type { DateRange } from 'react-day-picker';
import type { FeedItem } from '@/lib/bandcamp';
import { FeedItemCard } from './FeedItem';
import { DateHeader } from './DateHeader';
import { FilterBar } from './FilterBar';
import type { FeedFilter } from './FilterBar';
import { WaveformPlayer } from './WaveformPlayer';
import { SyncStatus } from '@/components/SyncStatus';
import { queryFeed } from '@/app/timeline/actions';
import { toggleDefaultCrate, addToCrateAction, removeFromCrateAction } from '@/app/crates/actions';
import type { CrateInfo } from '@/components/TrackActions';
import { useTrackPlayer } from '@/hooks/useTrackPlayer';

type FeedListEntry =
  | { type: 'header'; label: string }
  | { type: 'item'; item: FeedItem };

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
  initialItems: FeedItem[];
  initialTotalItems: number;
  initialTags: { name: string; count: number }[];
  initialFriends: { name: string; username: string; count: number }[];
  initialCrateItemIds?: string[];
  initialCrates?: CrateInfo[];
  initialItemCrateMap?: Record<string, number[]>;
  oldestStoryDate?: number | null;
  exchangeRates?: Record<string, number>;
  initialTag?: string;
}

export function FeedView({
  initialItems,
  initialTotalItems,
  initialTags,
  initialFriends,
  initialCrateItemIds = [],
  initialCrates = [],
  initialItemCrateMap = {},
  oldestStoryDate,
  exchangeRates = {},
  initialTag,
}: FeedViewProps) {
  const [items, setItems] = useState<FeedItem[]>(initialItems);
  const [totalItems, setTotalItems] = useState(initialTotalItems);
  const [tags, setTags] = useState(initialTags);
  const [friends, setFriends] = useState(initialFriends);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag ?? null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [crates] = useState<CrateInfo[]>(initialCrates);
  const [crateItemIds, setCrateItemIds] = useState<Set<string>>(new Set(initialCrateItemIds));
  const [itemCrateMap, setItemCrateMap] = useState<Record<string, number[]>>(initialItemCrateMap);
  const { playingTrackUrl, playingItem, isPlaying: isPlayerPlaying, playerRef, play: handlePlay, setIsPlaying } = useTrackPlayer();
  const [isPending, startTransition] = useTransition();
  const [dynamicOldestDate, setDynamicOldestDate] = useState(oldestStoryDate ?? null);

  const applyFilters = useCallback(
    (
      newFilter: FeedFilter,
      newFriend: string | null,
      newTag: string | null,
      newDateRange: DateRange | undefined,
    ) => {
      const dateFrom = newDateRange?.from
        ? new Date(newDateRange.from.getFullYear(), newDateRange.from.getMonth(), newDateRange.from.getDate()).toISOString()
        : undefined;
      const dateTo = newDateRange?.to
        ? new Date(newDateRange.to.getFullYear(), newDateRange.to.getMonth(), newDateRange.to.getDate() + 1).toISOString()
        : newDateRange?.from
          ? new Date(newDateRange.from.getFullYear(), newDateRange.from.getMonth(), newDateRange.from.getDate() + 1).toISOString()
          : undefined;

      startTransition(async () => {
        const result = await queryFeed({
          storyType: newFilter === 'all' ? undefined : newFilter,
          friendUsername: newFriend ?? undefined,
          tag: newTag ?? undefined,
          dateFrom,
          dateTo,
        });
        setItems(result.items);
        setTotalItems(result.totalItems);
        setTags(result.tags);
        setFriends(result.friends);
      });
    },
    [],
  );

  const handleFeedFilterChange = useCallback(
    (filter: FeedFilter) => {
      setFeedFilter(filter);
      const newFriend = filter === 'friend_purchase' ? selectedFriend : null;
      if (filter !== 'friend_purchase') setSelectedFriend(null);
      applyFilters(filter, newFriend, selectedTag, dateRange);
    },
    [selectedFriend, selectedTag, dateRange, applyFilters],
  );

  const handleFriendChange = useCallback(
    (friend: string | null) => {
      setSelectedFriend(friend);
      applyFilters(feedFilter, friend, selectedTag, dateRange);
    },
    [feedFilter, selectedTag, dateRange, applyFilters],
  );

  const handleTagChange = useCallback(
    (tag: string | null) => {
      setSelectedTag(tag);
      applyFilters(feedFilter, selectedFriend, tag, dateRange);
    },
    [feedFilter, selectedFriend, dateRange, applyFilters],
  );

  const handleDateRangeChange = useCallback(
    (range: DateRange | undefined) => {
      setDateRange(range);
      applyFilters(feedFilter, selectedFriend, selectedTag, range);
    },
    [feedFilter, selectedFriend, selectedTag, applyFilters],
  );

  const handleSyncComplete = useCallback(() => {
    applyFilters(feedFilter, selectedFriend, selectedTag, dateRange);
  }, [feedFilter, selectedFriend, selectedTag, dateRange, applyFilters]);

  const handleOldestDateChange = useCallback((timestamp: number) => {
    setDynamicOldestDate((prev) => (prev === null || timestamp < prev) ? timestamp : prev);
  }, []);

  const toggleCrate = useCallback(async (id: string) => {
    setCrateItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    try {
      await toggleDefaultCrate(id);
    } catch {
      setCrateItemIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  }, []);

  const handleAddToCrate = useCallback(async (itemId: string, crateId: number) => {
    setCrateItemIds((prev) => new Set(prev).add(itemId));
    setItemCrateMap((prev) => ({
      ...prev,
      [itemId]: [...(prev[itemId] ?? []), crateId],
    }));
    try {
      await addToCrateAction(crateId, itemId);
    } catch {
      setItemCrateMap((prev) => {
        const updated = (prev[itemId] ?? []).filter((id) => id !== crateId);
        const next = { ...prev };
        if (updated.length === 0) delete next[itemId];
        else next[itemId] = updated;
        return next;
      });
    }
  }, []);

  const handleRemoveFromCrate = useCallback(async (itemId: string, crateId: number) => {
    setItemCrateMap((prev) => {
      const updated = (prev[itemId] ?? []).filter((id) => id !== crateId);
      const next = { ...prev };
      if (updated.length === 0) {
        delete next[itemId];
        setCrateItemIds((prevIds) => {
          const s = new Set(prevIds);
          s.delete(itemId);
          return s;
        });
      } else {
        next[itemId] = updated;
      }
      return next;
    });
    try {
      await removeFromCrateAction(crateId, itemId);
    } catch {
      setItemCrateMap((prev) => ({
        ...prev,
        [itemId]: [...(prev[itemId] ?? []), crateId],
      }));
    }
  }, []);

  const grouped = groupByDate(items);

  return (
    <div className="pb-24">
      <FilterBar
        feedFilter={feedFilter}
        onFeedFilterChange={handleFeedFilterChange}
        friends={friends}
        selectedFriend={selectedFriend}
        onFriendChange={handleFriendChange}
        tags={tags}
        selectedTag={selectedTag}
        onTagChange={handleTagChange}
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        oldestStoryDate={dynamicOldestDate}
      />
      <div className="flex items-center justify-between px-6 py-2">
        <SyncStatus onSyncComplete={handleSyncComplete} onOldestDateChange={handleOldestDateChange} />
        <span className="ml-auto text-xs text-zinc-600">
          {isPending ? 'Filtering...' : `${items.length} items${totalItems > 0 ? ` of ${totalItems} total` : ''}`}
        </span>
      </div>
      <div>
        {grouped.map((entry) =>
          entry.type === 'header' ? (
            <DateHeader key={`header-${entry.label}`} label={entry.label} />
          ) : (
            <FeedItemCard
              key={entry.item.id}
              item={entry.item}
              isInCrate={crateItemIds.has(entry.item.id)}
              isPlaying={isPlayerPlaying && playingTrackUrl === entry.item.track?.streamUrl}
              onToggleCrate={() => toggleCrate(entry.item.id)}
              onPlay={() => handlePlay(entry.item)}
              exchangeRates={exchangeRates}
              crates={crates}
              itemCrateIds={itemCrateMap[entry.item.id]}
              onAddToCrate={(crateId) => handleAddToCrate(entry.item.id, crateId)}
              onRemoveFromCrate={(crateId) => handleRemoveFromCrate(entry.item.id, crateId)}
            />
          ),
        )}
      </div>
      {items.length === 0 && !isPending && (
        <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
          {totalItems === 0 ? (
            <>
              <p className="text-lg text-zinc-400">Your feed is loading</p>
              <p className="mt-2 text-sm text-zinc-600">Items will appear here as they sync in</p>
            </>
          ) : (
            <p className="text-sm text-zinc-500">No items match your filters.</p>
          )}
        </div>
      )}
      {playingItem && playingTrackUrl && (
        <WaveformPlayer
          ref={playerRef}
          item={playingItem}
          trackUrl={playingTrackUrl}
          isInCrate={crateItemIds.has(playingItem.id)}
          onToggleCrate={() => toggleCrate(playingItem.id)}
          onPlayStateChange={setIsPlaying}
        />
      )}
    </div>
  );
}
