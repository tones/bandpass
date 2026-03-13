'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { CatalogRelease, CatalogTrack } from '@/lib/db/catalog';
import type { FeedItem } from '@/lib/bandcamp/types/domain';
import { formatDuration } from '@/lib/formatters';
import { toggleDefaultCrate, addToCrateAction, removeFromCrateAction } from '@/app/crates/actions';
import { TrackActions } from '@/components/TrackActions';
import type { CrateInfo } from '@/components/TrackActions';
import { TagPill } from '@/components/TagPill';
import { BpmKeyBadge } from '@/components/BpmKeyBadge';
import { usePlayer } from '@/contexts/PlayerContext';

function catalogTrackCrateId(trackId: number): string {
  return `catalog-track-${trackId}`;
}

interface CatalogViewProps {
  slug: string;
  bandName: string;
  bandUrl: string;
  releases: CatalogRelease[];
  initialCrateItemIds?: string[];
  initialCrates?: CrateInfo[];
  initialItemCrateMap?: Record<string, number[]>;
  loggedIn?: boolean;
}

interface TrackCache {
  [releaseId: number]: CatalogTrack[];
}

interface ReleaseDateCache {
  [releaseId: number]: string | null;
}

interface TagsCache {
  [releaseId: number]: string[];
}

function catalogTrackToFeedItem(track: CatalogTrack, release: CatalogRelease): FeedItem {
  return {
    id: `catalog-track-${track.id}`,
    storyType: 'new_release',
    date: new Date(),
    album: { id: release.id, title: release.title, url: release.url, imageUrl: release.imageUrl },
    artist: { id: 0, name: release.bandName, url: release.bandUrl },
    track: { title: track.title, duration: track.duration, streamUrl: track.streamUrl },
    tags: [],
    bpm: track.bpm,
    musicalKey: track.musicalKey,
    price: null,
    socialSignal: { fan: null, alsoCollectedCount: 0 },
  };
}

