import { query, queryOne } from './index';
import { getActiveJob, getLatestJob } from './sync-jobs';
import { getAudioAnalysisPendingCount, getAudioAnalysisDoneCount, getGlobalEnrichmentPendingCount } from './sync';

export interface AdminUser {
  fanId: number;
  username: string | null;
  lastSyncAt: string | null;
  isSyncing: boolean;
  deepSyncComplete: boolean;
  collectionSynced: boolean;
  wishlistSynced: boolean;
  oldestStoryDate: number | null;
  newestStoryDate: number | null;
  totalFeedItems: number;
  newReleases: number;
  friendPurchases: number;
  myPurchases: number;
  crateCount: number;
  wishlistCount: number;
  activeJobType: string | null;
  hasCookie: boolean;
  lastVisitedAt: string | null;
}

interface AdminUserRow {
  fan_id: number;
  username: string | null;
  last_sync_at: Date | string | null;
  is_syncing: boolean;
  deep_sync_complete: boolean;
  collection_synced: boolean;
  wishlist_synced: boolean;
  oldest_story_date: number | null;
  newest_story_date: number | null;
  total_feed_items: string;
  new_releases: string;
  friend_purchases: string;
  my_purchases: string;
  crate_count: string;
  wishlist_count: string;
  active_job_type: string | null;
  has_cookie: boolean;
  last_visited_at: Date | string | null;
}

function rowToAdminUser(row: AdminUserRow): AdminUser {
  return {
    fanId: row.fan_id,
    username: row.username,
    lastSyncAt: row.last_sync_at instanceof Date ? row.last_sync_at.toISOString() : row.last_sync_at,
    isSyncing: row.is_syncing,
    deepSyncComplete: row.deep_sync_complete,
    collectionSynced: row.collection_synced,
    wishlistSynced: row.wishlist_synced,
    oldestStoryDate: row.oldest_story_date,
    newestStoryDate: row.newest_story_date,
    totalFeedItems: parseInt(row.total_feed_items, 10),
    newReleases: parseInt(row.new_releases, 10),
    friendPurchases: parseInt(row.friend_purchases, 10),
    myPurchases: parseInt(row.my_purchases, 10),
    crateCount: parseInt(row.crate_count, 10),
    wishlistCount: parseInt(row.wishlist_count, 10),
    activeJobType: row.active_job_type,
    hasCookie: row.has_cookie,
    lastVisitedAt: row.last_visited_at instanceof Date ? row.last_visited_at.toISOString() : row.last_visited_at,
  };
}

export async function getAllUsersWithStats(): Promise<AdminUser[]> {
  const rows = await query<AdminUserRow>(`
    SELECT
      s.fan_id,
      s.username,
      s.last_sync_at,
      s.is_syncing,
      s.deep_sync_complete,
      s.collection_synced,
      s.wishlist_synced,
      s.oldest_story_date,
      s.newest_story_date,
      (s.identity_cookie IS NOT NULL) AS has_cookie,
      s.last_visited_at,
      fi.total_feed_items,
      fi.new_releases,
      fi.friend_purchases,
      fi.my_purchases,
      c.crate_count,
      w.wishlist_count,
      j.active_job_type
    FROM sync_state s
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) AS total_feed_items,
        COUNT(*) FILTER (WHERE story_type = 'new_release') AS new_releases,
        COUNT(*) FILTER (WHERE story_type = 'friend_purchase') AS friend_purchases,
        COUNT(*) FILTER (WHERE story_type = 'my_purchase') AS my_purchases
      FROM feed_items WHERE fan_id = s.fan_id
    ) fi ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS crate_count FROM crates WHERE fan_id = s.fan_id
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS wishlist_count FROM wishlist_items WHERE fan_id = s.fan_id
    ) w ON true
    LEFT JOIN LATERAL (
      SELECT job_type AS active_job_type
      FROM sync_jobs WHERE fan_id = s.fan_id AND status = 'running'
      ORDER BY id DESC LIMIT 1
    ) j ON true
    ORDER BY s.last_sync_at DESC NULLS LAST
  `);
  return rows.map(rowToAdminUser);
}

export interface AdminGlobalStats {
  totalCatalogReleases: number;
  totalCatalogTracks: number;
  isEnriching: boolean;
  enrichedCount: number;
  enrichmentPendingCount: number;
  isAnalyzingAudio: boolean;
  audioAnalyzed: number;
  audioAnalysisPending: number;
  audioAnalysisDone: number;
  audioErrors: number;
  audioJobError: string | null;
  audioJobStatus: string | null;
  audioAnalysisEnabled: boolean;
  workerOnline: boolean;
}

export async function getGlobalStats(): Promise<AdminGlobalStats> {
  const countsRow = await queryOne<{
    total_catalog_releases: string;
    total_catalog_tracks: string;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM catalog_releases) AS total_catalog_releases,
      (SELECT COUNT(*) FROM catalog_tracks) AS total_catalog_tracks
  `);

  const enrichmentJob = await getActiveJob('enrichment') ?? await getLatestJob('enrichment');
  const activeAudioJob = await getActiveJob('audio_analysis');
  const audioJob = activeAudioJob ?? await getLatestJob('audio_analysis');

  const enrichmentPendingCount = await getGlobalEnrichmentPendingCount();
  const audioAnalysisPending = await getAudioAnalysisPendingCount();
  const audioAnalysisDone = await getAudioAnalysisDoneCount();

  const isEnriching = enrichmentJob?.status === 'running';
  const isAnalyzingAudio = audioJob?.status === 'running';

  const isTransientAudioFailure = !activeAudioJob
    && audioJob?.error === 'Server restarted'
    && audioAnalysisPending > 0;

  const HEARTBEAT_STALE_MS = 90_000;
  const workerOnline = activeAudioJob?.lastHeartbeat
    ? (Date.now() - new Date(activeAudioJob.lastHeartbeat).getTime()) < HEARTBEAT_STALE_MS
    : false;

  return {
    totalCatalogReleases: parseInt(countsRow?.total_catalog_releases ?? '0', 10),
    totalCatalogTracks: parseInt(countsRow?.total_catalog_tracks ?? '0', 10),
    isEnriching,
    enrichedCount: enrichmentJob?.progressDone ?? 0,
    enrichmentPendingCount: isEnriching
      ? (enrichmentJob?.progressTotal ?? 0) - (enrichmentJob?.progressDone ?? 0)
      : enrichmentPendingCount,
    isAnalyzingAudio,
    audioAnalyzed: audioJob?.progressDone ?? 0,
    audioAnalysisPending: isAnalyzingAudio
      ? (audioJob?.progressTotal ?? 0) - (audioJob?.progressDone ?? 0)
      : audioAnalysisPending,
    audioAnalysisDone,
    audioErrors: audioJob?.progressErrors ?? 0,
    audioJobError: isTransientAudioFailure ? null : (audioJob?.error ?? null),
    audioJobStatus: isTransientAudioFailure ? null : (audioJob?.status ?? null),
    audioAnalysisEnabled: process.env.ENABLE_AUDIO_ANALYSIS === 'true',
    workerOnline,
  };
}
