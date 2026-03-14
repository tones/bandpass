import { TagPill } from '@/components/TagPill';
import { BpmKeyBadge } from '@/components/BpmKeyBadge';
import { TrackActions } from '@/components/TrackActions';
import type { CrateInfo } from '@/components/TrackActions';

export interface CrateItemRowProps {
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

export function CrateItemRow({
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
