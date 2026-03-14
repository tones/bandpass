import { queryOne } from '@/lib/db/index';
import { processEnrichmentQueue } from '@/lib/db/sync';
import { createJob, updateJobProgress, completeJob, failJob, getActiveJob, cleanupStaleJobs } from '@/lib/db/sync-jobs';
import { sleep } from '@/lib/db/utils';

const WORKER_POLL_INTERVAL_MS = 30_000;

let started = false;
let nudgeResolve: (() => void) | null = null;

export function ensureWorkersStarted(cookie?: string) {
  if (started) return;
  started = true;

  cleanupStaleJobs(['user_sync', 'enrichment']).catch((err) => console.error('Failed to clean up stale jobs:', err));

  enrichmentWorkerLoop().catch((err) =>
    console.error('Enrichment worker crashed:', err),
  );
}

/**
 * Wake up background workers immediately instead of waiting for the next poll.
 * Called after user sync completes and enqueues new work.
 */
export function nudgeWorkers() {
  if (nudgeResolve) {
    nudgeResolve();
    nudgeResolve = null;
  }
}

function sleepOrNudge(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      nudgeResolve = null;
      resolve();
    }, ms);
    nudgeResolve = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}

async function enrichmentWorkerLoop() {
  while (true) {
    try {
      const row = await queryOne<{ c: string }>("SELECT COUNT(*) as c FROM enrichment_queue WHERE status = 'pending'");
      const pendingCount = parseInt(row?.c ?? '0', 10);

      if (pendingCount > 0 && !(await getActiveJob('enrichment'))) {
        const jobId = await createJob('enrichment');
        try {
          await updateJobProgress(jobId, 0, pendingCount);
          await processEnrichmentQueue((processed, remaining) => {
            updateJobProgress(jobId, processed, processed + remaining);
          });
          await completeJob(jobId);
        } catch (err) {
          console.error('Enrichment worker error:', err);
          await failJob(jobId, err instanceof Error ? err.message : String(err));
        }
      }
    } catch (err) {
      console.error('Enrichment worker loop error:', err);
    }

    await sleepOrNudge(WORKER_POLL_INTERVAL_MS);
  }
}
