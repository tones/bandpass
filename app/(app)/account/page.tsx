import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { getSyncState } from '@/lib/db/sync';
import { getFeedTypeCounts, getCrateCount } from '@/lib/db/queries';
import { getWishlistItemCount } from '@/lib/db/crates';
import { AccountView } from '@/components/AccountView';

export const metadata: Metadata = { title: 'Account' };

export default async function AccountPage() {
  const user = await getUser();

  if (!user) {
    redirect('/login');
  }

  const fanId = user.fanId;
  const hasBandcamp = fanId != null;

  const [syncState, feedCounts, crateCount, wishlistItemCount] = hasBandcamp
    ? await Promise.all([
        getSyncState(fanId),
        getFeedTypeCounts(fanId),
        getCrateCount(fanId),
        getWishlistItemCount(fanId),
      ])
    : [null, { total: 0, newReleases: 0, friendPurchases: 0, myPurchases: 0 }, 0, 0];

  const displayName = user.username ?? user.name ?? 'Unknown';

  return (
    <main className="min-h-screen">
      <AccountView
        username={displayName}
        email={user.email}
        avatarUrl={user.avatarUrl}
        hasBandcamp={hasBandcamp}
        bandcampCookiePresent={!!user.bandcampCookie}
        totalItems={feedCounts.total}
        newReleases={feedCounts.newReleases}
        friendPurchases={feedCounts.friendPurchases}
        myPurchases={feedCounts.myPurchases}
        crateCount={crateCount}
        purchaseItems={feedCounts.myPurchases}
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
