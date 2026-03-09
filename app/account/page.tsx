import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSyncState } from '@/lib/db/sync';
import { getItemCount, getItemCountByType } from '@/lib/db/queries';
import { AppHeader } from '@/components/AppHeader';
import { AccountView } from '@/components/AccountView';

export default async function AccountPage() {
  const session = await getSession();
  const username = session.username ?? null;

  if (!session.fanId || !session.identityCookie) {
    redirect('/login');
  }

  const fanId = session.fanId;
  const syncState = getSyncState(fanId);
  const totalItems = getItemCount(fanId);
  const feedItems = getItemCountByType(fanId, 'new_release') + getItemCountByType(fanId, 'friend_purchase');
  const purchaseItems = getItemCountByType(fanId, 'my_purchase');

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader activeTab="feed" username={username} />
      <AccountView
        username={username ?? 'Unknown'}
        totalItems={totalItems}
        feedItems={feedItems}
        purchaseItems={purchaseItems}
        lastSyncAt={syncState?.lastSyncAt ?? null}
        deepSyncComplete={syncState?.deepSyncComplete ?? false}
        collectionSynced={syncState?.collectionSynced ?? false}
        oldestStoryDate={syncState?.oldestStoryDate ?? null}
      />
    </main>
  );
}
