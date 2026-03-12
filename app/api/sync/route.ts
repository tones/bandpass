import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { BandcampAPI } from '@/lib/bandcamp/api';
import { getSyncState, syncFeedInitial, syncFeedIncremental, syncFeedDeep, syncCollection, syncCollectionIncremental, syncWishlist, enqueueForEnrichment, processEnrichmentQueue, getEnrichmentPendingCount } from '@/lib/db/sync';
import { getItemCount } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

interface SyncProgress {
  newItemsFound: number;
  isDeepSyncing: boolean;
  deepSyncItemsFound: number;
  isCollectionSyncing: boolean;
  collectionItemsFound: number;
  isWishlistSyncing: boolean;
  wishlistItemsFound: number;
  isEnrichingTags: boolean;
  tagsEnriched: number;
}

const activeSyncs = new Map<number, SyncProgress>();

async function startSync(fanId: number, identityCookie: string, isInitial: boolean) {
  if (activeSyncs.has(fanId)) return;

  const progress: SyncProgress = {
    newItemsFound: 0,
    isDeepSyncing: false,
    deepSyncItemsFound: 0,
    isCollectionSyncing: false,
    collectionItemsFound: 0,
    isWishlistSyncing: false,
    wishlistItemsFound: 0,
    isEnrichingTags: false,
    tagsEnriched: 0,
  };
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

    const collectionState = getSyncState(fanId);
    progress.isCollectionSyncing = true;
    try {
      const collectionCount = collectionState?.collectionSynced
        ? await syncCollectionIncremental(api, fanId)
        : await syncCollection(api, fanId);
      progress.collectionItemsFound = collectionCount;
    } catch (err) {
      console.error('Collection sync error:', err);
    } finally {
      progress.isCollectionSyncing = false;
    }

    progress.isWishlistSyncing = true;
    try {
      const wishlistCount = await syncWishlist(api, fanId);
      progress.wishlistItemsFound = wishlistCount;
    } catch (err) {
      console.error('Wishlist sync error:', err);
    } finally {
      progress.isWishlistSyncing = false;
    }

    progress.isEnrichingTags = true;
    try {
      enqueueForEnrichment(fanId);
      const enriched = await processEnrichmentQueue((processed) => {
        progress.tagsEnriched = processed;
      });
      progress.tagsEnriched = enriched;
    } catch (err) {
      console.error('Tag enrichment error:', err);
    } finally {
      progress.isEnrichingTags = false;
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

  const enrichmentPendingCount = state?.collectionSynced && state?.wishlistSynced
    ? getEnrichmentPendingCount(fanId)
    : 0;

  const needsSync = !state?.lastSyncAt || !state?.deepSyncComplete || !state?.collectionSynced || !state?.wishlistSynced || enrichmentPendingCount > 0;
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
    isCollectionSyncing: progress?.isCollectionSyncing ?? false,
    collectionSynced: state?.collectionSynced ?? false,
    collectionItemsFound: progress?.collectionItemsFound ?? 0,
    isWishlistSyncing: progress?.isWishlistSyncing ?? false,
    wishlistSynced: state?.wishlistSynced ?? false,
    wishlistItemsFound: progress?.wishlistItemsFound ?? 0,
    isEnrichingTags: progress?.isEnrichingTags ?? false,
    tagsEnriched: progress?.tagsEnriched ?? 0,
    enrichmentPendingCount,
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
