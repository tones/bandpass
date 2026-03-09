'use server';

import { getSession } from '@/lib/session';
import {
  addToShortlist,
  removeFromShortlist,
  clearShortlist,
  isShortlisted,
} from '@/lib/db/shortlist';

async function requireFanId(): Promise<number> {
  const session = await getSession();
  if (!session.fanId) throw new Error('Not authenticated');
  return session.fanId;
}

export async function toggleShortlistItem(feedItemId: string): Promise<boolean> {
  const fanId = await requireFanId();
  if (isShortlisted(fanId, feedItemId)) {
    removeFromShortlist(fanId, feedItemId);
    return false;
  }
  addToShortlist(fanId, feedItemId);
  return true;
}

export async function removeShortlistItem(feedItemId: string): Promise<void> {
  const fanId = await requireFanId();
  removeFromShortlist(fanId, feedItemId);
}

export async function clearAllShortlist(): Promise<void> {
  const fanId = await requireFanId();
  clearShortlist(fanId);
}
