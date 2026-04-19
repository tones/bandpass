import type { Metadata } from 'next';
import { getUser } from '@/lib/auth';
import { getExchangeRates } from '@/lib/currency';
import { getFeedItems, getTagCounts, getFriendCounts, getItemCount, getAlbumTracksForFeedItems } from '@/lib/db/queries';
import { getSyncState } from '@/lib/db/sync';
import { getAllCrateItemIds, getCrates, getItemCrateMultiMap } from '@/lib/db/crates';
import { FeedView } from '@/components/feed/FeedView';

export const metadata: Metadata = { title: 'Timeline' };

interface FeedPageProps {
  searchParams: Promise<{ tag?: string; type?: string; friend?: string }>;
}

export default async function FeedPage({ searchParams }: FeedPageProps) {
  const { tag: initialTag, type: initialType, friend: initialFriend } = await searchParams;
  const user = await getUser();

  if (!user?.fanId) {
    return (
      <main className="min-h-screen">
        <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
          <p className="text-lg text-zinc-400">
            {user ? 'Connect your Bandcamp account in settings to see your feed.' : 'Log in to see your Bandcamp feed.'}
          </p>
          <a
            href={user ? '/account' : '/login'}
            className="mt-4 rounded-lg bg-amber-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
          >
            {user ? 'Go to settings' : 'Log in'}
          </a>
        </div>
      </main>
    );
  }

  const fanId = user.fanId;
  const syncState = await getSyncState(fanId);
  const exchangeRates = await getExchangeRates();
  const validTypes = ['new_release', 'friend_purchase', 'my_purchase'] as const;
  const storyType = validTypes.find((t) => t === initialType);
  const items = syncState?.lastSyncAt ? await getFeedItems(fanId, { tag: initialTag, storyType, friendUsername: initialFriend }) : [];
  const tags = syncState?.lastSyncAt ? await getTagCounts(fanId) : [];
  const friends = syncState?.lastSyncAt ? await getFriendCounts(fanId) : [];
  const totalItems = syncState?.lastSyncAt ? await getItemCount(fanId) : 0;
  const crateItemIds = syncState?.lastSyncAt ? await getAllCrateItemIds(fanId) : new Set<string>();
  const crates = syncState?.lastSyncAt ? (await getCrates(fanId)).filter((c) => c.source === 'user') : [];
  const itemCrateMap = syncState?.lastSyncAt ? await getItemCrateMultiMap(fanId) : {};
  const albumUrls = [...new Set(items.map((i) => i.album.url).filter(Boolean))];
  const albumTracksMap = albumUrls.length > 0 ? await getAlbumTracksForFeedItems(albumUrls) : {};

  return (
    <main className="min-h-screen">
      <FeedView
        initialItems={items}
        initialTotalItems={totalItems}
        initialTags={tags}
        initialFriends={friends}
        initialCrateItemIds={[...crateItemIds]}
        initialCrates={crates}
        initialItemCrateMap={itemCrateMap}
        initialAlbumTracksMap={albumTracksMap}
        oldestStoryDate={syncState?.oldestStoryDate ?? null}
        exchangeRates={exchangeRates}
        initialTag={initialTag}
        initialType={storyType}
        initialFriend={initialFriend}
      />
    </main>
  );
}
