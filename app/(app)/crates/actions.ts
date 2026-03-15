'use server';

import { getSession } from '@/lib/session';
import {
  addToCrate,
  removeFromCrate,
  clearCrate,
  createCrate,
  renameCrate,
  deleteCrate,
  ensureDefaultCrate,
  getItemCrates,
  getCrateCatalogItems,
  getCrateReleaseItems,
  getCrateWishlistItems,
  getWishlistItems,
  getCrates,
  getItemCrateMultiMap,
  getWishlistAlbumTracks,
} from '@/lib/db/crates';
import type { CrateItemRef, WishlistAlbumData, CrateReleaseItem } from '@/lib/db/crates';
import { ensureCatalogRelease } from '@/lib/db/catalog';
import { BandcampAPI } from '@/lib/bandcamp/api';
import { syncWishlist } from '@/lib/db/sync';
import type { WishlistItem } from '@/lib/bandcamp/types/domain';
import type { Crate, CrateCatalogItem } from '@/lib/db/crates';

async function requireFanId(): Promise<number> {
  const session = await getSession();
  if (!session.fanId) throw new Error('Not authenticated');
  return session.fanId;
}

export async function toggleDefaultCrate(ref: CrateItemRef): Promise<boolean> {
  const fanId = await requireFanId();
  const crateId = await ensureDefaultCrate(fanId);
  const existing = await getItemCrates(fanId, ref);
  if (existing.includes(crateId)) {
    await removeFromCrate(crateId, fanId, ref);
    return false;
  }
  await addToCrate(crateId, fanId, ref);
  return true;
}

export interface AlbumRef {
  url: string;
  title: string;
  imageUrl: string;
  artistName: string;
  artistUrl: string;
  bandcampId: number;
}

export async function toggleDefaultCrateForAlbum(album: AlbumRef): Promise<{ added: boolean; releaseId: number }> {
  const fanId = await requireFanId();
  const slug = album.artistUrl
    ? new URL(album.artistUrl).hostname.split('.')[0]
    : 'unknown';
  const releaseId = await ensureCatalogRelease(
    album.url,
    album.artistName,
    slug,
    album.title,
    album.imageUrl,
    album.bandcampId,
  );
  const ref: CrateItemRef = { releaseId };
  const crateId = await ensureDefaultCrate(fanId);
  const existing = await getItemCrates(fanId, ref);
  if (existing.includes(crateId)) {
    await removeFromCrate(crateId, fanId, ref);
    return { added: false, releaseId };
  }
  await addToCrate(crateId, fanId, ref);
  return { added: true, releaseId };
}

export async function addToCrateAction(crateId: number, ref: CrateItemRef): Promise<void> {
  const fanId = await requireFanId();
  await addToCrate(crateId, fanId, ref);
}

export async function addToCrateForAlbum(crateId: number, album: AlbumRef): Promise<number> {
  const fanId = await requireFanId();
  const slug = album.artistUrl
    ? new URL(album.artistUrl).hostname.split('.')[0]
    : 'unknown';
  const releaseId = await ensureCatalogRelease(
    album.url,
    album.artistName,
    slug,
    album.title,
    album.imageUrl,
    album.bandcampId,
  );
  await addToCrate(crateId, fanId, { releaseId });
  return releaseId;
}

export async function removeFromCrateAction(crateId: number, ref: CrateItemRef): Promise<void> {
  const fanId = await requireFanId();
  await removeFromCrate(crateId, fanId, ref);
}

export async function createCrateAction(name: string): Promise<number> {
  const fanId = await requireFanId();
  return await createCrate(fanId, name);
}

export async function renameCrateAction(crateId: number, name: string): Promise<void> {
  const fanId = await requireFanId();
  await renameCrate(crateId, fanId, name);
}

export async function deleteCrateAction(crateId: number): Promise<void> {
  const fanId = await requireFanId();
  await deleteCrate(crateId, fanId);
}

export async function clearCrateAction(crateId: number): Promise<void> {
  const fanId = await requireFanId();
  await clearCrate(crateId, fanId);
}

export interface CrateItemsResult {
  catalogItems: CrateCatalogItem[];
  releaseItems: CrateReleaseItem[];
  wishlistItems: WishlistItem[];
  albumTracks: Record<string, WishlistAlbumData>;
}

export async function getCrateItemsAction(crateId: number): Promise<CrateItemsResult> {
  const fanId = await requireFanId();
  const catalogItems = await getCrateCatalogItems(crateId, fanId);
  const releaseItems = await getCrateReleaseItems(crateId, fanId);
  const wishlistItems = await getCrateWishlistItems(crateId, fanId);
  const albumUrls = wishlistItems.filter((i) => i.tralbumType === 'a').map((i) => i.itemUrl);
  const albumTracks = await getWishlistAlbumTracks(albumUrls);
  return { catalogItems, releaseItems, wishlistItems, albumTracks };
}

export interface WishlistItemsResult {
  wishlistItems: WishlistItem[];
  albumTracks: Record<string, WishlistAlbumData>;
}

export async function getWishlistItemsAction(): Promise<WishlistItemsResult> {
  const fanId = await requireFanId();
  const wishlistItems = await getWishlistItems(fanId);
  const albumUrls = wishlistItems.filter((i) => i.tralbumType === 'a').map((i) => i.itemUrl);
  const albumTracks = await getWishlistAlbumTracks(albumUrls);
  return { wishlistItems, albumTracks };
}

export async function getCratesAction(): Promise<Crate[]> {
  const fanId = await requireFanId();
  return await getCrates(fanId);
}

export async function getItemCratesAction(ref: CrateItemRef): Promise<number[]> {
  const fanId = await requireFanId();
  return await getItemCrates(fanId, ref);
}

export async function getItemCrateMultiMapAction(): Promise<Record<string, number[]>> {
  const fanId = await requireFanId();
  return await getItemCrateMultiMap(fanId);
}

export async function refreshWishlistAction(): Promise<WishlistItemsResult> {
  const session = await getSession();
  if (!session.fanId || !session.identityCookie) throw new Error('Not authenticated');
  const api = new BandcampAPI(session.identityCookie);
  await syncWishlist(api, session.fanId);
  const wishlistItems = await getWishlistItems(session.fanId);
  const albumUrls = wishlistItems.filter((i) => i.tralbumType === 'a').map((i) => i.itemUrl);
  const albumTracks = await getWishlistAlbumTracks(albumUrls);
  return { wishlistItems, albumTracks };
}
