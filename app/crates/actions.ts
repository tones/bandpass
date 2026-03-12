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
  getCrateWishlistItems,
  getWishlistItems,
  getCrates,
  getItemCrateMultiMap,
} from '@/lib/db/crates';
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
  const crateId = ensureDefaultCrate(fanId);
  const existing = getItemCrates(fanId, feedItemId);
  if (existing.includes(crateId)) {
    removeFromCrate(crateId, fanId, feedItemId);
    return false;
  }
  addToCrate(crateId, fanId, feedItemId);
  return true;
}

export async function addToCrateAction(crateId: number, feedItemId: string): Promise<void> {
  const fanId = await requireFanId();
  addToCrate(crateId, fanId, feedItemId);
}

export async function removeFromCrateAction(crateId: number, feedItemId: string): Promise<void> {
  const fanId = await requireFanId();
  removeFromCrate(crateId, fanId, feedItemId);
}

export async function createCrateAction(name: string): Promise<number> {
  const fanId = await requireFanId();
  return createCrate(fanId, name);
}

export async function renameCrateAction(crateId: number, name: string): Promise<void> {
  const fanId = await requireFanId();
  renameCrate(crateId, fanId, name);
}

export async function deleteCrateAction(crateId: number): Promise<void> {
  const fanId = await requireFanId();
  deleteCrate(crateId, fanId);
}

export async function clearCrateAction(crateId: number): Promise<void> {
  const fanId = await requireFanId();
  clearCrate(crateId, fanId);
}

export interface CrateItemsResult {
  items: FeedItem[];
  catalogItems: CrateCatalogItem[];
  wishlistItems: WishlistItem[];
}

export async function getCrateItemsAction(crateId: number): Promise<CrateItemsResult> {
  const fanId = await requireFanId();
  const items = getCrateItems(crateId, fanId);
  const catalogItems = getCrateCatalogItems(crateId, fanId);
  const wishlistItems = getCrateWishlistItems(crateId, fanId);
  return { items, catalogItems, wishlistItems };
}

export async function getWishlistItemsAction(): Promise<WishlistItem[]> {
  const fanId = await requireFanId();
  return getWishlistItems(fanId);
}

export async function getCratesAction(): Promise<Crate[]> {
  const fanId = await requireFanId();
  return getCrates(fanId);
}

export async function getItemCratesAction(feedItemId: string): Promise<number[]> {
  const fanId = await requireFanId();
  return getItemCrates(fanId, feedItemId);
}

export async function getItemCrateMultiMapAction(): Promise<Record<string, number[]>> {
  const fanId = await requireFanId();
  return getItemCrateMultiMap(fanId);
}

export async function refreshWishlistAction(): Promise<WishlistItem[]> {
  const session = await getSession();
  if (!session.fanId || !session.identityCookie) throw new Error('Not authenticated');
  const api = new BandcampAPI(session.identityCookie);
  await syncWishlist(api, session.fanId);
  return getWishlistItems(session.fanId);
}
