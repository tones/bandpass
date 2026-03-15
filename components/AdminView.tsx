'use client';

import type { AdminUser, AdminGlobalStats } from '@/lib/db/admin';

interface AdminViewProps {
  users: AdminUser[];
  globalStats: AdminGlobalStats;
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
  });
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function SyncBadge({ done, active, label }: { done: boolean; active: boolean; label?: string }) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-400">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        {label ?? 'Syncing'}
      </span>
    );
  }
  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-400">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
        {label ?? 'Done'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-zinc-500">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-600" />
      {label ?? 'Pending'}
    </span>
  );
}

function UserCard({ user }: { user: AdminUser }) {
  const displayName = user.username ?? `Fan ${user.fanId}`;

  return (
    <div className="rounded-lg border border-zinc-800 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium text-zinc-100">{displayName}</h2>
          <p className="text-xs text-zinc-500">ID: {user.fanId}</p>
        </div>
        {user.isSyncing && (
          <span className="rounded-full bg-amber-400/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
            Syncing
          </span>
        )}
      </div>

      <div className="space-y-3">
        <Section title="Activity">
          <Row label="Last synced">
            {user.lastSyncAt ? formatDate(user.lastSyncAt) : 'Never'}
          </Row>
          {user.oldestStoryDate && user.newestStoryDate && (
            <Row label="Feed range">
              {formatTimestamp(user.oldestStoryDate)} &ndash; {formatTimestamp(user.newestStoryDate)}
            </Row>
          )}
          {user.activeJobType && (
            <Row label="Active job">
              <span className="text-amber-400">{user.activeJobType.replace('_', ' ')}</span>
            </Row>
          )}
        </Section>

        <Section title="Items">
          <Row label="Feed items">
            {user.totalFeedItems.toLocaleString()}
          </Row>
          <div className="ml-4 space-y-1">
            <Row label="New releases" sub>{user.newReleases.toLocaleString()}</Row>
            <Row label="Friend purchases" sub>{user.friendPurchases.toLocaleString()}</Row>
            <Row label="My purchases" sub>{user.myPurchases.toLocaleString()}</Row>
          </div>
          <Row label="Crates">{user.crateCount.toLocaleString()}</Row>
          <Row label="Wishlist items">{user.wishlistCount.toLocaleString()}</Row>
        </Section>

        <Section title="Sync Progress">
          <Row label="Deep sync">
            <SyncBadge done={user.deepSyncComplete} active={user.isSyncing && !user.deepSyncComplete} />
          </Row>
          <Row label="Collection">
            <SyncBadge done={user.collectionSynced} active={user.isSyncing && !user.collectionSynced} />
          </Row>
          <Row label="Wishlist">
            <SyncBadge done={user.wishlistSynced} active={user.isSyncing && !user.wishlistSynced} />
          </Row>
        </Section>
      </div>
    </div>
  );
}

export function AdminView({ users, globalStats }: AdminViewProps) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-zinc-100">Admin</h1>
      <p className="mt-1 text-sm text-zinc-500">{users.length} registered user{users.length !== 1 ? 's' : ''}</p>

      <div className="mt-8 rounded-lg border border-zinc-800 p-4">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">Global Stats</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
          <Stat label="Catalog releases" value={globalStats.totalCatalogReleases.toLocaleString()} />
          <Stat label="Catalog tracks" value={globalStats.totalCatalogTracks.toLocaleString()} />
          <Stat label="Enrichment done" value={globalStats.enrichmentDone.toLocaleString()} />
          <Stat label="Enrichment pending" value={globalStats.enrichmentPending.toLocaleString()} />
        </div>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-600">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, children, sub }: { label: string; children: React.ReactNode; sub?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={sub ? 'text-zinc-600' : 'text-zinc-500'}>{label}</span>
      <span className={sub ? 'text-zinc-400' : 'text-zinc-200'}>{children}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-medium text-zinc-100">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}
