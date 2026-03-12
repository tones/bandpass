'use client';

import { useState } from 'react';
import { logout } from '@/app/logout/actions';
import { useSyncPolling } from '@/hooks/useSyncPolling';

interface AccountViewProps {
  username: string;
  totalItems: number;
  purchaseItems: number;
  lastSyncAt: string | null;
  deepSyncComplete: boolean;
  collectionSynced: boolean;
  wishlistSynced: boolean;
  wishlistItemCount: number;
  oldestStoryDate: number | null;
}

function formatDate(dateStr: string): string {
  const normalized = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
  const d = new Date(normalized);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function formatOldestDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function AccountView({
  username,
  totalItems: initialTotal,
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

  const { state, isActive: anySyncing, triggerSync } = useSyncPolling({
    onStateChange(s) {
      setTotalItems(s.totalItems);
      setLastSyncAt(s.lastSyncAt);
      setDeepSyncComplete(s.deepSyncComplete);
      setCollectionSynced(s.collectionSynced);
      setWishlistSynced(s.wishlistSynced);
      if (s.oldestStoryDate) setOldestDate(s.oldestStoryDate);
    },
  });

  const isDeepSyncing = state?.isDeepSyncing ?? false;
  const isCollectionSyncing = state?.isCollectionSyncing ?? false;
  const isWishlistSyncing = state?.isWishlistSyncing ?? false;
  const isEnrichingTags = state?.isEnrichingTags ?? false;
  const tagsEnriched = state?.tagsEnriched ?? 0;
  const enrichmentPendingCount = state?.enrichmentPendingCount ?? null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-zinc-100">Account</h1>

      <div className="mt-8 space-y-6">
        <Section title="Profile">
          <Row label="Username">
            <a
              href={`https://bandcamp.com/${username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-200 hover:text-white"
            >
              {username}
            </a>
          </Row>
        </Section>

        <Section title="Sync Status">
          <Row label="Last synced">
            {lastSyncAt ? formatDate(lastSyncAt) : 'Never'}
          </Row>
          <Row label="Total items">{totalItems.toLocaleString()}</Row>
          <Row label="Feed history">
            <StatusBadge
              done={deepSyncComplete}
              active={isDeepSyncing}
              doneLabel={oldestDate ? `Complete · back to ${formatOldestDate(oldestDate)}` : 'Complete'}
              activeLabel={oldestDate ? `Syncing · back to ${formatOldestDate(oldestDate)}` : 'Syncing...'}
              pendingLabel="Pending"
            />
          </Row>
          <Row label="Purchases">
            <StatusBadge
              done={collectionSynced}
              active={isCollectionSyncing}
              doneLabel={`${initialPurchaseItems.toLocaleString()} items`}
              activeLabel="Syncing..."
              pendingLabel="Pending"
            />
          </Row>
          <Row label="Wishlist">
            <StatusBadge
              done={wishlistSynced}
              active={isWishlistSyncing}
              doneLabel={`${initialWishlistCount.toLocaleString()} items`}
              activeLabel="Syncing..."
              pendingLabel="Pending"
            />
          </Row>
          <Row label="Tag enrichment">
            <StatusBadge
              done={!isEnrichingTags && enrichmentPendingCount === 0 && wishlistSynced && collectionSynced}
              active={isEnrichingTags}
              doneLabel="Complete"
              activeLabel={tagsEnriched > 0 ? `Enriching... (${tagsEnriched} done${enrichmentPendingCount ? `, ${enrichmentPendingCount.toLocaleString()} remaining` : ''})` : enrichmentPendingCount ? `Enriching... (${enrichmentPendingCount.toLocaleString()} remaining)` : 'Enriching...'}
              pendingLabel={enrichmentPendingCount !== null && enrichmentPendingCount > 0 ? `${enrichmentPendingCount.toLocaleString()} items remaining` : 'Pending'}
            />
          </Row>
        </Section>

        <div className="flex gap-3 border-t border-zinc-800 pt-6">
          <button
            onClick={triggerSync}
            disabled={anySyncing}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {anySyncing ? 'Syncing...' : 'Sync now'}
          </button>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 p-4">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-200">{children}</span>
    </div>
  );
}

function StatusBadge({
  done,
  active,
  doneLabel,
  activeLabel,
  pendingLabel,
}: {
  done: boolean;
  active: boolean;
  doneLabel: string;
  activeLabel: string;
  pendingLabel: string;
}) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-400">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
        {activeLabel}
      </span>
    );
  }
  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-400">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
        {doneLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-zinc-500">
      <span className="inline-block h-2 w-2 rounded-full bg-zinc-600" />
      {pendingLabel}
    </span>
  );
}
