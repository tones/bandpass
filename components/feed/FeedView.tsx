'use client';

import { useState, useCallback, useMemo, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { DateRange } from 'react-day-picker';
import type { FeedItem } from '@/lib/bandcamp';
import type { CatalogTrack } from '@/lib/db/catalog';
import { catalogTrackToFeedItem, feedItemToPseudoRelease } from '@/lib/formatters';
import { FeedItemCard } from './FeedItem';
import { DateHeader } from './DateHeader';
import { FilterBar } from './FilterBar';
import type { FeedFilter, BpmRange } from './FilterBar';
import { SyncStatus } from '@/components/SyncStatus';
import { queryFeed } from '@/app/(app)/timeline/actions';
import { useCrateActions } from '@/hooks/useCrateActions';
import { releaseKey } from '@/lib/crate-utils';
import { usePlayer } from '@/contexts/PlayerContext';
import { useNavigation } from '@/contexts/NavigationContext';

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
  initialCrates?: { id: number; name: string }[];
  initialItemCrateMap?: Record<string, number[]>;
  initialAlbumTracksMap?: Record<string, CatalogTrack[]>;
  oldestStoryDate?: number | null;
  exchangeRates?: Record<string, number>;
  initialTag?: string;
  initialType?: string;
  initialFriend?: string;
}

