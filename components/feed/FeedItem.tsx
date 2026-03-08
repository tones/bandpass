// components/feed/FeedItem.tsx
import type { FeedItem } from '@/lib/bandcamp';
function convertToUsd(
  amount: number,
  fromCurrency: string,
  rates: Record<string, number>,
): number | null {
  if (fromCurrency === 'USD') return amount;
  const rate = rates[fromCurrency];
  if (!rate) return null;
  return Math.round((amount / rate) * 100) / 100;
}

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
  also_purchased: {
    label: 'Also purchased',
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
          {item.artist.name}
          <span className="text-zinc-600">
            {' · '}{item.album.title}
            {item.track && ` (${formatDuration(item.track.duration)})`}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-1.5">
          {[...new Set(item.tags)].slice(0, 4).map((tag) => (
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
        {item.price && (() => {
          const { amount, currency } = item.price;
          const isUsd = currency === 'USD';
          const usdAmount = isUsd ? amount : convertToUsd(amount, currency, exchangeRates);

          return (
            <div className="text-right">
              <div className="text-xs text-zinc-400">
                {usdAmount != null ? formatPrice(usdAmount, 'USD') : formatPrice(amount, currency)}
              </div>
              {!isUsd && usdAmount != null && (
                <div className="text-[10px] text-zinc-600">
                  {formatPrice(amount, currency)}
                </div>
              )}
            </div>
          );
        })()}
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
