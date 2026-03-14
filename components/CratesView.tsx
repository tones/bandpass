'use client';

import { useState, useCallback, useTransition, useRef, useEffect, useMemo } from 'react';
import type { FeedItem, WishlistItem } from '@/lib/bandcamp/types/domain';
import type { Crate, CrateCatalogItem, CrateReleaseItem, WishlistAlbumData } from '@/lib/db/crates';
import type { CatalogTrack } from '@/lib/db/catalog';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FeedItemCard } from './feed/FeedItem';
import { usePlayer } from '@/contexts/PlayerContext';
import { TrackActions } from './TrackActions';
import type { CrateInfo } from './TrackActions';
import { AlbumCard } from '@/components/AlbumCard';
import { TagPill } from '@/components/TagPill';
import { BpmKeyBadge } from '@/components/BpmKeyBadge';
import { catalogTrackToFeedItem, catalogItemToFeedItem, wishlistItemToFeedItem, crateReleaseToRelease } from '@/lib/formatters';
import { extractSlug, getDomainIfDifferent } from '@/lib/bandcamp/scraper';
import {
  removeFromCrateAction,
  addToCrateAction,
  clearCrateAction,
  createCrateAction,
  renameCrateAction,
  deleteCrateAction,
  getCrateItemsAction,
  getWishlistItemsAction,
  getCratesAction,
  getItemCrateMultiMapAction,
  refreshWishlistAction,
} from '@/app/crates/actions';

interface CratesViewProps {
  crates: Crate[];
  initialCrateId: number | null;
  initialItems: FeedItem[];
  initialCatalogItems: CrateCatalogItem[];
  initialReleaseItems?: CrateReleaseItem[];
  initialWishlistItems: WishlistItem[];
  initialAlbumTracks?: Record<string, WishlistAlbumData>;
  exchangeRates?: Record<string, number>;
  initialItemCrateMap?: Record<string, number[]>;
}

