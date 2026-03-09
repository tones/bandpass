'use client';

import { useState, useCallback } from 'react';
import type { FeedItem } from '@/lib/bandcamp';
import type { ShortlistCatalogItem } from '@/lib/db/shortlist';
import { convertToUsd } from '@/lib/currency';
import { WaveformPlayer } from './feed/WaveformPlayer';
import { removeShortlistItem, clearAllShortlist } from '@/app/shortlist/actions';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', AUD: 'A$', CAD: 'C$', JPY: '¥',
};

function formatPrice(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency + ' ';
  const isSymbol = sym.length <= 2 || sym.endsWith('$');
  if (isSymbol) return `${sym}${amount.toFixed(2)}`;
  return `${sym} ${amount.toFixed(2)}`;
}

function proxyUrl(url: string): string {
  return `/api/audio-proxy?url=${encodeURIComponent(url)}`;
}

interface ShortlistViewProps {
  initialItems: FeedItem[];
  initialCatalogItems?: ShortlistCatalogItem[];
  exchangeRates?: Record<string, number>;
}

export function ShortlistView({
  initialItems,
  initialCatalogItems = [],
  exchangeRates = {},
}: ShortlistViewProps) {
  const [items, setItems] = useState(initialItems);
  const [catalogItems, setCatalogItems] = useState(initialCatalogItems);
  const [playingTrackUrl, setPlayingTrackUrl] = useState<string | null>(null);
  const [playingItem, setPlayingItem] = useState<FeedItem | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const totalCount = items.length + catalogItems.length;

  const handleRemove = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    removeShortlistItem(id);
  }, []);

  const handleRemoveCatalog = useCallback((shortlistId: string) => {
    setCatalogItems((prev) => prev.filter((item) => item.shortlistId !== shortlistId));
    removeShortlistItem(shortlistId);
  }, []);

  const handleClearAll = useCallback(() => {
    setItems([]);
    setCatalogItems([]);
    setConfirmClear(false);
    clearAllShortlist();
  }, []);

  const handleOpenAll = useCallback(() => {
    for (const item of items) {
      window.open(item.album.url, '_blank');
    }
    for (const item of catalogItems) {
      window.open(item.trackUrl ?? item.releaseUrl, '_blank');
    }
  }, [items, catalogItems]);

  const handlePlay = useCallback((item: FeedItem) => {
    if (item.track?.streamUrl) {
      setPlayingTrackUrl(item.track.streamUrl);
      setPlayingItem(item);
    }
  }, []);

  const handlePlayCatalog = useCallback((item: ShortlistCatalogItem) => {
    if (!item.streamUrl) return;
    setPlayingTrackUrl(item.streamUrl);
    setPlayingItem({
      id: item.shortlistId,
      storyType: 'new_release',
      date: new Date(),
      album: {
        id: 0,
        title: item.releaseTitle,
        url: item.releaseUrl,
        imageUrl: item.imageUrl,
      },
      artist: { id: 0, name: item.bandName, url: item.bandUrl },
      track: { title: item.trackTitle, duration: item.trackDuration, streamUrl: item.streamUrl },
      tags: [],
      price: null,
      socialSignal: { fan: null, alsoCollectedCount: 0 },
    });
  }, []);

  return (
    <div className="pb-24">
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <span className="text-sm text-zinc-400">
          {totalCount} {totalCount === 1 ? 'track' : 'tracks'}
        </span>
        <div className="flex items-center gap-3">
          {totalCount > 0 && (
            <>
              <button
                onClick={handleOpenAll}
                className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:bg-zinc-700"
              >
                Open all on Bandcamp
              </button>
              {confirmClear ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-400">Are you sure?</span>
                  <button
                    onClick={handleClearAll}
                    className="rounded bg-rose-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-rose-500"
                  >
                    Yes, clear all
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
                >
                  Clear all
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-lg text-zinc-500">Your shortlist is empty</p>
          <p className="mt-2 text-sm text-zinc-600">
            Heart tracks in your feed or on artist pages to add them here.
          </p>
          <a
            href="/feed"
            className="mt-4 inline-block rounded bg-zinc-800 px-4 py-2 text-sm text-zinc-200 transition-colors hover:bg-zinc-700"
          >
            Back to feed
          </a>
        </div>
      ) : (
        <div>
          {items.map((item) => {
            const isPlaying = playingTrackUrl === item.track?.streamUrl;
            const price = item.price;
            const usdAmount = price && price.currency !== 'USD'
              ? convertToUsd(price.amount, price.currency, exchangeRates)
              : price?.amount ?? null;

            return (
              <div
                key={item.id}
                className={`flex items-center gap-4 px-6 py-3 transition-colors hover:bg-zinc-900/50 ${
                  isPlaying ? 'bg-zinc-900/80' : ''
                }`}
              >
                <button
                  onClick={() => handlePlay(item)}
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
                  <div className="truncate font-medium">
                    {item.track?.title ?? item.album.title}
                  </div>
                  <div className="truncate text-sm text-zinc-400">
                    {item.artist.name}
                    <span className="text-zinc-600">
                      {' · '}{item.album.title}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {price && (
                    <div className="text-right">
                      <div className="text-xs text-zinc-400">
                        {usdAmount != null ? formatPrice(usdAmount, 'USD') : formatPrice(price.amount, price.currency)}
                      </div>
                      {price.currency !== 'USD' && usdAmount != null && (
                        <div className="text-[10px] text-zinc-600">
                          {formatPrice(price.amount, price.currency)}
                        </div>
                      )}
                    </div>
                  )}
                  <a
                    href={item.album.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
                  >
                    Buy
                  </a>
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="flex h-8 w-8 items-center justify-center rounded text-zinc-600 transition-colors hover:text-rose-400"
                    title="Remove from shortlist"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}

          {catalogItems.map((item) => {
            const isPlaying = playingTrackUrl === item.streamUrl && item.streamUrl != null;
            return (
              <div
                key={item.shortlistId}
                className={`flex items-center gap-4 px-6 py-3 transition-colors hover:bg-zinc-900/50 ${
                  isPlaying ? 'bg-zinc-900/80' : ''
                }`}
              >
                <button
                  onClick={() => handlePlayCatalog(item)}
                  disabled={!item.streamUrl}
                  className="group relative h-16 w-16 shrink-0 overflow-hidden rounded"
                >
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-zinc-600">♫</div>
                  )}
                  {item.streamUrl && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="text-xl">{isPlaying ? '⏸' : '▶'}</span>
                    </div>
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{item.trackTitle}</div>
                  <div className="truncate text-sm text-zinc-400">
                    {item.bandName}
                    <span className="text-zinc-600">
                      {' · '}{item.releaseTitle}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={item.trackUrl ?? item.releaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
                  >
                    Buy
                  </a>
                  <button
                    onClick={() => handleRemoveCatalog(item.shortlistId)}
                    className="flex h-8 w-8 items-center justify-center rounded text-zinc-600 transition-colors hover:text-rose-400"
                    title="Remove from shortlist"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {playingItem && playingTrackUrl && (
        <WaveformPlayer item={playingItem} trackUrl={playingTrackUrl} />
      )}
    </div>
  );
}
