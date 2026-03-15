import Link from 'next/link';
import type { FeedItem } from '@/lib/bandcamp';
import type { CatalogTrack } from '@/lib/db/catalog';
import type { CrateItemRef } from '@/lib/crate-utils';
import { extractSlug, getDomainIfDifferent } from '@/lib/bandcamp/scraper';
import { convertToUsd } from '@/lib/currency';
import { formatDuration, formatPrice } from '@/lib/formatters';
import { TrackActions } from '@/components/TrackActions';
import type { CrateInfo } from '@/components/TrackActions';
import { TrackList } from '@/components/TrackList';
import { TagPill } from '@/components/TagPill';
import { BpmKeyBadge } from '@/components/BpmKeyBadge';

export interface AlbumTrackContext {
  tracks: CatalogTrack[];
  playingTrackUrl: string | null;
  isPlayerPlaying: boolean;
  itemCrateMap: Record<string, number[]>;
  onPlayTrack: (track: CatalogTrack) => void;
  onToggleCrate: (key: string, ref: CrateItemRef) => void;
  onAddToCrate: (key: string, ref: CrateItemRef, crateId: number) => void;
  onRemoveFromCrate: (key: string, ref: CrateItemRef, crateId: number) => void;
}

interface FeedItemCardProps {
  item: FeedItem;
  isInCrate: boolean;
  isPlaying: boolean;
  onToggleCrate: () => void;
  onPlay: () => void;
  exchangeRates?: Record<string, number>;
  crates?: CrateInfo[];
  itemCrateIds?: number[];
  onAddToCrate?: (crateId: number) => void;
  onRemoveFromCrate?: (crateId: number) => void;
  variant?: 'feed' | 'crate';
  albumTrackContext?: AlbumTrackContext;
}

const STORY_BADGES: Record<string, { label: string; className: string }> = {
  friend_purchase: {
    label: 'Friend purchased',
    className: 'bg-sky-500/15 text-sky-400',
  },
  new_release: {
    label: 'New release',
    className: 'bg-emerald-500/15 text-emerald-400',
  },
  my_purchase: {
    label: 'My purchase',
    className: 'bg-violet-500/15 text-violet-400',
  },
};

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 2) return 'yesterday';

  const day = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (date.getFullYear() !== now.getFullYear()) {
    return `${day}, ${date.getFullYear()}`;
  }
  return day;
}

export function FeedItemCard({
  item,
  isInCrate,
  isPlaying,
  onToggleCrate,
  onPlay,
  exchangeRates = {},
  crates,
  itemCrateIds,
  onAddToCrate,
  onRemoveFromCrate,
  variant = 'feed',
  albumTrackContext,
}: FeedItemCardProps) {
  const isCrate = variant === 'crate';

  const signal = item.socialSignal;
  const signalText = signal.fan
    ? signal.alsoCollectedCount > 0
      ? `${signal.fan.name} and ${signal.alsoCollectedCount} others`
      : signal.fan.name
    : null;

  const albumTracks = albumTrackContext?.tracks;
  const hasAlbumTracks = albumTracks && albumTracks.length > 1;

  const priceDisplay = item.price ? (() => {
    const { amount, currency } = item.price;
    const usdAmount = currency === 'USD' ? amount : convertToUsd(amount, currency, exchangeRates);
    return usdAmount != null ? formatPrice(usdAmount, 'USD') : formatPrice(amount, currency);
  })() : null;

  return (
    <div>
      <div
        className={`flex items-center gap-4 px-6 py-3 transition-colors hover:bg-zinc-900/50 ${
          isPlaying ? 'bg-zinc-900/80' : ''
        }`}
      >
        <button
          onClick={onPlay}
          disabled={!item.track?.streamUrl}
          className="group relative h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded"
        >
          <img src={item.album.imageUrl} alt={item.album.title} className="h-full w-full object-cover" />
          {item.track?.streamUrl && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="text-xl">{isPlaying ? '⏸' : '▶'}</span>
            </div>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-medium">
              {hasAlbumTracks ? item.album.title : (item.track?.title ?? item.album.title)}
            </span>
            {!isCrate && (
              <>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STORY_BADGES[item.storyType]?.className ?? 'bg-zinc-800 text-zinc-400'}`}>
                  {STORY_BADGES[item.storyType]?.label ?? item.storyType}
                </span>
                <span className="shrink-0 text-xs text-zinc-600">
                  {formatRelativeDate(new Date(item.date))}
                </span>
              </>
            )}
          </div>
          <div className="truncate text-sm text-zinc-400">
            <Link
              href={`/music/${extractSlug(item.artist.url)}`}
              className="hover:text-zinc-200 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {item.artist.name}
            </Link>
            {getDomainIfDifferent(item.artist.name, item.artist.url) && (
              <span className="text-zinc-600">
                {' · '}<Link href={`/music/${extractSlug(item.artist.url)}`} className="hover:text-zinc-200 hover:underline" onClick={(e) => e.stopPropagation()}>{getDomainIfDifferent(item.artist.name, item.artist.url)}</Link>
              </span>
            )}
            {!hasAlbumTracks && (
              <span className="text-zinc-600">
                {' · '}{item.album.title}
                {item.track && ` (${formatDuration(item.track.duration)})`}
                {priceDisplay && ` · ${priceDisplay}`}
              </span>
            )}
            {hasAlbumTracks && (
              <span className="text-zinc-600">
                {' · '}{albumTracks.length} tracks
                {priceDisplay && ` · ${priceDisplay}`}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {[...new Set(item.tags)].sort().slice(0, 4).map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
            {!hasAlbumTracks && <BpmKeyBadge bpm={item.bpm} musicalKey={item.musicalKey} bpmStatus={item.bpmStatus} />}
            {!isCrate && signalText && (
              <span className="text-xs text-amber-500/80">{signalText}</span>
            )}
          </div>
        </div>

        <TrackActions
          isPlaying={isPlaying}
          hasStream={!!item.track?.streamUrl}
          isInCrate={isInCrate}
          bandcampUrl={item.album.url}
          onPlay={onPlay}
          onToggleCrate={onToggleCrate}
          crates={crates}
          itemCrateIds={itemCrateIds}
          onAddToCrate={onAddToCrate}
          onRemoveFromCrate={onRemoveFromCrate}
        />
      </div>

      {hasAlbumTracks && albumTrackContext && (
        <div className="ml-6 border-l border-zinc-800/50 pl-2">
          <TrackList
            tracks={albumTracks}
            playingTrackUrl={albumTrackContext.playingTrackUrl}
            isPlayerPlaying={albumTrackContext.isPlayerPlaying}
            fallbackUrl={item.album.url}
            crates={crates ?? []}
            itemCrateMap={albumTrackContext.itemCrateMap}
            onPlayTrack={albumTrackContext.onPlayTrack}
            onToggleCrate={albumTrackContext.onToggleCrate}
            onAddToCrate={albumTrackContext.onAddToCrate}
            onRemoveFromCrate={albumTrackContext.onRemoveFromCrate}
          />
        </div>
      )}
    </div>
  );
}
