import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getIdentityCookie, getSession } from '@/lib/session';
import { getBandcamp } from '@/lib/bandcamp';
import { getExchangeRates } from '@/lib/currency';
import { getFeedItems, getTagCounts, getFriendCounts, getItemCount } from '@/lib/db/queries';
import { getSyncState } from '@/lib/db/sync';
import { getAllCrateItemIds, getCrates, getItemCrateMultiMap } from '@/lib/db/crates';
import { FeedView } from '@/components/feed/FeedView';
import { AppHeader } from '@/components/AppHeader';

export const metadata: Metadata = { title: 'Timeline' };

interface FeedPageProps {
  searchParams: Promise<{ tag?: string; type?: string; friend?: string }>;
}

export default async function FeedPage({ searchParams }: FeedPageProps) {
  const { tag: initialTag, type: initialType, friend: initialFriend } = await searchParams;
  const cookie = await getIdentityCookie();
  const session = await getSession();
  const username = session.username ?? null;

  if (!cookie) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <AppHeader username={username} />
        <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
          <p className="text-lg text-zinc-400">Log in to see your Bandcamp feed</p>
          <a
            href="/login"
            className="mt-4 rounded-lg bg-amber-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
          >
            Log in
          </a>
        </div>
      </main>
    );
  }

  let fanId = session.fanId;

  if (!fanId) {
    try {
      const api = await getBandcamp();
      fanId = await api.getFanId();
      session.fanId = fanId;
      await session.save();
    } catch (err) {
      console.error('Failed to fetch fanId, redirecting to login:', err);
      redirect('/login');
    }
  }

  const syncState = getSyncState(fanId);
  const exchangeRates = await getExchangeRates();
  const validTypes = ['new_release', 'friend_purchase', 'my_purchase'] as const;
  const storyType = validTypes.find((t) => t === initialType);
  const items = syncState?.lastSyncAt ? getFeedItems(fanId, { tag: initialTag, storyType, friendUsername: initialFriend }) : [];
  const tags = syncState?.lastSyncAt ? getTagCounts(fanId) : [];
  const friends = syncState?.lastSyncAt ? getFriendCounts(fanId) : [];
  const totalItems = syncState?.lastSyncAt ? getItemCount(fanId) : 0;
  const crateItemIds = syncState?.lastSyncAt ? getAllCrateItemIds(fanId) : new Set<string>();
  const crates = syncState?.lastSyncAt ? getCrates(fanId).filter((c) => c.source === 'user') : [];
  const itemCrateMap = syncState?.lastSyncAt ? getItemCrateMultiMap(fanId) : {};

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader username={username} />
      <FeedView
        initialItems={items}
        initialTotalItems={totalItems}
        initialTags={tags}
        initialFriends={friends}
        initialCrateItemIds={[...crateItemIds]}
        initialCrates={crates}
        initialItemCrateMap={itemCrateMap}
        oldestStoryDate={syncState?.oldestStoryDate ?? null}
        exchangeRates={exchangeRates}
        initialTag={initialTag}
        initialType={storyType}
        initialFriend={initialFriend}
      />
    </main>
  );
}
