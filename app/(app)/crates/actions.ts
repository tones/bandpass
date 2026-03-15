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
  getCrateItems,
  getCrateCatalogItems,
  getCrateReleaseItems,
  getCrateWishlistItems,
  getWishlistItems,
  getCrates,
  getItemCrateMultiMap,
  getWishlistAlbumTracks,
} from '@/lib/db/crates';
import type { WishlistAlbumData, CrateReleaseItem } from '@/lib/db/crates';
import { BandcampAPI } from '@/lib/bandcamp/api';
import { syncWishlist } from '@/lib/db/sync';
import type { FeedItem, WishlistItem } from '@/lib/bandcamp/types/domain';
import type { Crate, CrateCatalogItem } from '@/lib/db/crates';

async function requireFanId(): Promise<number> {
  const session = await getSession();
  if (!session.fanId) throw new Error('Not authenticated');
  return session.fanId;
}

export async function toggleDefaultCrate(feedItemId: string): Promise<boolean> {
  const fanId = await requireFanId();
  const crateId = await ensureDefaultCrate(fanId);
  const existing = await getItemCrates(fanId, feedItemId);
  if (existing.includes(crateId)) {
    await removeFromCrate(crateId, fanId, feedItemId);
    return false;
  }
  await addToCrate(crateId, fanId, feedItemId);
  return true;
}

export async function addToCrateAction(crateId: number, feedItemId: string): Promise<void> {
  const fanId = await requireFanId();
  await addToCrate(crateId, fanId, feedItemId);
}

export async function removeFromCrateAction(crateId: number, feedItemId: string): Promise<void> {
  const fanId = await requireFanId();
  await removeFromCrate(crateId, fanId, feedItemId);
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
  items: FeedItem[];
  catalogItems: CrateCatalogItem[];
  releaseItems: CrateReleaseItem[];
  wishlistItems: WishlistItem[];
  albumTracks: Record<string, WishlistAlbumData>;
}

export async function getCrateItemsAction(crateId: number): Promise<CrateItemsResult> {
  const fanId = await requireFanId();
  const items = await getCrateItems(crateId, fanId);
  const catalogItems = await getCrateCatalogItems(crateId, fanId);
  const releaseItems = await getCrateReleaseItems(crateId, fanId);
  const wishlistItems = await getCrateWishlistItems(crateId, fanId);
  const albumUrls = wishlistItems.filter((i) => i.tralbumType === 'a').map((i) => i.itemUrl);
  const albumTracks = await getWishlistAlbumTracks(albumUrls);
  return { items, catalogItems, releaseItems, wishlistItems, albumTracks };
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

export async function getItemCratesAction(feedItemId: string): Promise<number[]> {
  const fanId = await requireFanId();
  return await getItemCrates(fanId, feedItemId);
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
