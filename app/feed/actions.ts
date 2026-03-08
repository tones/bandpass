'use server';

import { getSession } from '@/lib/session';
import { getFeedItems, getTagCounts, getFriendCounts, getItemCount } from '@/lib/db/queries';
import type { FeedFilters } from '@/lib/db/queries';
import type { FeedItem } from '@/lib/bandcamp';

export interface FeedQueryResult {
  items: FeedItem[];
  totalItems: number;
  tags: { name: string; count: number }[];
  friends: { name: string; username: string; count: number }[];
}

export async function queryFeed(filters: FeedFilters): Promise<FeedQueryResult> {
  const session = await getSession();
  if (!session.fanId) throw new Error('Not authenticated');

  const fanId = session.fanId;
  const items = getFeedItems(fanId, filters);
  const tags = getTagCounts(fanId);
  const friends = getFriendCounts(fanId);
  const totalItems = getItemCount(fanId);

  return { items, totalItems, tags, friends };
}
