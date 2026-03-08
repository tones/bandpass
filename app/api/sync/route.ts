import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getBandcamp } from '@/lib/bandcamp';
import { getSyncState, syncFeedFull, syncFeedIncremental } from '@/lib/db/sync';
import { getItemCount } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session.fanId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const state = getSyncState(session.fanId);
  const totalItems = getItemCount(session.fanId);

  return NextResponse.json({
    fanId: session.fanId,
    totalItems,
    isSyncing: state?.isSyncing ?? false,
    lastSyncAt: state?.lastSyncAt ?? null,
    oldestStoryDate: state?.oldestStoryDate ?? null,
    newestStoryDate: state?.newestStoryDate ?? null,
  });
}

const activeSyncs = new Set<number>();

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

  activeSyncs.add(fanId);

  const api = await getBandcamp();

  // Resolve the fan_id if not yet cached on the API instance
  await api.getFanId();

  const syncPromise = isInitial
    ? syncFeedFull(api, fanId)
    : syncFeedIncremental(api, fanId);

  syncPromise
    .catch((err) => console.error('Sync error:', err))
    .finally(() => activeSyncs.delete(fanId));

  return NextResponse.json({
    status: isInitial ? 'full_sync_started' : 'incremental_sync_started',
  });
}
