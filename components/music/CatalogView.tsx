'use client';

import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import type { CatalogRelease, CatalogTrack } from '@/lib/db/catalog';
import type { CrateItemRef } from '@/lib/crate-utils';
import { releaseKey } from '@/lib/crate-utils';
import { catalogTrackToFeedItem } from '@/lib/formatters';
import { useCrateActions } from '@/hooks/useCrateActions';
import { TrackActions } from '@/components/TrackActions';
import type { CrateInfo } from '@/components/TrackActions';
import { TrackList } from '@/components/TrackList';
import Link from 'next/link';
import { TagPill } from '@/components/TagPill';
import { usePlayer } from '@/contexts/PlayerContext';
import { useNavigation } from '@/contexts/NavigationContext';

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

interface EnrichmentStatusCache {
  [releaseId: number]: string | null;
}

export function CatalogView({ slug, bandName, bandUrl, releases, initialCrateItemIds = [], initialCrates = [], initialItemCrateMap = {}, loggedIn = false }: CatalogViewProps) {
  const { playingTrackUrl, isPlaying, play, setPlaylist } = usePlayer();
  const { lastMusicPath } = useNavigation();
  const { crates, crateItemIds, itemCrateMap, toggleCrate, addToCrate, removeFromCrate } = useCrateActions({
    initialCrateItemIds, initialCrates, initialItemCrateMap,
  });
  const [trackCache, setTrackCache] = useState<TrackCache>({});
  const [releaseDates, setReleaseDates] = useState<ReleaseDateCache>({});
  const [tagsCache, setTagsCache] = useState<TagsCache>({});
  const [enrichmentStatus, setEnrichmentStatus] = useState<EnrichmentStatusCache>({});
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
        setEnrichmentStatus((prev) => ({ ...prev, [release.id]: data.enrichmentStatus ?? null }));
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

  const playlistItems = useMemo(() =>
    releases.flatMap((release) =>
      (trackCache[release.id] ?? [])
        .filter((t) => t.streamUrl)
        .map((t) => catalogTrackToFeedItem(t, release))
    ),
    [releases, trackCache],
  );

  useEffect(() => {
    setPlaylist(playlistItems);
    return () => setPlaylist([]);
  }, [playlistItems, setPlaylist]);

  const playTrack = useCallback((track: CatalogTrack, release: CatalogRelease) => {
    if (!track.streamUrl) return;
    play(catalogTrackToFeedItem(track, release));
  }, [play]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-6 pb-28">
      <div className="mb-6">
        <Link
          href="/music"
          onClick={() => { lastMusicPath.current = '/music'; }}
          className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          ← Browse artists
        </Link>
        <div className="flex items-center justify-between">
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
      </div>

      <div className="space-y-2">
        {releases.map((release) => (
          <ReleaseCard
            key={release.id}
            release={release}
            releaseDate={releaseDates[release.id] ?? release.releaseDate ?? null}
            tags={tagsCache[release.id] ?? release.tags ?? []}
            enrichmentStatus={enrichmentStatus[release.id] ?? undefined}
            isLoading={loading.has(release.id)}
            tracks={trackCache[release.id]}
            playingTrackUrl={playingTrackUrl}
            isPlayerPlaying={isPlaying}
            crateItemIds={crateItemIds}
            itemCrateMap={itemCrateMap}
            crates={crates}
            loggedIn={loggedIn}
            onPlayTrack={(track) => playTrack(track, release)}
            onToggleItem={toggleCrate}
            onAddItemToCrate={addToCrate}
            onRemoveItemFromCrate={removeFromCrate}
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
  enrichmentStatus?: string | null;
  isLoading: boolean;
  tracks?: CatalogTrack[];
  playingTrackUrl: string | null;
  isPlayerPlaying: boolean;
  crateItemIds: Set<string>;
  itemCrateMap: Record<string, number[]>;
  crates: CrateInfo[];
  loggedIn: boolean;
  onPlayTrack: (track: CatalogTrack) => void;
  onToggleItem: (key: string, ref: CrateItemRef) => void;
  onAddItemToCrate: (key: string, ref: CrateItemRef, crateId: number) => void;
  onRemoveItemFromCrate: (key: string, ref: CrateItemRef, crateId: number) => void;
}

function ReleaseCard({
  release,
  releaseDate,
  tags,
  enrichmentStatus,
  isLoading,
  tracks,
  playingTrackUrl,
  isPlayerPlaying,
  crateItemIds,
  itemCrateMap,
  crates,
  loggedIn,
  onPlayTrack,
  onToggleItem,
  onAddItemToCrate,
  onRemoveItemFromCrate,
}: ReleaseCardProps) {
  const rk = releaseKey(release.id);
  const ref: CrateItemRef = { releaseId: release.id };
  const releaseInCrate = crateItemIds.has(rk);
  return (
    <div className="rounded-lg border border-zinc-800">
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
          {tags.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <TagPill key={tag} tag={tag} />
              ))}
            </div>
          ) : enrichmentStatus === 'pending' ? (
            <div className="mt-1 flex flex-wrap gap-1">
              <span
                className="cursor-default rounded bg-zinc-800/60 px-1.5 py-0.5 text-xs text-zinc-500"
                title="Tags will appear after catalog enrichment"
              >
                ···
              </span>
            </div>
          ) : null}
        </div>
        {loggedIn && (
          <TrackActions
            isPlaying={false}
            hasStream={false}
            isInCrate={releaseInCrate}
            bandcampUrl={release.url}
            onPlay={() => {}}
            onToggleCrate={() => onToggleItem(rk, ref)}
            showPlayButton={false}
            showCrate={true}
            crates={crates}
            itemCrateIds={itemCrateMap[rk]}
            onAddToCrate={(crateId) => onAddItemToCrate(rk, ref, crateId)}
            onRemoveFromCrate={(crateId) => onRemoveItemFromCrate(rk, ref, crateId)}
          />
        )}
        {!loggedIn && (
          <a
            href={release.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-sm text-zinc-600 transition-colors hover:text-zinc-400"
            title="Open on Bandcamp"
          >
            ↗
          </a>
        )}
      </div>

      <div className="border-t border-zinc-800/50">
        {isLoading ? (
          <div className="px-4 py-4 text-center text-sm text-zinc-500">
            Loading tracks...
          </div>
        ) : tracks && tracks.length > 0 ? (
          <TrackList
            tracks={tracks}
            playingTrackUrl={playingTrackUrl}
            isPlayerPlaying={isPlayerPlaying}
            fallbackUrl={release.url}
            crates={crates}
            itemCrateMap={itemCrateMap}
            showCrate={loggedIn}
            onPlayTrack={onPlayTrack}
            onToggleCrate={onToggleItem}
            onAddToCrate={onAddItemToCrate}
            onRemoveFromCrate={onRemoveItemFromCrate}
          />
        ) : tracks !== undefined && tracks.length === 0 && enrichmentStatus === 'pending' ? (
          <div
            className="px-4 py-4 text-center text-sm text-zinc-600"
            title="Track listing, tags, and artwork will appear after catalog enrichment"
          >
            Enriching...
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