export function CatalogView({ slug, bandName, bandUrl, releases, initialCrateItemIds = [], initialCrates = [], initialItemCrateMap = {}, loggedIn = false }: CatalogViewProps) {
  const { playingTrackUrl, isPlaying, play } = usePlayer();
  const [crates] = useState<CrateInfo[]>(initialCrates);
  const [crateItemIds, setCrateItemIds] = useState<Set<string>>(() => new Set(initialCrateItemIds));
  const [itemCrateMap, setItemCrateMap] = useState<Record<string, number[]>>(initialItemCrateMap);
  const [trackCache, setTrackCache] = useState<TrackCache>({});
  const [releaseDates, setReleaseDates] = useState<ReleaseDateCache>({});
  const [tagsCache, setTagsCache] = useState<TagsCache>({});
  const [loading, setLoading] = useState<Set<number>>(new Set());
  const fetchedRef = useRef(false);

  const fetchTracks = useCallback(
    async (release: CatalogRelease) => {
      setLoading((prev) => new Set(prev).add(release.id));
      try {
        const res = await fetch(`/api/music/${slug}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            releaseId: release.id,
            albumUrl: release.url,
          }),
        });
        const data = await res.json();
        setTrackCache((prev) => ({ ...prev, [release.id]: data.tracks ?? [] }));
        if (data.releaseDate) {
          setReleaseDates((prev) => ({ ...prev, [release.id]: data.releaseDate }));
        }
        if (data.tags?.length) {
          setTagsCache((prev) => ({ ...prev, [release.id]: data.tags }));
        }
      } catch (err) {
        console.error('Failed to load tracks:', err);
      } finally {
        setLoading((prev) => {
          const next = new Set(prev);
          next.delete(release.id);
          return next;
        });
      }
    },
    [slug],
  );

  useEffect(() => {
    if (fetchedRef.current || releases.length === 0) return;
    fetchedRef.current = true;

    async function loadAll() {
      for (let i = 0; i < releases.length; i++) {
        await fetchTracks(releases[i]);
        if (i < releases.length - 1) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }
    }
    loadAll();
  }, [releases, fetchTracks]);

  const playTrack = useCallback((track: CatalogTrack, release: CatalogRelease) => {
    if (!track.streamUrl) return;
    play(catalogTrackToFeedItem(track, release));
  }, [play]);

  const handleToggleCrate = useCallback(async (trackId: number) => {
    const id = catalogTrackCrateId(trackId);
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

  const handleAddToCrate = useCallback(async (trackId: number, crateId: number) => {
    const id = catalogTrackCrateId(trackId);
    setCrateItemIds((prev) => new Set(prev).add(id));
    setItemCrateMap((prev) => ({
      ...prev,
      [id]: [...(prev[id] ?? []), crateId],
    }));
    try {
      await addToCrateAction(crateId, id);
    } catch {
      setItemCrateMap((prev) => {
        const updated = (prev[id] ?? []).filter((c) => c !== crateId);
        const next = { ...prev };
        if (updated.length === 0) delete next[id];
        else next[id] = updated;
        return next;
      });
    }
  }, []);

  const handleRemoveFromCrate = useCallback(async (trackId: number, crateId: number) => {
    const id = catalogTrackCrateId(trackId);
    const prevCrateIds = itemCrateMap[id] ?? [];
    const updated = prevCrateIds.filter((c) => c !== crateId);
    if (updated.length === 0) {
      setCrateItemIds((prevIds) => {
        const s = new Set(prevIds);
        s.delete(id);
        return s;
      });
      setItemCrateMap((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } else {
      setItemCrateMap((prev) => ({ ...prev, [id]: updated }));
    }
    try {
      await removeFromCrateAction(crateId, id);
    } catch {
      setCrateItemIds((prevIds) => new Set(prevIds).add(id));
      setItemCrateMap((prev) => ({ ...prev, [id]: prevCrateIds }));
    }
  }, [itemCrateMap]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-6 pb-28">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100">{bandName}</h2>
          <a
            href={bandUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-zinc-500 hover:text-zinc-300"
          >
            {bandUrl.replace('https://', '')} ↗
          </a>
        </div>
        <span className="text-sm text-zinc-500">
          {releases.length} release{releases.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {releases.map((release) => (
          <ReleaseCard
            key={release.id}
            release={release}
            releaseDate={releaseDates[release.id] ?? release.releaseDate ?? null}
            tags={tagsCache[release.id] ?? release.tags ?? []}
            isLoading={loading.has(release.id)}
            tracks={trackCache[release.id]}
            playingTrackUrl={playingTrackUrl}
            isPlayerPlaying={isPlaying}
            crateItemIds={crateItemIds}
            itemCrateMap={itemCrateMap}
            crates={crates}
            loggedIn={loggedIn}
            onPlayTrack={(track) => playTrack(track, release)}
            onToggleCrate={handleToggleCrate}
            onAddToCrate={handleAddToCrate}
            onRemoveFromCrate={handleRemoveFromCrate}
          />
        ))}
      </div>

    </div>
  );
}

function formatReleaseDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface ReleaseCardProps {
  release: CatalogRelease;
  releaseDate: string | null;
  tags: string[];
  isLoading: boolean;
  tracks?: CatalogTrack[];
  playingTrackUrl: string | null;
  isPlayerPlaying: boolean;
  crateItemIds: Set<string>;
  itemCrateMap: Record<string, number[]>;
  crates: CrateInfo[];
  loggedIn: boolean;
  onPlayTrack: (track: CatalogTrack) => void;
  onToggleCrate: (trackId: number) => void;
  onAddToCrate: (trackId: number, crateId: number) => void;
  onRemoveFromCrate: (trackId: number, crateId: number) => void;
}

function ReleaseCard({
  release,
  releaseDate,
  tags,
  isLoading,
  tracks,
  playingTrackUrl,
  isPlayerPlaying,
  crateItemIds,
  itemCrateMap,
  crates,
  loggedIn,
  onPlayTrack,
  onToggleCrate,
  onAddToCrate,
  onRemoveFromCrate,
}: ReleaseCardProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800">
      <div className="flex items-center gap-4 px-4 py-3">
        {release.imageUrl ? (
          <img
            src={release.imageUrl}
            alt={release.title}
            className="h-14 w-14 shrink-0 rounded"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-600">
            ♫
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-zinc-100">{release.title}</div>
          <div className="text-xs text-zinc-500">
            {release.releaseType === 'track' ? 'Single' : 'Album'}
            {releaseDate && <> · {formatReleaseDate(releaseDate)}</>}
          </div>
          {tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <TagPill key={tag} tag={tag} />
              ))}
            </div>
          )}
        </div>
        <a
          href={release.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-sm text-zinc-600 transition-colors hover:text-zinc-400"
          title="Open on Bandcamp"
        >
          ↗
        </a>
      </div>

      <div className="border-t border-zinc-800/50">
        {isLoading ? (
          <div className="px-4 py-4 text-center text-sm text-zinc-500">
            Loading tracks...
          </div>
        ) : tracks && tracks.length > 0 ? (
          <div>
            {tracks.map((track) => {
              const isActive =
                playingTrackUrl === track.streamUrl &&
                track.streamUrl != null &&
                isPlayerPlaying;
              const cid = catalogTrackCrateId(track.id);
              const inCrate = crateItemIds.has(cid);
              return (
                <div
                  key={track.id}
                  className={`flex w-full items-center gap-3 px-4 py-2 transition-colors ${
                    isActive ? 'bg-zinc-900' : 'hover:bg-zinc-900/30'
                  } ${!track.streamUrl ? 'opacity-40' : ''}`}
                >
                  <span className="w-6 shrink-0 text-right text-xs tabular-nums text-zinc-600">
                    {track.trackNum}
                  </span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm text-zinc-200"
                    onClick={() => onPlayTrack(track)}
                  >
                    {track.title}
                  </button>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-600">
                    {track.duration > 0 ? formatDuration(track.duration) : ''}
                  </span>
                  <BpmKeyBadge bpm={track.bpm} musicalKey={track.musicalKey} />
                  <TrackActions
                    isPlaying={isActive}
                    hasStream={!!track.streamUrl}
                    isInCrate={inCrate}
                    bandcampUrl={track.trackUrl ?? release.url}
                    onPlay={() => onPlayTrack(track)}
                    onToggleCrate={() => onToggleCrate(track.id)}
                    showCrate={loggedIn}
                    crates={crates}
                    itemCrateIds={itemCrateMap[cid]}
                    onAddToCrate={(crateId) => onAddToCrate(track.id, crateId)}
                    onRemoveFromCrate={(crateId) => onRemoveFromCrate(track.id, crateId)}
                  />
                </div>
              );
            })}
          </div>
        ) : tracks !== undefined ? (
          <div className="px-4 py-4 text-center text-sm text-zinc-500">
            No tracks found
          </div>
        ) : (
          <div className="px-4 py-4 text-center text-sm text-zinc-600">
            Tracks not yet loaded
          </div>
        )}
      </div>
    </div>
  );
}
