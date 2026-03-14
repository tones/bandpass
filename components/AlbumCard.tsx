import type { CatalogTrack } from '@/lib/db/catalog';
import { getDomainIfDifferent } from '@/lib/bandcamp/scraper';
import { TrackActions } from './TrackActions';
import type { CrateInfo } from './TrackActions';
import { TrackList } from './TrackList';
import { TagPill } from './TagPill';
import Link from 'next/link';

interface AlbumCardProps {
  title: string;
  titleHref?: string;
  artistName: string;
  artistSlug: string;
  artistUrl: string;
  imageUrl?: string | null;
  bandcampUrl: string;
  tags: string[];
  subtitle?: string;
  tracks: CatalogTrack[];
  playingTrackUrl: string | null;
  isPlayerPlaying: boolean;
  crateIds?: number[];
  itemCrateMap: Record<string, number[]>;
  userCrates: CrateInfo[];
  onPlayTrack: (track: CatalogTrack) => void;
  onToggleCrate: () => void;
  onAddToCrate: (crateId: number) => void;
  onRemoveFromCrate: (crateId: number) => void;
  onToggleTrackCrate: (itemId: string) => void;
  onAddTrackToCrate: (itemId: string, crateId: number) => void;
  onRemoveTrackFromCrate: (itemId: string, crateId: number) => void;
}

export function AlbumCard({
  title,
  titleHref,
  artistName,
  artistSlug,
  artistUrl,
  imageUrl,
  bandcampUrl,
  tags,
  subtitle,
  tracks,
  playingTrackUrl,
  isPlayerPlaying,
  crateIds,
  itemCrateMap,
  userCrates,
  onPlayTrack,
  onToggleCrate,
  onAddToCrate,
  onRemoveFromCrate,
  onToggleTrackCrate,
  onAddTrackToCrate,
  onRemoveTrackFromCrate,
}: AlbumCardProps) {
  const musicHref = `/music/${artistSlug}`;
  const domain = getDomainIfDifferent(artistName, artistUrl);

  return (
    <div className="mx-4 my-2 rounded-lg border border-zinc-800">
      <div className="flex items-center gap-4 px-4 py-3">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="h-14 w-14 shrink-0 rounded" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-600">♫</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-zinc-100">
            {titleHref ? (
              <Link href={titleHref} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                {title}
              </Link>
            ) : (
              title
            )}
          </div>
          <div className="truncate text-sm text-zinc-400">
            <Link href={musicHref} className="hover:text-zinc-200 hover:underline" onClick={(e) => e.stopPropagation()}>
              {artistName}
            </Link>
            {domain && (
              <span className="text-zinc-600">
                {' · '}
                <Link href={musicHref} className="hover:text-zinc-200 hover:underline" onClick={(e) => e.stopPropagation()}>
                  {domain}
                </Link>
              </span>
            )}
            {subtitle && <span className="text-zinc-600">{' · '}{subtitle}</span>}
          </div>
          {tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {tags.slice(0, 4).map((tag) => (
                <TagPill key={tag} tag={tag} />
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <TrackActions
            isPlaying={false}
            hasStream={false}
            isInCrate={(crateIds?.length ?? 0) > 0}
            bandcampUrl={bandcampUrl}
            onPlay={() => {}}
            onToggleCrate={onToggleCrate}
            showPlayButton={false}
            crates={userCrates}
            itemCrateIds={crateIds}
            onAddToCrate={onAddToCrate}
            onRemoveFromCrate={onRemoveFromCrate}
          />
        </div>
      </div>

      {tracks.length > 0 && (
        <div className="border-t border-zinc-800/50">
          <TrackList
            tracks={tracks}
            playingTrackUrl={playingTrackUrl}
            isPlayerPlaying={isPlayerPlaying}
            fallbackUrl={bandcampUrl}
            crates={userCrates}
            itemCrateMap={itemCrateMap}
            onPlayTrack={onPlayTrack}
            onToggleCrate={onToggleTrackCrate}
            onAddToCrate={onAddTrackToCrate}
            onRemoveFromCrate={onRemoveTrackFromCrate}
          />
        </div>
      )}
    </div>
  );
}
