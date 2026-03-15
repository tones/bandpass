'use client';

import { useState, useCallback, useTransition, useEffect, useMemo } from 'react';
import type { WishlistItem } from '@/lib/bandcamp/types/domain';
import type { FeedItem } from '@/lib/bandcamp/types/domain';
import type { Crate, CrateCatalogItem, CrateReleaseItem, WishlistAlbumData } from '@/lib/db/crates';
import type { CrateItemRef } from '@/lib/crate-utils';
import { trackKey, releaseKey } from '@/lib/crate-utils';
import type { CatalogTrack } from '@/lib/db/catalog';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePlayer } from '@/contexts/PlayerContext';
import type { CrateInfo } from './TrackActions';
import { AlbumCard } from '@/components/AlbumCard';
import { catalogTrackToFeedItem, catalogItemToFeedItem, wishlistItemToFeedItem, crateReleaseToRelease } from '@/lib/formatters';
import { extractSlug, getDomainIfDifferent } from '@/lib/bandcamp/scraper';
import { CrateItemRow } from '@/components/crates/CrateItemRow';
import { CrateSidebar } from '@/components/crates/CrateSidebar';
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
} from '@/app/(app)/crates/actions';

interface CratesViewProps {
  crates: Crate[];
  initialCrateId: number | null;
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
  initialCatalogItems,
  initialReleaseItems = [],
  initialWishlistItems,
  initialAlbumTracks = {},
  exchangeRates = {},
  initialItemCrateMap = {},
}: CratesViewProps) {
  const [crates, setCrates] = useState(initialCrates);
  const [activeCrateId, setActiveCrateId] = useState<number | null>(initialCrateId);
  const [catalogItems, setCatalogItems] = useState(initialCatalogItems);
  const [releaseItems, setReleaseItems] = useState<CrateReleaseItem[]>(initialReleaseItems);
  const [wishlistItems, setWishlistItems] = useState(initialWishlistItems);
  const [albumTracks, setAlbumTracks] = useState<Record<string, WishlistAlbumData>>(initialAlbumTracks);
  const [itemCrateMap, setItemCrateMap] = useState<Record<string, number[]>>(initialItemCrateMap);
  const { playingTrackUrl, playingItem, isPlaying: playerIsPlaying, play: playFeedItem, setPlaylist } = usePlayer();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRefreshingWishlist, setIsRefreshingWishlist] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const activeCrate = crates.find((c) => c.id === activeCrateId) ?? null;
  const isWishlistCrate = activeCrate?.source === 'bandcamp_wishlist';
  const isUserCrate = activeCrate?.source === 'user';

  const totalCount = isWishlistCrate
    ? wishlistItems.length
    : catalogItems.length + releaseItems.length;

  const playlistItems = useMemo(() => {
    const result: FeedItem[] = [];

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
  }, [catalogItems, releaseItems, wishlistItems, albumTracks]);

  useEffect(() => {
    setPlaylist(playlistItems);
    return () => setPlaylist([]);
  }, [playlistItems, setPlaylist]);

  const selectCrate = useCallback((crateId: number) => {
    setActiveCrateId(crateId);
    router.replace(`/crates/${crateId}`, { scroll: false });
    const crate = crates.find((c) => c.id === crateId);

    startTransition(async () => {
      const mapPromise = getItemCrateMultiMapAction();
      if (crate?.source === 'bandcamp_wishlist') {
        const result = await getWishlistItemsAction();
        setWishlistItems(result.wishlistItems);
        setAlbumTracks(result.albumTracks);
        setCatalogItems([]);
        setReleaseItems([]);
      } else {
        const result = await getCrateItemsAction(crateId);
        setCatalogItems(result.catalogItems);
        setReleaseItems(result.releaseItems);
        setWishlistItems([]);
        setAlbumTracks({});
      }
      setItemCrateMap(await mapPromise);
    });
  }, [crates]);

  const userCrates: CrateInfo[] = crates
    .filter((c) => c.source === 'user')
    .map((c) => ({ id: c.id, name: c.name }));

  const handleAddToCrate = useCallback(async (key: string, ref: CrateItemRef, crateId: number) => {
    setItemCrateMap((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []), crateId],
    }));
    try {
      await addToCrateAction(crateId, ref);
    } catch {
      setItemCrateMap((prev) => {
        const updated = (prev[key] ?? []).filter((id) => id !== crateId);
        const next = { ...prev };
        if (updated.length === 0) delete next[key];
        else next[key] = updated;
        return next;
      });
    }
  }, []);

  const handleRemoveFromCrate = useCallback(async (key: string, ref: CrateItemRef, crateId: number) => {
    const prevCrateIds = itemCrateMap[key] ?? [];
    setItemCrateMap((prev) => {
      const updated = (prev[key] ?? []).filter((id) => id !== crateId);
      const next = { ...prev };
      if (updated.length === 0) delete next[key];
      else next[key] = updated;
      return next;
    });
    if (crateId === activeCrateId) {
      setCatalogItems((prev) => prev.filter((item) => trackKey(item.trackId) !== key));
      setReleaseItems((prev) => prev.filter((item) => releaseKey(item.releaseId) !== key));
    }
    try {
      await removeFromCrateAction(crateId, ref);
    } catch {
      setItemCrateMap((prev) => ({ ...prev, [key]: prevCrateIds }));
    }
  }, [activeCrateId, itemCrateMap]);

  const handleToggleCrate = useCallback((key: string, ref: CrateItemRef) => {
    if (!activeCrateId) return;
    const crateIds = itemCrateMap[key] ?? [];
    if (crateIds.includes(activeCrateId)) {
      handleRemoveFromCrate(key, ref, activeCrateId);
    } else {
      handleAddToCrate(key, ref, activeCrateId);
    }
  }, [activeCrateId, itemCrateMap, handleAddToCrate, handleRemoveFromCrate]);

  const handleClearAll = useCallback(async () => {
    if (!activeCrateId) return;
    const prevCatalog = catalogItems;
    const prevReleases = releaseItems;
    const prevWishlist = wishlistItems;
    const prevAlbumTracks = albumTracks;
    setCatalogItems([]);
    setReleaseItems([]);
    setWishlistItems([]);
    setAlbumTracks({});
    try {
      await clearCrateAction(activeCrateId);
    } catch {
      setCatalogItems(prevCatalog);
      setReleaseItems(prevReleases);
      setWishlistItems(prevWishlist);
      setAlbumTracks(prevAlbumTracks);
    }
  }, [activeCrateId, catalogItems, releaseItems, wishlistItems]);

  const handleOpenAll = useCallback(() => {
    for (const item of catalogItems) {
      window.open(item.trackUrl ?? item.releaseUrl, '_blank');
    }
    for (const release of releaseItems) {
      window.open(release.releaseUrl, '_blank');
    }
    for (const item of wishlistItems) {
      window.open(item.itemUrl, '_blank');
    }
  }, [catalogItems, releaseItems, wishlistItems]);

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

  const handleCreateCrate = useCallback((name: string) => {
    startTransition(async () => {
      await createCrateAction(name);
      const updated = await getCratesAction();
      setCrates(updated);
    });
  }, []);

  const handleRename = useCallback(async (crateId: number) => {
    const name = renameValue.trim();
    if (!name) return;
    const prevName = crates.find((c) => c.id === crateId)?.name;
    setRenamingId(null);
    setCrates((prev) => prev.map((c) => c.id === crateId ? { ...c, name } : c));
    try {
      await renameCrateAction(crateId, name);
    } catch {
      if (prevName) setCrates((prev) => prev.map((c) => c.id === crateId ? { ...c, name: prevName } : c));
    }
  }, [renameValue, crates]);

  const handleDelete = useCallback((crateId: number) => {
    setCrates((prev) => prev.filter((c) => c.id !== crateId));
    if (activeCrateId === crateId) {
      setActiveCrateId(null);
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
      <CrateSidebar
        crates={crates}
        activeCrateId={activeCrateId}
        hasPlayingItem={!!playingItem}
        renamingId={renamingId}
        renameValue={renameValue}
        onSetRenameValue={setRenameValue}
        onRename={handleRename}
        onCancelRename={() => setRenamingId(null)}
        onSelectCrate={selectCrate}
        onStartRename={(id, name) => { setRenamingId(id); setRenameValue(name); }}
        onDelete={handleDelete}
        onClearAll={handleClearAll}
        onCreate={handleCreateCrate}
      />

      <div className={`min-w-0 flex-1 overflow-y-auto ${playingItem ? 'pb-24' : ''}`}>
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
            {catalogItems.map((item) => {
              const tk = trackKey(item.trackId);
              const ref: CrateItemRef = { trackId: item.trackId };
              return (
                <CrateItemRow
                  key={tk}
                  title={item.trackTitle}
                  subtitle={<><Link href={`/music/${extractSlug(item.bandUrl)}`} className="hover:text-zinc-200 hover:underline" onClick={(e) => e.stopPropagation()}>{item.bandName}</Link>{getDomainIfDifferent(item.bandName, item.bandUrl) && <span className="text-zinc-600">{' · '}<Link href={`/music/${extractSlug(item.bandUrl)}`} className="hover:text-zinc-200 hover:underline" onClick={(e) => e.stopPropagation()}>{getDomainIfDifferent(item.bandName, item.bandUrl)}</Link></span>}<span className="text-zinc-600">{' · '}{item.releaseTitle}</span></>}
                  imageUrl={item.imageUrl}
                  streamUrl={item.streamUrl}
                  bandcampUrl={item.trackUrl ?? item.releaseUrl}
                  isPlaying={playerIsPlaying && playingTrackUrl === item.streamUrl && item.streamUrl != null}
                  crateIds={itemCrateMap[tk]}
                  userCrates={userCrates}
                  bpm={item.bpm}
                  musicalKey={item.musicalKey}
                  bpmStatus={item.bpmStatus}
                  onPlay={() => handlePlayCatalog(item)}
                  onToggleCrate={() => handleToggleCrate(tk, ref)}
                  onAddToCrate={(crateId) => handleAddToCrate(tk, ref, crateId)}
                  onRemoveFromCrate={(crateId) => handleRemoveFromCrate(tk, ref, crateId)}
                />
              );
            })}

            {releaseItems.map((release) => {
              const rk = releaseKey(release.releaseId);
              const ref: CrateItemRef = { releaseId: release.releaseId };
              return (
                <AlbumCard
                  key={rk}
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
                  crateIds={itemCrateMap[rk]}
                  itemCrateMap={itemCrateMap}
                  userCrates={userCrates}
                  onPlayTrack={(track) => handlePlayReleaseTrack(track, release)}
                  onToggleCrate={() => handleToggleCrate(rk, ref)}
                  onAddToCrate={(crateId) => handleAddToCrate(rk, ref, crateId)}
                  onRemoveFromCrate={(crateId) => handleRemoveFromCrate(rk, ref, crateId)}
                  onToggleTrackCrate={handleToggleCrate}
                  onAddTrackToCrate={handleAddToCrate}
                  onRemoveTrackFromCrate={handleRemoveFromCrate}
                />
              );
            })}

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
                    onToggleCrate={() => {}}
                    onAddToCrate={() => {}}
                    onRemoveFromCrate={() => {}}
                    onToggleTrackCrate={handleToggleCrate}
                    onAddTrackToCrate={handleAddToCrate}
                    onRemoveTrackFromCrate={handleRemoveFromCrate}
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
                  onToggleCrate={() => {}}
                  onAddToCrate={() => {}}
                  onRemoveFromCrate={() => {}}
                />
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
