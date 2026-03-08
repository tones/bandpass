import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getBandcamp } from '@/lib/bandcamp';
import { getSyncState, syncFeedFull, syncFeedIncremental } from '@/lib/db/sync';
import { getItemCount } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

interface SyncProgress {
  newItemsFound: number;
}

const activeSyncs = new Map<number, SyncProgress>();

export async function GET() {
  const session = await getSession();
  if (!session.fanId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const fanId = session.fanId;
  const state = getSyncState(fanId);
  const totalItems = getItemCount(fanId);
  const progress = activeSyncs.get(fanId);

  return NextResponse.json({
    fanId,
    totalItems,
    isSyncing: state?.isSyncing ?? false,
    lastSyncAt: state?.lastSyncAt ?? null,
    oldestStoryDate: state?.oldestStoryDate ?? null,
    newestStoryDate: state?.newestStoryDate ?? null,
    newItemsFound: progress?.newItemsFound ?? null,
  });
}

export async function POST() {
  const session = await getSession();
  if (!session.fanId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const fanId = session.fanId;

  if (activeSyncs.has(fanId)) {
    return NextResponse.json({ status: 'already_syncing' });
  }

  const state = getSyncState(fanId);
  const isInitial = !state?.lastSyncAt;

  const progress: SyncProgress = { newItemsFound: 0 };
  activeSyncs.set(fanId, progress);

  const api = await getBandcamp();
  await api.getFanId();

  const syncPromise = isInitial
    ? syncFeedFull(api, fanId)
    : syncFeedIncremental(api, fanId);

  syncPromise
    .then((count) => { progress.newItemsFound = count; })
    .catch((err) => console.error('Sync error:', err))
    .finally(() => {
      setTimeout(() => activeSyncs.delete(fanId), 30_000);
    });

  return NextResponse.json({
    status: isInitial ? 'full_sync_started' : 'incremental_sync_started',
  });
}
