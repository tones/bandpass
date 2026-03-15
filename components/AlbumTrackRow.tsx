import type { CatalogTrack } from '@/lib/db/catalog';
import { formatDuration } from '@/lib/formatters';
import { TrackActions } from './TrackActions';
import type { CrateInfo } from './TrackActions';
import { BpmKeyBadge } from './BpmKeyBadge';

interface AlbumTrackRowProps {
  track: CatalogTrack;
  isActive: boolean;
  fallbackUrl: string;
  crates: CrateInfo[];
  crateIds?: number[];
  showCrate?: boolean;
  onPlay: () => void;
  onToggleCrate: () => void;
  onAddToCrate: (crateId: number) => void;
  onRemoveFromCrate: (crateId: number) => void;
}

export function AlbumTrackRow({
  track,
  isActive,
  fallbackUrl,
  crates,
  crateIds,
  showCrate,
  onPlay,
  onToggleCrate,
  onAddToCrate,
  onRemoveFromCrate,
}: AlbumTrackRowProps) {
  return (
    <div
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
        onClick={onPlay}
        disabled={!track.streamUrl}
      >
        {track.title}
      </button>
      <span className="shrink-0 text-xs tabular-nums text-zinc-600">
        {track.duration > 0 ? formatDuration(track.duration) : ''}
      </span>
      <BpmKeyBadge bpm={track.bpm} musicalKey={track.musicalKey} bpmStatus={track.bpmStatus} />
      <TrackActions
        isPlaying={isActive}
        hasStream={!!track.streamUrl}
        isInCrate={(crateIds?.length ?? 0) > 0}
        bandcampUrl={track.trackUrl ?? fallbackUrl}
        onPlay={onPlay}
        onToggleCrate={onToggleCrate}
        showCrate={showCrate}
        crates={crates}
        itemCrateIds={crateIds}
        onAddToCrate={onAddToCrate}
        onRemoveFromCrate={onRemoveFromCrate}
      />
    </div>
  );
}
