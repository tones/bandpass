import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { BandcampAPI } from '@/lib/bandcamp/api';
import { getSyncState, syncFeedInitial, syncFeedIncremental, syncFeedDeep, syncCollection, syncCollectionIncremental, syncWishlist, enqueueForEnrichment, getEnrichmentPendingCount, getAudioAnalysisPendingCount, getAudioAnalysisDoneCount } from '@/lib/db/sync';
import { createJob, updateJobProgress, completeJob, failJob, hasActiveUserSync, getActiveJob, getLatestJob } from '@/lib/db/sync-jobs';
import { getItemCount } from '@/lib/db/queries';
import { ensureWorkersStarted, nudgeWorkers } from '@/lib/sync/workers';

export const dynamic = 'force-dynamic';

async function startSync(fanId: number, identityCookie: string, isInitial: boolean) {
  if (hasActiveUserSync(fanId)) return;

  const jobId = createJob('user_sync', fanId);

  try {
    const api = new BandcampAPI(identityCookie);

    updateJobProgress(jobId, 0, 4);

    const count = isInitial
      ? await syncFeedInitial(api, fanId)
      : await syncFeedIncremental(api, fanId);
    updateJobProgress(jobId, 1, 4);

    const freshState = getSyncState(fanId);
    if (freshState && !freshState.deepSyncComplete) {
      try {
        await syncFeedDeep(api, fanId);
      } catch (err) {
        console.error('Deep sync error:', err);
      }
    }
    updateJobProgress(jobId, 2, 4);

    const collectionState = getSyncState(fanId);
    try {
      if (collectionState?.collectionSynced) {
        await syncCollectionIncremental(api, fanId);
      } else {
        await syncCollection(api, fanId);
      }
    } catch (err) {
      console.error('Collection sync error:', err);
    }
    updateJobProgress(jobId, 3, 4);

    try {
      await syncWishlist(api, fanId);
    } catch (err) {
      console.error('Wishlist sync error:', err);
    }
    updateJobProgress(jobId, 4, 4);

    enqueueForEnrichment(fanId);
    nudgeWorkers();

    completeJob(jobId);
  } catch (err) {
    console.error('Sync error:', err);
    failJob(jobId, err instanceof Error ? err.message : String(err));
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

  const enrichmentPendingCount = state?.collectionSynced && state?.wishlistSynced
    ? getEnrichmentPendingCount(fanId)
    : 0;
  const audioAnalysisPending = getAudioAnalysisPendingCount();
  const audioAnalysisDone = getAudioAnalysisDoneCount();

  const userSyncJob = getActiveJob('user_sync', fanId);
  const enrichmentJob = getActiveJob('enrichment') ?? getLatestJob('enrichment');
  const audioJob = getActiveJob('audio_analysis') ?? getLatestJob('audio_analysis');

  const isUserSyncing = !!userSyncJob;

  const isDeepSyncing = isUserSyncing && (userSyncJob?.progressDone ?? 0) < 2;
  const isCollectionSyncing = isUserSyncing && (userSyncJob?.progressDone ?? 0) >= 2 && (userSyncJob?.progressDone ?? 0) < 3;
  const isWishlistSyncing = isUserSyncing && (userSyncJob?.progressDone ?? 0) >= 3 && (userSyncJob?.progressDone ?? 0) < 4;

  const isEnrichingTags = enrichmentJob?.status === 'running';
  const isAnalyzingAudio = audioJob?.status === 'running';

  const needsSync = !state?.lastSyncAt || !state?.deepSyncComplete || !state?.collectionSynced || !state?.wishlistSynced || enrichmentPendingCount > 0;
  if (needsSync && !isUserSyncing && session.identityCookie) {
    startSync(fanId, session.identityCookie, !state?.lastSyncAt).catch((err) =>
      console.error('Auto-triggered sync error:', err),
    );
  }

  ensureWorkersStarted(session.identityCookie);

  return NextResponse.json({
    fanId,
    totalItems,
    isSyncing: (state?.isSyncing ?? false) || isUserSyncing,
    lastSyncAt: state?.lastSyncAt ?? null,
    oldestStoryDate: state?.oldestStoryDate ?? null,
    newestStoryDate: state?.newestStoryDate ?? null,
    isDeepSyncing,
    deepSyncComplete: state?.deepSyncComplete ?? false,
    isCollectionSyncing,
    collectionSynced: state?.collectionSynced ?? false,
    isWishlistSyncing,
    wishlistSynced: state?.wishlistSynced ?? false,
    isEnrichingTags,
    tagsEnriched: enrichmentJob?.progressDone ?? 0,
    enrichmentPendingCount: isEnrichingTags
      ? (enrichmentJob?.progressTotal ?? 0) - (enrichmentJob?.progressDone ?? 0)
      : enrichmentPendingCount,
    isAnalyzingAudio,
    audioAnalyzed: audioJob?.progressDone ?? 0,
    audioAnalysisPending: isAnalyzingAudio
      ? (audioJob?.progressTotal ?? 0) - (audioJob?.progressDone ?? 0)
      : audioAnalysisPending,
    audioAnalysisDone,
    audioSubPhase: audioJob?.subPhase ?? null,
    audioAnalysisEnabled: process.env.ENABLE_AUDIO_ANALYSIS === 'true',
  });
}

export async function POST() {
  const session = await getSession();
  if (!session.fanId || !session.identityCookie) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const fanId = session.fanId;

  if (hasActiveUserSync(fanId)) {
    return NextResponse.json({ status: 'already_syncing' });
  }

  const state = getSyncState(fanId);
  const isInitial = !state?.lastSyncAt;

  startSync(fanId, session.identityCookie, isInitial).catch((err) =>
    console.error('POST-triggered sync error:', err),
  );

  ensureWorkersStarted(session.identityCookie);

  return NextResponse.json({
    status: isInitial ? 'initial_sync_started' : 'incremental_sync_started',
  });
}
