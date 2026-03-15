import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSyncState } from '@/lib/db/sync';
import { getItemCount, getItemCountByType } from '@/lib/db/queries';
import { getWishlistItemCount } from '@/lib/db/crates';
import { AccountView } from '@/components/AccountView';

export const metadata: Metadata = { title: 'Account' };

export default async function AccountPage() {
  const session = await getSession();

  if (!session.fanId || !session.identityCookie) {
    redirect('/login');
  }

  const fanId = session.fanId;
  const syncState = await getSyncState(fanId);
  const totalItems = await getItemCount(fanId);
  const purchaseItems = await getItemCountByType(fanId, 'my_purchase');
  const wishlistItemCount = await getWishlistItemCount(fanId);

  const username = session.username ?? 'Unknown';

  return (
    <main className="min-h-screen">
      <AccountView
        username={username}
        totalItems={totalItems}
        purchaseItems={purchaseItems}
        lastSyncAt={syncState?.lastSyncAt ?? null}
        deepSyncComplete={syncState?.deepSyncComplete ?? false}
        collectionSynced={syncState?.collectionSynced ?? false}
        wishlistSynced={syncState?.wishlistSynced ?? false}
        wishlistItemCount={wishlistItemCount}
        oldestStoryDate={syncState?.oldestStoryDate ?? null}
      />
    </main>
  );
}
