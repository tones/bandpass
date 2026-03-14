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
import type { FeedItem, WishlistItem } from '@/lib/bandcamp/types/domain';
import type { CrateCatalogItem, CrateReleaseItem } from '@/lib/db/crates';

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

export function feedItemToPseudoRelease(item: FeedItem): CatalogRelease {
  return {
    id: 0,
    bandSlug: '',
    bandName: item.artist.name,
    bandUrl: item.artist.url,
    title: item.album.title,
    url: item.album.url,
    imageUrl: item.album.imageUrl,
    releaseType: 'album',
    scrapedAt: '',
    releaseDate: null,
    tags: [],
  };
}

export function catalogItemToFeedItem(item: CrateCatalogItem): FeedItem {
  return {
    id: item.crateItemId,
    storyType: 'new_release',
    date: new Date(),
    album: { id: 0, title: item.releaseTitle, url: item.releaseUrl, imageUrl: item.imageUrl },
    artist: { id: 0, name: item.bandName, url: item.bandUrl },
    track: { title: item.trackTitle, duration: item.trackDuration, streamUrl: item.streamUrl },
    tags: [],
    bpm: item.bpm ?? null,
    musicalKey: item.musicalKey ?? null,
    price: null,
    socialSignal: { fan: null, alsoCollectedCount: 0 },
  };
}

export function wishlistItemToFeedItem(item: WishlistItem): FeedItem {
  return {
    id: item.id,
    storyType: 'new_release',
    date: new Date(),
    album: { id: item.tralbumId, title: item.title, url: item.itemUrl, imageUrl: item.imageUrl },
    artist: { id: 0, name: item.artistName, url: item.artistUrl },
    track: {
      title: item.featuredTrackTitle ?? item.title,
      duration: item.featuredTrackDuration ?? 0,
      streamUrl: item.streamUrl,
    },
    tags: [],
    bpm: item.bpm ?? null,
    musicalKey: item.musicalKey ?? null,
    price: null,
    socialSignal: { fan: null, alsoCollectedCount: item.alsoCollectedCount },
  };
}

export function crateReleaseToRelease(release: CrateReleaseItem): CatalogRelease {
  return {
    id: release.releaseId,
    bandSlug: release.bandSlug,
    bandName: release.bandName,
    bandUrl: release.bandUrl,
    title: release.releaseTitle,
    url: release.releaseUrl,
    imageUrl: release.imageUrl,
    releaseType: release.releaseType,
    scrapedAt: '',
    releaseDate: release.releaseDate,
    tags: release.tags,
  };
}
