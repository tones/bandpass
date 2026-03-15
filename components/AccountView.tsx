'use client';

import { useState } from 'react';
import { logout } from '@/app/logout/actions';
import { useSyncPolling } from '@/hooks/useSyncPolling';
import { formatDate } from '@/components/panes/shared';
import { UserItemCounts } from '@/components/panes/UserItemCounts';
import { UserSyncStatus } from '@/components/panes/UserSyncStatus';
import { GlobalSyncStatus } from '@/components/panes/GlobalSyncStatus';

interface AccountViewProps {
  username: string;
  totalItems: number;
  newReleases: number;
  friendPurchases: number;
  myPurchases: number;
  crateCount: number;
  purchaseItems: number;
  lastSyncAt: string | null;
  deepSyncComplete: boolean;
  collectionSynced: boolean;
  wishlistSynced: boolean;
  wishlistItemCount: number;
  oldestStoryDate: number | null;
}

export function AccountView({
  username,
  totalItems: initialTotal,
  newReleases: initialNewReleases,
  friendPurchases: initialFriendPurchases,
  myPurchases: initialMyPurchases,
  crateCount,
  purchaseItems: initialPurchaseItems,
  lastSyncAt: initialLastSync,
  deepSyncComplete: initialDeepComplete,
  collectionSynced: initialCollectionSynced,
  wishlistSynced: initialWishlistSynced,
  wishlistItemCount: initialWishlistCount,
  oldestStoryDate: initialOldestDate,
}: AccountViewProps) {
  const [totalItems, setTotalItems] = useState(initialTotal);
  const [lastSyncAt, setLastSyncAt] = useState(initialLastSync);
  const [deepSyncComplete, setDeepSyncComplete] = useState(initialDeepComplete);
  const [collectionSynced, setCollectionSynced] = useState(initialCollectionSynced);
  const [wishlistSynced, setWishlistSynced] = useState(initialWishlistSynced);
  const [oldestDate, setOldestDate] = useState(initialOldestDate);

  const [stopping, setStopping] = useState(false);

  const stopAudioAnalysis = async () => {
    setStopping(true);
    try {
      await fetch('/api/sync', { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to stop audio analysis:', err);
    }
  };

  const { state, isActive: anySyncing, triggerSync } = useSyncPolling({
    onSyncComplete() {
      setStopping(false);
    },
    onStateChange(s) {
      setTotalItems(s.totalItems);
      setLastSyncAt(s.lastSyncAt);
      setDeepSyncComplete(s.deepSyncComplete);
      setCollectionSynced(s.collectionSynced);
      setWishlistSynced(s.wishlistSynced);
      if (s.oldestStoryDate) setOldestDate(s.oldestStoryDate);
      if (!s.isAnalyzingAudio) setStopping(false);
    },
  });

  const isDeepSyncing = state?.isDeepSyncing ?? false;
  const isCollectionSyncing = state?.isCollectionSyncing ?? false;
  const isWishlistSyncing = state?.isWishlistSyncing ?? false;
  const isEnriching = state?.isEnriching ?? false;
  const enrichmentDoneCount = state?.enrichmentDoneCount ?? 0;
  const enrichmentPendingCount = state?.enrichmentPendingCount ?? null;
  const isAnalyzingAudio = state?.isAnalyzingAudio ?? false;
  const audioAnalysisPending = state?.audioAnalysisPending ?? null;
  const audioAnalysisDone = state?.audioAnalysisDone ?? 0;
  const audioErrors = state?.audioErrors ?? 0;
  const audioJobError = state?.audioJobError ?? null;
  const audioJobStatus = state?.audioJobStatus ?? null;
  const audioAnalysisEnabled = state?.audioAnalysisEnabled ?? false;
  const workerOnline = state?.workerOnline ?? false;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-zinc-100">Account</h1>

      <div className="mt-8 space-y-6">
        <div className="rounded-lg border border-zinc-800 p-4">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-600">Profile</h2>
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Username</span>
            <a
              href={`https://bandcamp.com/${username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-200 hover:text-white"
            >
              {username}
            </a>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 p-4 space-y-4">
          <UserItemCounts
            totalFeedItems={totalItems}
            newReleases={initialNewReleases}
            friendPurchases={initialFriendPurchases}
            myPurchases={initialMyPurchases}
            crateCount={crateCount}
            wishlistCount={initialWishlistCount}
          />
        </div>

        <div className="rounded-lg border border-zinc-800 p-4 space-y-4">
          <UserSyncStatus
            lastSyncAt={lastSyncAt}
            totalItems={totalItems}
            deepSyncComplete={deepSyncComplete}
            isDeepSyncing={isDeepSyncing}
            oldestStoryDate={oldestDate}
            collectionSynced={collectionSynced}
            isCollectionSyncing={isCollectionSyncing}
            purchaseCount={initialPurchaseItems}
            wishlistSynced={wishlistSynced}
            isWishlistSyncing={isWishlistSyncing}
            wishlistCount={initialWishlistCount}
          />
        </div>

        <div className="rounded-lg border border-zinc-800 p-4 space-y-4">
          <GlobalSyncStatus
            isEnriching={isEnriching}
            enrichmentDoneCount={enrichmentDoneCount}
            enrichmentPendingCount={enrichmentPendingCount}
            collectionSynced={collectionSynced}
            wishlistSynced={wishlistSynced}
            isAnalyzingAudio={isAnalyzingAudio}
            audioAnalysisPending={audioAnalysisPending}
            audioAnalysisDone={audioAnalysisDone}
            audioErrors={audioErrors}
            audioJobError={audioJobError}
            audioJobStatus={audioJobStatus}
            audioAnalysisEnabled={audioAnalysisEnabled}
            workerOnline={workerOnline}
            stopping={stopping}
          />
        </div>

        <div className="flex gap-3 border-t border-zinc-800 pt-6">
          <button
            onClick={triggerSync}
            disabled={anySyncing}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {anySyncing ? 'Syncing...' : 'Sync now'}
          </button>
          {isAnalyzingAudio && (
            <button
              onClick={stopAudioAnalysis}
              disabled={stopping}
              className="cursor-pointer rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-amber-400 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {stopping ? 'Stopping...' : 'Stop analysis'}
            </button>
          )}
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-zinc-700"
            >
              Log out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
