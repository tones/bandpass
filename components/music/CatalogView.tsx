'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import WavesurferPlayer from '@wavesurfer/react';
import type WaveSurfer from 'wavesurfer.js';
import type { CatalogRelease, CatalogTrack } from '@/lib/db/catalog';
import { formatDuration, proxyUrl } from '@/lib/formatters';
import { toggleDefaultCrate, addToCrateAction, removeFromCrateAction } from '@/app/crates/actions';
import { TrackActions } from '@/components/TrackActions';
import type { CrateInfo } from '@/components/TrackActions';
import { CrateIcon } from '@/components/icons/CrateIcon';
import { TagPill } from '@/components/TagPill';

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

interface NowPlaying {
  track: CatalogTrack;
  release: CatalogRelease;
}

export function CatalogView({ slug, bandName, bandUrl, releases, initialCrateItemIds = [], initialCrates = [], initialItemCrateMap = {}, loggedIn = false }: CatalogViewProps) {
  const [crates] = useState<CrateInfo[]>(initialCrates);
  const [crateItemIds, setCrateItemIds] = useState<Set<string>>(() => new Set(initialCrateItemIds));
  const [itemCrateMap, setItemCrateMap] = useState<Record<string, number[]>>(initialItemCrateMap);
  const [trackCache, setTrackCache] = useState<TrackCache>({});
  const [releaseDates, setReleaseDates] = useState<ReleaseDateCache>({});
  const [tagsCache, setTagsCache] = useState<TagsCache>({});
  const [loading, setLoading] = useState<Set<number>>(new Set());
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [wavesurfer, setWavesurfer] = useState<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const prevUrlRef = useRef<string | null>(null);
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
    setNowPlaying((prev) => {
      if (prev?.track.streamUrl === track.streamUrl) return null;
      return { track, release };
    });
  }, []);

  const onReady = useCallback((ws: WaveSurfer) => {
    setWavesurfer(ws);
    setDuration(ws.getDuration());
    ws.play();
  }, []);

  useEffect(() => {
    if (wavesurfer && nowPlaying?.track.streamUrl) {
      const url = nowPlaying.track.streamUrl;
      if (url !== prevUrlRef.current) {
        prevUrlRef.current = url;
        wavesurfer.load(proxyUrl(url));
      }
    }
  }, [wavesurfer, nowPlaying]);

  const togglePlayPause = useCallback(() => {
    wavesurfer?.playPause();
  }, [wavesurfer]);

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
            nowPlaying={nowPlaying}
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

      {nowPlaying?.track.streamUrl && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-800 bg-zinc-950 px-6 py-3">
          <div className="mx-auto flex max-w-5xl items-center gap-4">
            <img
              src={nowPlaying.release.imageUrl}
              alt={nowPlaying.release.title}
              className="h-14 w-14 shrink-0 rounded"
            />
            <div className="w-40 shrink-0">
              <div className="truncate text-sm font-medium text-zinc-100">
                {nowPlaying.track.title}
              </div>
              <div className="truncate text-xs text-zinc-400">
                {nowPlaying.release.bandName} — {nowPlaying.release.title}
              </div>
            </div>

            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-zinc-500">
              {formatDuration(currentTime)}
            </span>

            <div className="min-w-0 flex-1 cursor-pointer">
              <WavesurferPlayer
                key={nowPlaying.track.streamUrl}
                height={48}
                barWidth={2}
                barGap={1}
                barRadius={2}
                waveColor="#52525b"
                progressColor="#d97706"
                cursorColor="transparent"
                url={proxyUrl(nowPlaying.track.streamUrl)}
                onReady={onReady}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeupdate={(ws: WaveSurfer) => setCurrentTime(ws.getCurrentTime())}
              />
            </div>

            <span className="w-10 shrink-0 text-xs tabular-nums text-zinc-500">
              {duration > 0 ? formatDuration(duration) : '—'}
            </span>

            <button
              onClick={togglePlayPause}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-200 transition-colors hover:bg-zinc-700"
            >
              {isPlaying ? '⏸' : '▶'}
            </button>

            {loggedIn && nowPlaying.track.id && (() => {
              const cid = catalogTrackCrateId(nowPlaying.track.id);
              const inCrate = crateItemIds.has(cid);
              return (
                <button
                  onClick={() => handleToggleCrate(nowPlaying.track.id)}
                  className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded transition-colors ${
                    inCrate ? 'text-amber-400 hover:text-amber-300' : 'text-zinc-600 hover:text-zinc-400'
                  }`}
                  title={inCrate ? 'Remove from crate' : 'Add to crate'}
                >
                  <CrateIcon filled={inCrate} className="h-5 w-5" />
                </button>
              );
            })()}

            <a
              href={nowPlaying.track.trackUrl ?? nowPlaying.release.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-sm text-zinc-600 transition-colors hover:text-zinc-400"
              title="Open on Bandcamp"
            >
              ↗
            </a>
          </div>
        </div>
      )}
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
  nowPlaying: NowPlaying | null;
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
  nowPlaying,
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
                nowPlaying?.track.streamUrl === track.streamUrl &&
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
