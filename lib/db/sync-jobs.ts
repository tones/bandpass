import { query, queryOne, execute } from './index';

export type JobType = 'user_sync' | 'enrichment' | 'audio_analysis';
export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

export interface SyncJob {
  id: number;
  jobType: JobType;
  fanId: number | null;
  status: JobStatus;
  progressDone: number;
  progressTotal: number;
  progressErrors: number;
  subPhase: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SyncJobRow {
  id: number;
  job_type: string;
  fan_id: number | null;
  status: string;
  progress_done: number;
  progress_total: number;
  progress_errors: number;
  sub_phase: string | null;
  error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function toISOString(val: Date | string): string {
  return val instanceof Date ? val.toISOString() : val;
}

function rowToJob(row: SyncJobRow): SyncJob {
  return {
    id: row.id,
    jobType: row.job_type as JobType,
    fanId: row.fan_id,
    status: row.status as JobStatus,
    progressDone: row.progress_done,
    progressTotal: row.progress_total,
    progressErrors: row.progress_errors ?? 0,
    subPhase: row.sub_phase,
    error: row.error,
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
  };
}

export async function createJob(jobType: JobType, fanId?: number): Promise<number> {
  const row = await queryOne<{ id: number }>(
    "INSERT INTO sync_jobs (job_type, fan_id, status) VALUES ($1, $2, 'running') RETURNING id",
    [jobType, fanId ?? null],
  );
  if (!row) throw new Error('Failed to insert sync job');
  return row.id;
}

export async function updateJobProgress(jobId: number, done: number, total: number, subPhase?: string): Promise<void> {
  await execute(
    'UPDATE sync_jobs SET progress_done = $1, progress_total = $2, sub_phase = $3, updated_at = NOW() WHERE id = $4',
    [done, total, subPhase ?? null, jobId],
  );
}

export async function incrementJobErrors(jobId: number): Promise<void> {
  await execute(
    'UPDATE sync_jobs SET progress_errors = progress_errors + 1, updated_at = NOW() WHERE id = $1',
    [jobId],
  );
}

export async function completeJob(jobId: number): Promise<void> {
  await execute(
    "UPDATE sync_jobs SET status = 'done', updated_at = NOW() WHERE id = $1",
    [jobId],
  );
}

export async function failJob(jobId: number, error: string): Promise<void> {
  await execute(
    "UPDATE sync_jobs SET status = 'failed', error = $1, updated_at = NOW() WHERE id = $2",
    [error, jobId],
  );
}

export async function getActiveJob(jobType: JobType, fanId?: number): Promise<SyncJob | null> {
  const row = fanId != null
    ? await queryOne<SyncJobRow>(
        "SELECT * FROM sync_jobs WHERE job_type = $1 AND fan_id = $2 AND status = 'running' ORDER BY id DESC LIMIT 1",
        [jobType, fanId],
      )
    : await queryOne<SyncJobRow>(
        "SELECT * FROM sync_jobs WHERE job_type = $1 AND status = 'running' ORDER BY id DESC LIMIT 1",
        [jobType],
      );
  return row ? rowToJob(row) : null;
}

export async function getLatestJob(jobType: JobType, fanId?: number): Promise<SyncJob | null> {
  const row = fanId != null
    ? await queryOne<SyncJobRow>(
        "SELECT * FROM sync_jobs WHERE job_type = $1 AND fan_id = $2 ORDER BY id DESC LIMIT 1",
        [jobType, fanId],
      )
    : await queryOne<SyncJobRow>(
        "SELECT * FROM sync_jobs WHERE job_type = $1 ORDER BY id DESC LIMIT 1",
        [jobType],
      );
  return row ? rowToJob(row) : null;
}

export async function hasActiveUserSync(fanId: number): Promise<boolean> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT 1 FROM sync_jobs WHERE job_type = 'user_sync' AND fan_id = $1 AND status = 'running' LIMIT 1",
    [fanId],
  );
  return !!row;
}

export async function cleanupStaleJobs(): Promise<void> {
  const result = await execute(
    "UPDATE sync_jobs SET status = 'failed', error = 'Server restarted', updated_at = NOW() WHERE status = 'running'",
  );
  if (result.rowCount > 0) {
    console.log(`Cleaned up ${result.rowCount} stale running job(s) from previous server instance`);
  }
}
