import type { FeedItem } from '@/lib/bandcamp';
import { extractSlug } from '@/lib/bandcamp/scraper';
import { convertToUsd } from '@/lib/currency';
import { TrackActions } from '@/components/TrackActions';

interface FeedItemCardProps {
  item: FeedItem;
  isShortlisted: boolean;
  isPlaying: boolean;
  onToggleShortlist: () => void;
  onPlay: () => void;
  exchangeRates?: Record<string, number>;
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

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
  CAD: 'C$',
  JPY: '¥',
  NZD: 'NZ$',
  CHF: 'CHF',
  SEK: 'SEK',
  NOK: 'NOK',
  DKK: 'DKK',
  BRL: 'R$',
  MXN: 'MX$',
};

function formatPrice(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency + ' ';
  const isSymbol = sym.length <= 2 || sym.endsWith('$');
  if (isSymbol) return `${sym}${amount.toFixed(2)}`;
  return `${sym} ${amount.toFixed(2)}`;
}

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
  exchangeRates = {},
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
          <span className="truncate font-medium">
            {item.track?.title ?? item.album.title}
          </span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STORY_BADGES[item.storyType]?.className ?? 'bg-zinc-800 text-zinc-400'}`}>
            {STORY_BADGES[item.storyType]?.label ?? item.storyType}
          </span>
          <span className="shrink-0 text-xs text-zinc-600">
            {formatRelativeDate(new Date(item.date))}
          </span>
        </div>
        <div className="truncate text-sm text-zinc-400">
          <a
            href={`/music/${extractSlug(item.artist.url)}`}
            className="hover:text-zinc-200 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {item.artist.name}
          </a>
          <span className="text-zinc-600">
            {' · '}{item.album.title}
            {item.track && ` (${formatDuration(item.track.duration)})`}
            {item.price && (() => {
              const { amount, currency } = item.price;
              const isUsd = currency === 'USD';
              const usdAmount = isUsd ? amount : convertToUsd(amount, currency, exchangeRates);
              const display = usdAmount != null ? formatPrice(usdAmount, 'USD') : formatPrice(amount, currency);
              return ` · ${display}`;
            })()}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-1.5">
          {[...new Set(item.tags)].sort().slice(0, 4).map((tag) => (
            <span key={tag} className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
              {tag}
            </span>
          ))}
          {signalText && (
            <span className="text-xs text-amber-500/80">{signalText}</span>
          )}
        </div>
      </div>

      <TrackActions
        isPlaying={isPlaying}
        hasStream={!!item.track?.streamUrl}
        isShortlisted={isShortlisted}
        bandcampUrl={item.album.url}
        onPlay={onPlay}
        onToggleShortlist={onToggleShortlist}
      />
    </div>
  );
}
