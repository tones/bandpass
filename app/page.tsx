import { redirect } from 'next/navigation';
import { getIdentityCookie, getSession } from '@/lib/session';
import { getBandcamp } from '@/lib/bandcamp';
import { getExchangeRates } from '@/lib/currency';
import { getFeedItems, getTagCounts, getFriendCounts, getItemCount } from '@/lib/db/queries';
import { getSyncState } from '@/lib/db/sync';
import { getShortlist, getShortlistCount } from '@/lib/db/shortlist';
import { FeedView } from '@/components/feed/FeedView';
import { LogoutButton } from '@/components/LogoutButton';

export default async function Home() {
  const cookie = await getIdentityCookie();
  if (!cookie) redirect('/login');

  const session = await getSession();
  const username = session.username;
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
  const items = syncState?.lastSyncAt ? getFeedItems(fanId, { storyType: 'new_release' }) : [];
  const tags = syncState?.lastSyncAt ? getTagCounts(fanId) : [];
  const friends = syncState?.lastSyncAt ? getFriendCounts(fanId) : [];
  const totalItems = syncState?.lastSyncAt ? getItemCount(fanId) : 0;
  const shortlistIds = syncState?.lastSyncAt ? getShortlist(fanId) : new Set<string>();
  const shortlistCount = syncState?.lastSyncAt ? getShortlistCount(fanId) : 0;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold tracking-tight">Bandpass</h1>
          <a
            href="/shortlist"
            className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-sm text-rose-400 transition-colors hover:bg-zinc-700"
          >
            <span>♥</span>
            <span>{shortlistCount > 0 ? shortlistCount : 'Shortlist'}</span>
          </a>
        </div>
        <div className="flex items-center gap-3">
          {username && (
            <a
              href={`https://bandcamp.com/${username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-zinc-400 hover:text-zinc-200"
            >
              {username}
            </a>
          )}
          <LogoutButton />
        </div>
      </header>
      <FeedView
        initialItems={items}
        initialTotalItems={totalItems}
        initialTags={tags}
        initialFriends={friends}
        initialShortlist={[...shortlistIds]}
        oldestStoryDate={syncState?.oldestStoryDate ?? null}
        exchangeRates={exchangeRates}
      />
    </main>
  );
}
