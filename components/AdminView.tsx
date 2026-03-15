'use client';

import { useState, useEffect } from 'react';
import type { AdminUser, AdminGlobalStats } from '@/lib/db/admin';
import { formatDate } from '@/components/panes/shared';
import { UserItemCounts } from '@/components/panes/UserItemCounts';
import { UserSyncStatus } from '@/components/panes/UserSyncStatus';
import { GlobalSyncStatus } from '@/components/panes/GlobalSyncStatus';

const POLL_INTERVAL_MS = 3000;

interface AdminViewProps {
  users: AdminUser[];
  globalStats: AdminGlobalStats;
}

function UserCard({ user }: { user: AdminUser }) {
  const displayName = user.username ?? `Fan ${user.fanId}`;
  const actuallySyncing = user.isSyncing && user.activeJobType != null;

  return (
    <div className="rounded-lg border border-zinc-800 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium text-zinc-100">{displayName}</h2>
          <p className="text-xs text-zinc-500">ID: {user.fanId}</p>
        </div>
        <div className="flex items-center gap-2">
          {actuallySyncing && (
            <span className="rounded-full bg-amber-400/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
              Syncing
            </span>
          )}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${user.hasCookie ? 'bg-emerald-400/10 text-emerald-400' : 'bg-zinc-700/50 text-zinc-500'}`}>
            {user.hasCookie ? 'Cookie stored' : 'No cookie'}
          </span>
        </div>
      </div>

      {user.lastVisitedAt && (
        <p className="mb-3 text-xs text-zinc-500">
          Last visited: {formatDate(user.lastVisitedAt)}
        </p>
      )}

      <div className="space-y-3">
        <UserSyncStatus
          lastSyncAt={user.lastSyncAt}
          totalItems={user.totalFeedItems}
          deepSyncComplete={user.deepSyncComplete}
          oldestStoryDate={user.oldestStoryDate}
          collectionSynced={user.collectionSynced}
          purchaseCount={user.myPurchases}
          wishlistSynced={user.wishlistSynced}
          wishlistCount={user.wishlistCount}
        />

        <UserItemCounts
          totalFeedItems={user.totalFeedItems}
          newReleases={user.newReleases}
          friendPurchases={user.friendPurchases}
          myPurchases={user.myPurchases}
          crateCount={user.crateCount}
          wishlistCount={user.wishlistCount}
        />
      </div>
    </div>
  );
}

export function AdminView({ users, globalStats: initialStats }: AdminViewProps) {
  const [globalStats, setGlobalStats] = useState(initialStats);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/admin/stats');
        if (!res.ok) return;
        const data = await res.json();
        setGlobalStats(data);
      } catch {
        // ignore fetch errors
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-zinc-100">Admin</h1>
      <p className="mt-1 text-sm text-zinc-500">{users.length} registered user{users.length !== 1 ? 's' : ''}</p>

      <div className="mt-8 rounded-lg border border-zinc-800 p-4">
        <GlobalSyncStatus
          isEnriching={globalStats.isEnriching}
          enrichmentDoneCount={globalStats.enrichmentDoneCount}
          enrichmentPendingCount={globalStats.enrichmentPendingCount}
          collectionSynced={true}
          wishlistSynced={true}
          isAnalyzingAudio={globalStats.isAnalyzingAudio}
          audioAnalysisPending={globalStats.audioAnalysisPending}
          audioAnalysisDone={globalStats.audioAnalysisDone}
          audioErrors={globalStats.audioErrors}
          audioJobError={globalStats.audioJobError}
          audioJobStatus={globalStats.audioJobStatus}
          audioAnalysisEnabled={globalStats.audioAnalysisEnabled}
          workerOnline={globalStats.workerOnline}
        />
      </div>

      <div className="mt-8 space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">Users</h2>
        {users.map((user) => (
          <UserCard key={user.fanId} user={user} />
        ))}
      </div>
    </div>
  );
}
