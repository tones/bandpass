export const CURRENCY_SYMBOLS: Record<string, string> = {
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

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatPrice(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency + ' ';
  const isSymbol = sym.length <= 2 || sym.endsWith('$');
  if (isSymbol) return `${sym}${amount.toFixed(2)}`;
  return `${sym} ${amount.toFixed(2)}`;
}

export function proxyUrl(url: string, catalogTrackId?: number): string {
  let path = `/api/audio-proxy?url=${encodeURIComponent(url)}`;
  if (catalogTrackId) path += `&trackId=${catalogTrackId}`;
  return path;
}

import type { CatalogTrack, CatalogRelease } from '@/lib/db/catalog';
import type { FeedItem } from '@/lib/bandcamp/types/domain';

export function catalogTrackToFeedItem(track: CatalogTrack, release: CatalogRelease): FeedItem {
  return {
    id: `catalog-track-${track.id}`,
    storyType: 'new_release',
    date: new Date(),
    album: { id: release.id, title: release.title, url: release.url, imageUrl: release.imageUrl },
    artist: { id: 0, name: release.bandName, url: release.bandUrl },
    track: { title: track.title, duration: track.duration, streamUrl: track.streamUrl, catalogTrackId: track.id },
    tags: [],
    bpm: track.bpm,
    musicalKey: track.musicalKey,
    price: null,
    socialSignal: { fan: null, alsoCollectedCount: 0 },
  };
}
