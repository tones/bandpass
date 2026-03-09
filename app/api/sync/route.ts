import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { BandcampAPI } from '@/lib/bandcamp/api';
import { getSyncState, syncFeedInitial, syncFeedIncremental, syncFeedDeep } from '@/lib/db/sync';
import { getItemCount } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

interface SyncProgress {
  newItemsFound: number;
  isDeepSyncing: boolean;
  deepSyncItemsFound: number;
}

const activeSyncs = new Map<number, SyncProgress>();

async function startSync(fanId: number, identityCookie: string, isInitial: boolean) {
  if (activeSyncs.has(fanId)) return;

  const progress: SyncProgress = { newItemsFound: 0, isDeepSyncing: false, deepSyncItemsFound: 0 };
  activeSyncs.set(fanId, progress);

  try {
    const api = new BandcampAPI(identityCookie);

    const count = isInitial
      ? await syncFeedInitial(api, fanId)
      : await syncFeedIncremental(api, fanId);
    progress.newItemsFound = count;

    const freshState = getSyncState(fanId);
    if (freshState && !freshState.deepSyncComplete) {
      progress.isDeepSyncing = true;
      try {
        const deepCount = await syncFeedDeep(api, fanId);
        progress.deepSyncItemsFound = deepCount;
      } catch (err) {
        console.error('Deep sync error:', err);
      } finally {
        progress.isDeepSyncing = false;
      }
    }
  } catch (err) {
    console.error('Sync error:', err);
  } finally {
    setTimeout(() => activeSyncs.delete(fanId), 30_000);
  }
}

export async function GET() {
  const session = await getSession();
  if (!session.fanId || !session.identityCookie) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const fanId = session.fanId;
  const state = getSyncState(fanId);
  const totalItems = getItemCount(fanId);
  const progress = activeSyncs.get(fanId);

  const needsSync = !state?.lastSyncAt || !state?.deepSyncComplete;
  if (needsSync && !activeSyncs.has(fanId) && session.identityCookie) {
    startSync(fanId, session.identityCookie, !state?.lastSyncAt).catch((err) =>
      console.error('Auto-triggered sync error:', err),
    );
  }

  return NextResponse.json({
    fanId,
    totalItems,
    isSyncing: (state?.isSyncing ?? false) || activeSyncs.has(fanId),
    lastSyncAt: state?.lastSyncAt ?? null,
    oldestStoryDate: state?.oldestStoryDate ?? null,
    newestStoryDate: state?.newestStoryDate ?? null,
    newItemsFound: progress?.newItemsFound ?? null,
    isDeepSyncing: progress?.isDeepSyncing ?? false,
    deepSyncComplete: state?.deepSyncComplete ?? false,
  });
}

export async function POST() {
  const session = await getSession();
  if (!session.fanId || !session.identityCookie) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const fanId = session.fanId;

  if (activeSyncs.has(fanId)) {
    return NextResponse.json({ status: 'already_syncing' });
  }

  const state = getSyncState(fanId);
  const isInitial = !state?.lastSyncAt;

  startSync(fanId, session.identityCookie, isInitial).catch((err) =>
    console.error('POST-triggered sync error:', err),
  );

  return NextResponse.json({
    status: isInitial ? 'initial_sync_started' : 'incremental_sync_started',
  });
}
