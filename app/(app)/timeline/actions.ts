'use server';

import { getUser } from '@/lib/auth';
import { getFeedItems, getTagCounts, getFriendCounts, getItemCount, getAlbumTracksForFeedItems } from '@/lib/db/queries';
import type { FeedFilters } from '@/lib/db/queries';
import type { FeedItem } from '@/lib/bandcamp';
import type { CatalogTrack } from '@/lib/db/catalog';

export interface FeedQueryResult {
  items: FeedItem[];
  totalItems: number;
  tags: { name: string; count: number }[];
  friends: { name: string; username: string; count: number }[];
  albumTracksMap: Record<string, CatalogTrack[]>;
}

export async function queryFeed(filters: FeedFilters): Promise<FeedQueryResult> {
  const user = await getUser();
  if (!user?.fanId) throw new Error('Not authenticated');

  const fanId = user.fanId;
  const items = await getFeedItems(fanId, filters);
  const tags = await getTagCounts(fanId);
  const friends = await getFriendCounts(fanId);
  const totalItems = await getItemCount(fanId);
  const albumUrls = [...new Set(items.map((i) => i.album.url).filter(Boolean))];
  const albumTracksMap = albumUrls.length > 0 ? await getAlbumTracksForFeedItems(albumUrls) : {};

  return { items, totalItems, tags, friends, albumTracksMap };
}