export function FeedView({
  initialItems,
  initialTotalItems,
  initialTags,
  initialFriends,
  initialCrateItemIds = [],
  initialCrates = [],
  initialItemCrateMap = {},
  initialAlbumTracksMap = {},
  oldestStoryDate,
  exchangeRates = {},
  initialTag,
  initialType,
  initialFriend,
}: FeedViewProps) {
  const router = useRouter();
  const { lastTimelinePath } = useNavigation();
  const [items, setItems] = useState<FeedItem[]>(initialItems);
  const [totalItems, setTotalItems] = useState(initialTotalItems);
  const [tags, setTags] = useState(initialTags);
  const [friends, setFriends] = useState(initialFriends);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>(
    (initialType as FeedFilter) ?? 'all'
  );
  const [selectedFriend, setSelectedFriend] = useState<string | null>(initialFriend ?? null);
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag ?? null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [bpmRange, setBpmRange] = useState<BpmRange | null>(null);
  const { crates, crateItemIds, itemCrateMap, toggleCrate, toggleCrateForAlbum, addToCrate, addToCrateForAlbumAction, removeFromCrate } = useCrateActions({
    initialCrateItemIds, initialCrates, initialItemCrateMap,
  });
  const [albumTracksMap, setAlbumTracksMap] = useState<Record<string, CatalogTrack[]>>(initialAlbumTracksMap);
  const { playingTrackUrl, isPlaying: isPlayerPlaying, play: handlePlay, setPlaylist } = usePlayer();
  const [isPending, startTransition] = useTransition();
  const [dynamicOldestDate, setDynamicOldestDate] = useState(oldestStoryDate ?? null);

  const filteredAlbumTracksMap = useMemo(() => {
    if (!bpmRange) return albumTracksMap;
    const out: Record<string, CatalogTrack[]> = {};
    for (const [url, tracks] of Object.entries(albumTracksMap)) {
      const kept = tracks.filter(
        (t) => t.bpm != null && t.bpm >= bpmRange.min && t.bpm <= bpmRange.max,
      );
      if (kept.length > 0) out[url] = kept;
    }
    return out;
  }, [albumTracksMap, bpmRange]);

  useEffect(() => {
    const playlistItems: FeedItem[] = [];
    for (const item of items) {
      const tracks = filteredAlbumTracksMap[item.album.url];
      // The unfiltered map only contains multi-track releases, so any entry
      // here represents an album. When a BPM filter is active the entry may
      // hold a single in-range track; play that rather than the (possibly
      // out-of-range) pinned feed item track.
      if (tracks && tracks.length > 0) {
        const pseudoRelease = feedItemToPseudoRelease(item);
        for (const t of tracks) {
          if (t.streamUrl) playlistItems.push(catalogTrackToFeedItem(t, pseudoRelease));
        }
      } else if (item.track?.streamUrl) {
        playlistItems.push(item);
      }
    }
    setPlaylist(playlistItems);
    return () => setPlaylist([]);
  }, [items, filteredAlbumTracksMap, setPlaylist]);

  useEffect(() => {
    const qs = window.location.search;
    lastTimelinePath.current = `/timeline${qs}`;
  }, [lastTimelinePath]);

  const syncUrl = useCallback(
    (filter: FeedFilter, friend: string | null, tag: string | null) => {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('type', filter);
      if (tag) params.set('tag', tag);
      if (friend) params.set('friend', friend);
      const qs = params.toString();
      const url = qs ? `/timeline?${qs}` : '/timeline';
      router.replace(url, { scroll: false });
      lastTimelinePath.current = url;
    },
    [router, lastTimelinePath],
  );

  const applyFilters = useCallback(
    (
      newFilter: FeedFilter,
      newFriend: string | null,
      newTag: string | null,
      newDateRange: DateRange | undefined,
      newBpmRange: BpmRange | null,
    ) => {
      syncUrl(newFilter, newFriend, newTag);

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
          bpmMin: newBpmRange?.min,
          bpmMax: newBpmRange?.max,
        });
        setItems(result.items);
        setTotalItems(result.totalItems);
        setTags(result.tags);
        setFriends(result.friends);
        setAlbumTracksMap(result.albumTracksMap);
      });
    },
    [syncUrl],
  );

  const handleFeedFilterChange = useCallback(
    (filter: FeedFilter) => {
      setFeedFilter(filter);
      const newFriend = filter === 'friend_purchase' ? selectedFriend : null;
      if (filter !== 'friend_purchase') setSelectedFriend(null);
      applyFilters(filter, newFriend, selectedTag, dateRange, bpmRange);
    },
    [selectedFriend, selectedTag, dateRange, bpmRange, applyFilters],
  );

  const handleFriendChange = useCallback(
    (friend: string | null) => {
      setSelectedFriend(friend);
      applyFilters(feedFilter, friend, selectedTag, dateRange, bpmRange);
    },
    [feedFilter, selectedTag, dateRange, bpmRange, applyFilters],
  );

  const handleTagChange = useCallback(
    (tag: string | null) => {
      setSelectedTag(tag);
      applyFilters(feedFilter, selectedFriend, tag, dateRange, bpmRange);
    },
    [feedFilter, selectedFriend, dateRange, bpmRange, applyFilters],
  );

  const handleDateRangeChange = useCallback(
    (range: DateRange | undefined) => {
      setDateRange(range);
      applyFilters(feedFilter, selectedFriend, selectedTag, range, bpmRange);
    },
    [feedFilter, selectedFriend, selectedTag, bpmRange, applyFilters],
  );

  const handleBpmRangeChange = useCallback(
    (range: BpmRange | null) => {
      setBpmRange(range);
      applyFilters(feedFilter, selectedFriend, selectedTag, dateRange, range);
    },
    [feedFilter, selectedFriend, selectedTag, dateRange, applyFilters],
  );

  const handleSyncComplete = useCallback(() => {
    applyFilters(feedFilter, selectedFriend, selectedTag, dateRange, bpmRange);
  }, [feedFilter, selectedFriend, selectedTag, dateRange, bpmRange, applyFilters]);

  const handleOldestDateChange = useCallback((timestamp: number) => {
    setDynamicOldestDate((prev) => (prev === null || timestamp < prev) ? timestamp : prev);
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
        bpmRange={bpmRange}
        onBpmRangeChange={handleBpmRangeChange}
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
              isInCrate={entry.item.releaseId != null && crateItemIds.has(releaseKey(entry.item.releaseId))}
              isPlaying={isPlayerPlaying && (
                playingTrackUrl === entry.item.track?.streamUrl ||
                (filteredAlbumTracksMap[entry.item.album.url]?.some((t) => t.streamUrl === playingTrackUrl) ?? false)
              )}
              onToggleCrate={() => {
                const album = entry.item.album;
                const artist = entry.item.artist;
                const rk = entry.item.releaseId != null ? releaseKey(entry.item.releaseId) : null;
                toggleCrateForAlbum(rk, {
                  url: album.url,
                  title: album.title,
                  imageUrl: album.imageUrl,
                  artistName: artist.name,
                  artistUrl: artist.url,
                  bandcampId: album.id,
                });
              }}
              onPlay={() => handlePlay(entry.item)}
              exchangeRates={exchangeRates}
              crates={crates}
              itemCrateIds={entry.item.releaseId != null ? itemCrateMap[releaseKey(entry.item.releaseId)] : undefined}
              onAddToCrate={(crateId) => {
                const album = entry.item.album;
                const artist = entry.item.artist;
                const rk = entry.item.releaseId != null ? releaseKey(entry.item.releaseId) : null;
                addToCrateForAlbumAction(rk, {
                  url: album.url,
                  title: album.title,
                  imageUrl: album.imageUrl,
                  artistName: artist.name,
                  artistUrl: artist.url,
                  bandcampId: album.id,
                }, crateId);
              }}
              onRemoveFromCrate={(crateId) => {
                if (entry.item.releaseId != null) {
                  removeFromCrate(releaseKey(entry.item.releaseId), { releaseId: entry.item.releaseId }, crateId);
                }
              }}
              albumTrackContext={filteredAlbumTracksMap[entry.item.album.url] ? {
                tracks: filteredAlbumTracksMap[entry.item.album.url],
                playingTrackUrl,
                isPlayerPlaying,
                itemCrateMap,
                onPlayTrack: (track) => handlePlay(catalogTrackToFeedItem(track, feedItemToPseudoRelease(entry.item))),
                onToggleCrate: toggleCrate,
                onAddToCrate: addToCrate,
                onRemoveFromCrate: removeFromCrate,
              } : undefined}
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
    </div>
  );
}
