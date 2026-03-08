import { redirect } from 'next/navigation';
import { getIdentityCookie, getSession } from '@/lib/session';
import { getBandcamp } from '@/lib/bandcamp';
import { getExchangeRates } from '@/lib/currency';
import { getFeedItems, getTagCounts, getFriendCounts, getItemCount } from '@/lib/db/queries';
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
    } catch {
      redirect('/login');
    }
  }

  const exchangeRates = await getExchangeRates();
  const items = getFeedItems(fanId, { storyType: 'new_release' });
  const tags = getTagCounts(fanId);
  const friends = getFriendCounts(fanId);
  const totalItems = getItemCount(fanId);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">Bandpass</h1>
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
        exchangeRates={exchangeRates}
      />
    </main>
  );
}
