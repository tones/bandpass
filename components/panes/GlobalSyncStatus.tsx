import { Section, Row, StatusBadge } from './shared';

export interface GlobalSyncStatusProps {
  isEnriching: boolean;
  enrichedCount: number;
  enrichmentPendingCount: number | null;
  collectionSynced: boolean;
  wishlistSynced: boolean;
  isAnalyzingAudio: boolean;
  audioAnalyzed: number;
  audioAnalysisPending: number | null;
  audioAnalysisDone: number;
  audioErrors: number;
  audioJobError: string | null;
  audioJobStatus: string | null;
  audioAnalysisEnabled: boolean;
  workerOnline: boolean;
  stopping?: boolean;
}

function buildAudioActiveLabel(done: number, errors: number, pending: number | null): string {
  const parts: string[] = [];
  if (done > 0) parts.push(`${done.toLocaleString()} done`);
  if (errors > 0) parts.push(`${errors.toLocaleString()} errors`);
  if (pending) parts.push(`${pending.toLocaleString()} remaining`);
  return parts.length > 0 ? `Analyzing... (${parts.join(', ')})` : 'Analyzing...';
}

export function GlobalSyncStatus({
  isEnriching,
  enrichedCount,
  enrichmentPendingCount,
  collectionSynced,
  wishlistSynced,
  isAnalyzingAudio,
  audioAnalyzed,
  audioAnalysisPending,
  audioAnalysisDone,
  audioErrors,
  audioJobError,
  audioJobStatus,
  audioAnalysisEnabled,
  workerOnline,
  stopping = false,
}: GlobalSyncStatusProps) {
  const audioFailed = !isAnalyzingAudio && audioJobStatus === 'failed' && !!audioJobError;
  const workerOffline = isAnalyzingAudio && !workerOnline;

  return (
    <Section title="Global Sync Status">
      <Row label="Catalog enrichment">
        <StatusBadge
          done={!isEnriching && enrichmentPendingCount === 0 && wishlistSynced && collectionSynced}
          active={isEnriching}
          doneLabel="Complete"
          activeLabel={
            enrichedCount > 0
              ? `Enriching... (${enrichedCount} done${enrichmentPendingCount ? `, ${enrichmentPendingCount.toLocaleString()} remaining` : ''})`
              : enrichmentPendingCount
                ? `Enriching... (${enrichmentPendingCount.toLocaleString()} remaining)`
                : 'Enriching...'
          }
          pendingLabel={
            enrichmentPendingCount !== null && enrichmentPendingCount > 0
              ? `${enrichmentPendingCount.toLocaleString()} items remaining`
              : 'Pending'
          }
        />
      </Row>
      <Row label="Audio enrichment">
        {!audioAnalysisEnabled ? (
          <span className="inline-flex items-center gap-1.5 text-zinc-500">
            <span className="inline-block h-2 w-2 rounded-full bg-zinc-600" />
            Disabled on this server
          </span>
        ) : audioFailed ? (
          <span className="inline-flex items-center gap-1.5 text-red-400">
            <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
            Failed: {audioJobError}
          </span>
        ) : workerOffline ? (
          <span className="inline-flex items-center gap-1.5 text-zinc-400">
            <span className="inline-block h-2 w-2 rounded-full bg-zinc-500" />
            Worker offline &middot; will resume automatically
          </span>
        ) : (
          <StatusBadge
            done={!isAnalyzingAudio && audioAnalysisPending === 0 && enrichmentPendingCount === 0 && collectionSynced}
            active={isAnalyzingAudio}
            doneLabel={audioAnalysisDone > 0 ? `${audioAnalysisDone.toLocaleString()} tracks enriched` : 'Complete'}
            activeLabel={
              stopping
                ? 'Stopping...'
                : buildAudioActiveLabel(audioAnalyzed, audioErrors, audioAnalysisPending)
            }
            pendingLabel={
              audioAnalysisPending !== null && audioAnalysisPending > 0
                ? `${audioAnalysisPending.toLocaleString()} tracks remaining`
                : 'Pending'
            }
          />
        )}
      </Row>
    </Section>
  );
}