export function CratesView({
  crates: initialCrates,
  initialCrateId,
  initialItems,
  initialCatalogItems,
  initialReleaseItems = [],
  initialWishlistItems,
  initialAlbumTracks = {},
  exchangeRates = {},
  initialItemCrateMap = {},
}: CratesViewProps) {
  const [crates, setCrates] = useState(initialCrates);
  const [activeCrateId, setActiveCrateId] = useState<number | null>(initialCrateId);
  const [items, setItems] = useState(initialItems);
  const [catalogItems, setCatalogItems] = useState(initialCatalogItems);
  const [releaseItems, setReleaseItems] = useState<CrateReleaseItem[]>(initialReleaseItems);
  const [wishlistItems, setWishlistItems] = useState(initialWishlistItems);
  const [albumTracks, setAlbumTracks] = useState<Record<string, WishlistAlbumData>>(initialAlbumTracks);
  const [itemCrateMap, setItemCrateMap] = useState<Record<string, number[]>>(initialItemCrateMap);
  const { playingTrackUrl, playingItem, isPlaying: playerIsPlaying, play: playFeedItem, setPlaylist } = usePlayer();
  const router = useRouter();
  const [confirmClear, setConfirmClear] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isRefreshingWishlist, setIsRefreshingWishlist] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showNewCrate, setShowNewCrate] = useState(false);
  const [newCrateName, setNewCrateName] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeCrate = crates.find((c) => c.id === activeCrateId) ?? null;
  const isWishlistCrate = activeCrate?.source === 'bandcamp_wishlist';
  const isUserCrate = activeCrate?.source === 'user';

  const totalCount = isWishlistCrate
    ? wishlistItems.length
    : items.length + catalogItems.length + releaseItems.length + wishlistItems.length;

  const playlistItems = useMemo(() => {
    const result: FeedItem[] = [];

    for (const item of items) {
      if (item.track?.streamUrl) result.push(item);
    }

    for (const item of catalogItems) {
      if (item.streamUrl) {
        result.push(catalogItemToFeedItem(item));
      }
    }

    for (const release of releaseItems) {
      const rel = crateReleaseToRelease(release);
      for (const track of release.tracks) {
        if (track.streamUrl) {
          result.push(catalogTrackToFeedItem(track, rel));
        }
      }
    }

    for (const item of wishlistItems) {
      const data = item.tralbumType === 'a' ? albumTracks[item.itemUrl] : undefined;
      if (data && data.tracks.length > 0) {
        for (const track of data.tracks) {
          if (track.streamUrl) {
            result.push(catalogTrackToFeedItem(track, data.release));
          }
        }
      } else if (item.streamUrl) {
        result.push(wishlistItemToFeedItem(item));
      }
    }

    return result;
  }, [items, catalogItems, releaseItems, wishlistItems, albumTracks]);

  useEffect(() => {
    setPlaylist(playlistItems);
    return () => setPlaylist([]);
  }, [playlistItems, setPlaylist]);

  useEffect(() => {
    if (menuOpenId === null) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
        setConfirmDeleteId(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpenId]);

  const selectCrate = useCallback((crateId: number) => {
    setActiveCrateId(crateId);
    setConfirmClear(false);
    router.replace(`/crates/${crateId}`, { scroll: false });
    const crate = crates.find((c) => c.id === crateId);

    startTransition(async () => {
      const mapPromise = getItemCrateMultiMapAction();
      if (crate?.source === 'bandcamp_wishlist') {
        const result = await getWishlistItemsAction();
        setWishlistItems(result.wishlistItems);
        setAlbumTracks(result.albumTracks);
        setItems([]);
        setCatalogItems([]);
        setReleaseItems([]);
      } else {
        const result = await getCrateItemsAction(crateId);
        setItems(result.items);
        setCatalogItems(result.catalogItems);
        setReleaseItems(result.releaseItems);
        setWishlistItems(result.wishlistItems);
        setAlbumTracks(result.albumTracks);
      }
      setItemCrateMap(await mapPromise);
    });
  }, [crates]);

  const userCrates: CrateInfo[] = crates
    .filter((c) => c.source === 'user')
    .map((c) => ({ id: c.id, name: c.name }));

  const handleAddToCrate = useCallback(async (itemId: string, crateId: number) => {
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
    const prevCrateIds = itemCrateMap[itemId] ?? [];
    setItemCrateMap((prev) => {
      const updated = (prev[itemId] ?? []).filter((id) => id !== crateId);
      const next = { ...prev };
      if (updated.length === 0) delete next[itemId];
      else next[itemId] = updated;
      return next;
    });
    if (crateId === activeCrateId) {
      setItems((prev) => prev.filter((item) => item.id !== itemId));
      setCatalogItems((prev) => prev.filter((item) => item.crateItemId !== itemId));
      setReleaseItems((prev) => prev.filter((item) => item.crateItemId !== itemId));
      setWishlistItems((prev) => prev.filter((item) => item.id !== itemId));
    }
    try {
      await removeFromCrateAction(crateId, itemId);
    } catch {
      setItemCrateMap((prev) => ({ ...prev, [itemId]: prevCrateIds }));
    }
  }, [activeCrateId, itemCrateMap]);

  const handleToggleCrate = useCallback((itemId: string) => {
    if (!activeCrateId) return;
    const crateIds = itemCrateMap[itemId] ?? [];
    if (crateIds.includes(activeCrateId)) {
      handleRemoveFromCrate(itemId, activeCrateId);
    } else {
      handleAddToCrate(itemId, activeCrateId);
    }
  }, [activeCrateId, itemCrateMap, handleAddToCrate, handleRemoveFromCrate]);

  const handleClearAll = useCallback(async () => {
    if (!activeCrateId) return;
    const prevItems = items;
    const prevCatalog = catalogItems;
    const prevReleases = releaseItems;
    const prevWishlist = wishlistItems;
    const prevAlbumTracks = albumTracks;
    setItems([]);
    setCatalogItems([]);
    setReleaseItems([]);
    setWishlistItems([]);
    setAlbumTracks({});
    setConfirmClear(false);
    try {
      await clearCrateAction(activeCrateId);
    } catch {
      setItems(prevItems);
      setCatalogItems(prevCatalog);
      setReleaseItems(prevReleases);
      setWishlistItems(prevWishlist);
      setAlbumTracks(prevAlbumTracks);
    }
  }, [activeCrateId, items, catalogItems, releaseItems, wishlistItems]);

  const handleOpenAll = useCallback(() => {
    for (const item of items) {
      window.open(item.album.url, '_blank');
    }
    for (const item of catalogItems) {
      window.open(item.trackUrl ?? item.releaseUrl, '_blank');
    }
    for (const release of releaseItems) {
      window.open(release.releaseUrl, '_blank');
    }
    for (const item of wishlistItems) {
      window.open(item.itemUrl, '_blank');
    }
  }, [items, catalogItems, releaseItems, wishlistItems]);

  const handleRefreshWishlist = useCallback(async () => {
    setIsRefreshingWishlist(true);
    try {
      const result = await refreshWishlistAction();
      setWishlistItems(result.wishlistItems);
      setAlbumTracks(result.albumTracks);
    } catch (err) {
      console.error('Failed to refresh wishlist:', err);
    } finally {
      setIsRefreshingWishlist(false);
    }
  }, []);

  const handlePlay = playFeedItem;

  const handlePlayCatalog = useCallback((item: CrateCatalogItem) => {
    playFeedItem(catalogItemToFeedItem(item));
  }, [playFeedItem]);

  const handlePlayWishlist = useCallback((item: WishlistItem) => {
    playFeedItem(wishlistItemToFeedItem(item));
  }, [playFeedItem]);

  const handlePlayAlbumTrack = useCallback((track: CatalogTrack, item: WishlistItem) => {
    const data = albumTracks[item.itemUrl];
    if (!data) return;
    playFeedItem(catalogTrackToFeedItem(track, data.release));
  }, [playFeedItem, albumTracks]);

  const handlePlayReleaseTrack = useCallback((track: CatalogTrack, release: CrateReleaseItem) => {
    playFeedItem(catalogTrackToFeedItem(track, crateReleaseToRelease(release)));
  }, [playFeedItem]);

  const handleCreateCrate = useCallback(() => {
    const name = newCrateName.trim();
    if (!name) return;
    setShowNewCrate(false);
    setNewCrateName('');
    startTransition(async () => {
      await createCrateAction(name);
      const updated = await getCratesAction();
      setCrates(updated);
    });
  }, [newCrateName]);

  const handleRename = useCallback(async (crateId: number) => {
    const name = renameValue.trim();
    if (!name) return;
    const prevName = crates.find((c) => c.id === crateId)?.name;
    setRenamingId(null);
    setMenuOpenId(null);
    setCrates((prev) => prev.map((c) => c.id === crateId ? { ...c, name } : c));
    try {
      await renameCrateAction(crateId, name);
    } catch {
      if (prevName) setCrates((prev) => prev.map((c) => c.id === crateId ? { ...c, name: prevName } : c));
    }
  }, [renameValue, crates]);

  const handleDelete = useCallback((crateId: number) => {
    setMenuOpenId(null);
    setConfirmDeleteId(null);
    setCrates((prev) => prev.filter((c) => c.id !== crateId));
    if (activeCrateId === crateId) {
      setActiveCrateId(null);
      setItems([]);
      setCatalogItems([]);
      setReleaseItems([]);
      setWishlistItems([]);
      setAlbumTracks({});
    }
    startTransition(async () => {
      await deleteCrateAction(crateId);
      const updated = await getCratesAction();
      setCrates(updated);
      if (activeCrateId === crateId && updated.length > 0) {
        selectCrate(updated[0].id);
      }
    });
  }, [activeCrateId, selectCrate]);

  return (
    <div className="flex min-h-0 flex-1">
      {/* Sidebar */}
      <div className="flex w-56 shrink-0 flex-col border-r border-zinc-800">
        <nav className="flex-1 overflow-y-auto py-2">
          {crates.map((crate) => {
            const isActive = activeCrateId === crate.id;
            const isUser = crate.source === 'user';

            return (
              <div key={crate.id} className="group relative">
                {renamingId === crate.id ? (
                  <div className="px-3 py-1.5">
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      maxLength={64}
                      onBlur={() => handleRename(crate.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(crate.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      autoFocus
                      className="w-full rounded bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
                    />
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => selectCrate(crate.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCrate(crate.id); } }}
                    className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      isActive
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                    }`}
                  >
                    <span className="truncate">{crate.name}</span>
                    {isUser && (
                      <button
                        type="button"
                        aria-label="Crate options"
                        aria-haspopup="menu"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (menuOpenId === crate.id) {
                            setMenuOpenId(null);
                          } else {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setMenuPos({ top: rect.bottom + 4, left: rect.right - 160 });
                            setMenuOpenId(crate.id);
                          }
                          setConfirmDeleteId(null);
                        }}
                        className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-xs transition-colors hover:bg-zinc-700 hover:text-zinc-200 ${
                          menuOpenId === crate.id
                            ? 'text-zinc-200'
                            : 'text-zinc-600 opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        ···
                      </button>
                    )}
                  </div>
                )}

              </div>
            );
          })}
        </nav>

        <div className={`border-t border-zinc-800 px-3 py-3 ${playingItem ? 'pb-24' : ''}`}>
          {showNewCrate ? (
            <div className="flex flex-col gap-2">
              <input
                value={newCrateName}
                onChange={(e) => setNewCrateName(e.target.value)}
                maxLength={64}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateCrate();
                  if (e.key === 'Escape') { setShowNewCrate(false); setNewCrateName(''); }
                }}
                placeholder="Crate name..."
                autoFocus
                className="w-full rounded bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-zinc-600"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateCrate}
                  className="rounded bg-zinc-700 px-3 py-1 text-xs text-zinc-200 transition-colors hover:bg-zinc-600"
                >
                  Add
                </button>
                <button
                  onClick={() => { setShowNewCrate(false); setNewCrateName(''); }}
                  className="rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewCrate(true)}
              className="w-full rounded-md px-2 py-1.5 text-left text-sm text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
            >
              + New Crate
            </button>
          )}
        </div>
      </div>

      {/* Three-dot dropdown menu (fixed position to avoid sidebar overflow clipping) */}
      {menuOpenId !== null && menuPos && (() => {
        const menuCrate = crates.find((c) => c.id === menuOpenId);
        if (!menuCrate) return null;
        return (
          <div
            ref={menuRef}
            className="fixed z-50 w-40 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            {confirmDeleteId === menuCrate.id ? (
              <div className="px-3 py-2">
                <p className="mb-2 text-xs text-zinc-400">Delete &ldquo;{menuCrate.name}&rdquo;?</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDelete(menuCrate.id)}
                    className="rounded bg-rose-600 px-2 py-1 text-xs text-white transition-colors hover:bg-rose-500"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : confirmClear ? (
              <div className="px-3 py-2">
                <p className="mb-2 text-xs text-zinc-400">Clear all items?</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { handleClearAll(); setMenuOpenId(null); }}
                    className="rounded bg-rose-600 px-2 py-1 text-xs text-white transition-colors hover:bg-rose-500"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => {
                    setMenuOpenId(null);
                    setRenamingId(menuCrate.id);
                    setRenameValue(menuCrate.name);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                >
                  Rename
                </button>
                <button
                  onClick={() => setConfirmClear(true)}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                >
                  Clear all items
                </button>
                {crates.filter((c) => c.source === 'user').length > 1 && (
                  <button
                    onClick={() => setConfirmDeleteId(menuCrate.id)}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-rose-400 transition-colors hover:bg-zinc-800 hover:text-rose-300"
                  >
                    Delete crate
                  </button>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* Main content */}
      <div className={`min-w-0 flex-1 overflow-y-auto ${playingItem ? 'pb-24' : ''}`}>
        {/* Toolbar */}
        {activeCrate && (
          <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
            <span className="text-sm text-zinc-400">
              {isPending ? 'Loading...' : `${totalCount} ${totalCount === 1 ? 'item' : 'items'}`}
            </span>
            <div className="flex items-center gap-3">
              {isWishlistCrate && (
                <button
                  onClick={handleRefreshWishlist}
                  disabled={isRefreshingWishlist}
                  className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isRefreshingWishlist ? 'Refreshing...' : 'Refresh Wishlist'}
                </button>
              )}
              {totalCount > 0 && (
                <button
                  onClick={handleOpenAll}
                  className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:bg-zinc-700"
                >
                  Open all on Bandcamp
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        {!activeCrate ? (
          <div className="px-6 py-16 text-center">
            <p className="text-lg text-zinc-500">Select a crate to view its contents</p>
          </div>
        ) : totalCount === 0 && !isPending ? (
          <div className="px-6 py-16 text-center">
            <p className="text-lg text-zinc-500">
              {isWishlistCrate ? 'Your Bandcamp wishlist is empty' : 'This crate is empty'}
            </p>
            {isUserCrate && (
              <p className="mt-2 text-sm text-zinc-600">
                Add tracks from your feed or artist pages using the crate icon.
              </p>
            )}
            {isUserCrate && (
              <Link
                href="/timeline"
                className="mt-4 inline-block rounded bg-zinc-800 px-4 py-2 text-sm text-zinc-200 transition-colors hover:bg-zinc-700"
              >
                Back to feed
              </Link>
            )}
          </div>
        ) : (
          <div>
            {/* Feed items */}
            {items.map((item) => {
              const isItemPlaying = playerIsPlaying && playingTrackUrl === item.track?.streamUrl;
              const crateIds = itemCrateMap[item.id];
              return (
                <FeedItemCard
                  key={item.id}
                  item={item}
                  isInCrate={(crateIds?.length ?? 0) > 0}
                  isPlaying={isItemPlaying}
                  onToggleCrate={() => handleToggleCrate(item.id)}
                  onPlay={() => handlePlay(item)}
                  exchangeRates={exchangeRates}
                  variant="crate"
                  crates={userCrates}
                  itemCrateIds={crateIds}
                  onAddToCrate={(crateId) => handleAddToCrate(item.id, crateId)}
                  onRemoveFromCrate={(crateId) => handleRemoveFromCrate(item.id, crateId)}
                />
              );
            })}

            {catalogItems.map((item) => (
              <CrateItemRow
                key={item.crateItemId}
                title={item.trackTitle}
                subtitle={<><Link href={`/music/${extractSlug(item.bandUrl)}`} className="hover:text-zinc-200 hover:underline" onClick={(e) => e.stopPropagation()}>{item.bandName}</Link>{getDomainIfDifferent(item.bandName, item.bandUrl) && <span className="text-zinc-600">{' · '}<Link href={`/music/${extractSlug(item.bandUrl)}`} className="hover:text-zinc-200 hover:underline" onClick={(e) => e.stopPropagation()}>{getDomainIfDifferent(item.bandName, item.bandUrl)}</Link></span>}<span className="text-zinc-600">{' · '}{item.releaseTitle}</span></>}
                imageUrl={item.imageUrl}
                streamUrl={item.streamUrl}
                bandcampUrl={item.trackUrl ?? item.releaseUrl}
                isPlaying={playerIsPlaying && playingTrackUrl === item.streamUrl && item.streamUrl != null}
                crateIds={itemCrateMap[item.crateItemId]}
                userCrates={userCrates}
                bpm={item.bpm}
                musicalKey={item.musicalKey}
                onPlay={() => handlePlayCatalog(item)}
                onToggleCrate={() => handleToggleCrate(item.crateItemId)}
                onAddToCrate={(crateId) => handleAddToCrate(item.crateItemId, crateId)}
                onRemoveFromCrate={(crateId) => handleRemoveFromCrate(item.crateItemId, crateId)}
              />
            ))}

            {releaseItems.map((release) => (
              <AlbumCard
                key={release.crateItemId}
                title={release.releaseTitle}
                titleHref={`/music/${release.bandSlug || extractSlug(release.bandUrl)}`}
                artistName={release.bandName}
                artistSlug={release.bandSlug || extractSlug(release.bandUrl)}
                artistUrl={release.bandUrl}
                imageUrl={release.imageUrl}
                bandcampUrl={release.releaseUrl}
                tags={release.tags}
                subtitle={release.releaseType === 'track' ? 'Single' : 'Album'}
                tracks={release.tracks}
                playingTrackUrl={playingTrackUrl}
                isPlayerPlaying={playerIsPlaying}
                crateIds={itemCrateMap[release.crateItemId]}
                itemCrateMap={itemCrateMap}
                userCrates={userCrates}
                onPlayTrack={(track) => handlePlayReleaseTrack(track, release)}
                onToggleCrate={() => handleToggleCrate(release.crateItemId)}
                onAddToCrate={(crateId) => handleAddToCrate(release.crateItemId, crateId)}
                onRemoveFromCrate={(crateId) => handleRemoveFromCrate(release.crateItemId, crateId)}
                onToggleTrackCrate={(itemId) => handleToggleCrate(itemId)}
                onAddTrackToCrate={(itemId, crateId) => handleAddToCrate(itemId, crateId)}
                onRemoveTrackFromCrate={(itemId, crateId) => handleRemoveFromCrate(itemId, crateId)}
              />
            ))}

            {wishlistItems.map((item) => {
              const data = item.tralbumType === 'a' ? albumTracks[item.itemUrl] : undefined;
              if (data && data.tracks.length > 0) {
                return (
                  <AlbumCard
                    key={item.id}
                    title={item.title}
                    artistName={item.artistName}
                    artistSlug={extractSlug(item.artistUrl)}
                    artistUrl={item.artistUrl}
                    imageUrl={item.imageUrl}
                    bandcampUrl={item.itemUrl}
                    tags={[...new Set(item.tags)].sort()}
                    tracks={data.tracks}
                    playingTrackUrl={playingTrackUrl}
                    isPlayerPlaying={playerIsPlaying}
                    crateIds={itemCrateMap[item.id]}
                    itemCrateMap={itemCrateMap}
                    userCrates={userCrates}
                    onPlayTrack={(track) => handlePlayAlbumTrack(track, item)}
                    onToggleCrate={() => handleToggleCrate(item.id)}
                    onAddToCrate={(crateId) => handleAddToCrate(item.id, crateId)}
                    onRemoveFromCrate={(crateId) => handleRemoveFromCrate(item.id, crateId)}
                    onToggleTrackCrate={(itemId) => handleToggleCrate(itemId)}
                    onAddTrackToCrate={(itemId, crateId) => handleAddToCrate(itemId, crateId)}
                    onRemoveTrackFromCrate={(itemId, crateId) => handleRemoveFromCrate(itemId, crateId)}
                  />
                );
              }
              return (
                <CrateItemRow
                  key={item.id}
                  title={item.featuredTrackTitle ?? item.title}
                  subtitle={<><Link href={`/music/${extractSlug(item.artistUrl)}`} className="hover:text-zinc-200 hover:underline" onClick={(e) => e.stopPropagation()}>{item.artistName}</Link>{getDomainIfDifferent(item.artistName, item.artistUrl) && <span className="text-zinc-600">{' · '}<Link href={`/music/${extractSlug(item.artistUrl)}`} className="hover:text-zinc-200 hover:underline" onClick={(e) => e.stopPropagation()}>{getDomainIfDifferent(item.artistName, item.artistUrl)}</Link></span>}<span className="text-zinc-600">{' · '}{item.title}</span></>}
                  imageUrl={item.imageUrl}
                  streamUrl={item.streamUrl}
                  bandcampUrl={item.itemUrl}
                  tags={item.tags}
                  bpm={item.bpm}
                  musicalKey={item.musicalKey}
                  isPlaying={playerIsPlaying && playingTrackUrl === item.streamUrl && item.streamUrl != null}
                  crateIds={itemCrateMap[item.id]}
                  userCrates={userCrates}
                  onPlay={() => handlePlayWishlist(item)}
                  onToggleCrate={() => handleToggleCrate(item.id)}
                  onAddToCrate={(crateId) => handleAddToCrate(item.id, crateId)}
                  onRemoveFromCrate={(crateId) => handleRemoveFromCrate(item.id, crateId)}
                />
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

interface CrateItemRowProps {
  title: string;
  subtitle: React.ReactNode;
  imageUrl: string;
  streamUrl: string | null;
  bandcampUrl: string;
  isPlaying: boolean;
  crateIds?: number[];
  userCrates: CrateInfo[];
  tags?: string[];
  bpm?: number | null;
  musicalKey?: string | null;
  onPlay: () => void;
  onToggleCrate: () => void;
  onAddToCrate: (crateId: number) => void;
  onRemoveFromCrate: (crateId: number) => void;
}

function CrateItemRow({
  title,
  subtitle,
  imageUrl,
  streamUrl,
  bandcampUrl,
  isPlaying,
  crateIds,
  userCrates,
  tags,
  bpm,
  musicalKey,
  onPlay,
  onToggleCrate,
  onAddToCrate,
  onRemoveFromCrate,
}: CrateItemRowProps) {
  return (
    <div
      className={`flex items-center gap-4 px-6 py-3 transition-colors hover:bg-zinc-900/50 ${
        isPlaying ? 'bg-zinc-900/80' : ''
      }`}
    >
      <button
        onClick={onPlay}
        disabled={!streamUrl}
        className="group relative h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded"
      >
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-zinc-600">♫</div>
        )}
        {streamUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="text-xl">{isPlaying ? '⏸' : '▶'}</span>
          </div>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        <div className="truncate text-sm text-zinc-400">{subtitle}</div>
        {(tags?.length || bpm || musicalKey) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {tags && [...new Set(tags)].sort().slice(0, 4).map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
            <BpmKeyBadge bpm={bpm} musicalKey={musicalKey} />
          </div>
        )}
      </div>

      <TrackActions
        isPlaying={isPlaying}
        hasStream={!!streamUrl}
        isInCrate={(crateIds?.length ?? 0) > 0}
        bandcampUrl={bandcampUrl}
        onPlay={onPlay}
        onToggleCrate={onToggleCrate}
        crates={userCrates}
        itemCrateIds={crateIds}
        onAddToCrate={onAddToCrate}
        onRemoveFromCrate={onRemoveFromCrate}
      />
    </div>
  );
}

function catalogTrackCrateId(trackId: number): string {
  return `catalog-track-${trackId}`;
}

