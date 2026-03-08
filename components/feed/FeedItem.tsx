// components/feed/FeedItem.tsx
import type { FeedItem } from '@/lib/bandcamp';

interface FeedItemCardProps {
  item: FeedItem;
  isShortlisted: boolean;
  isPlaying: boolean;
  onToggleShortlist: () => void;
  onPlay: () => void;
}

const STORY_LABELS: Record<string, string> = {
  friend_purchase: 'Friend purchased',
  new_release: 'New release',
  also_purchased: 'Also purchased',
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

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
  isShortlisted,
  isPlaying,
  onToggleShortlist,
  onPlay,
}: FeedItemCardProps) {
  const signal = item.socialSignal;
  const signalText = signal.fan
    ? signal.alsoCollectedCount > 0
      ? `${signal.fan.name} and ${signal.alsoCollectedCount} others`
      : signal.fan.name
    : signal.alsoCollectedCount > 0
      ? `${signal.alsoCollectedCount} collectors`
      : null;

  return (
    <div
      className={`flex items-center gap-4 px-6 py-3 transition-colors hover:bg-zinc-900/50 ${
        isPlaying ? 'bg-zinc-900/80' : ''
      }`}
    >
      <button
        onClick={onPlay}
        disabled={!item.track?.streamUrl}
        className="group relative h-16 w-16 shrink-0 overflow-hidden rounded"
      >
        <img src={item.album.imageUrl} alt="" className="h-full w-full object-cover" />
        {item.track?.streamUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="text-xl">{isPlaying ? '⏸' : '▶'}</span>
          </div>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium">{item.album.title}</span>
          <span className="shrink-0 text-xs text-zinc-500">
            {STORY_LABELS[item.storyType]}
          </span>
          <span className="shrink-0 text-xs text-zinc-600">
            {formatRelativeDate(new Date(item.date))}
          </span>
        </div>
        <div className="truncate text-sm text-zinc-400">
          {item.artist.name}
          {item.track && (
            <span className="text-zinc-600">
              {' · '}{item.track.title} ({formatDuration(item.track.duration)})
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-1.5">
          {item.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
              {tag}
            </span>
          ))}
          {signalText && (
            <span className="text-xs text-amber-500/80">{signalText}</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {item.price && (
          <span className="text-xs text-zinc-500">
            {item.price.currency === 'USD' ? '$' : item.price.currency}{' '}
            {item.price.amount}
          </span>
        )}
        <button
          onClick={onToggleShortlist}
          className={`rounded p-1.5 text-lg transition-colors ${
            isShortlisted
              ? 'text-rose-400 hover:text-rose-300'
              : 'text-zinc-600 hover:text-zinc-400'
          }`}
          title={isShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
        >
          {isShortlisted ? '♥' : '♡'}
        </button>
        <a
          href={item.album.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded p-1.5 text-sm text-zinc-600 hover:text-zinc-400"
          title="Open on Bandcamp"
        >
          ↗
        </a>
      </div>
    </div>
  );
}
