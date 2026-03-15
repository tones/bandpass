import { cleanupStaleJobs } from '@/lib/db/sync-jobs';

let started = false;

export function ensureWorkersStarted() {
  if (started) return;
  started = true;

  cleanupStaleJobs(['user_sync']).catch((err) => console.error('Failed to clean up stale jobs:', err));
}
