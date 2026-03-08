'use server';

import { getBandcamp } from '@/lib/bandcamp';
import type { FeedPage } from '@/lib/bandcamp';

export async function loadMoreFeed(olderThan: number): Promise<FeedPage> {
  const bandcamp = await getBandcamp();
  return bandcamp.getFeed({ olderThan });
}
