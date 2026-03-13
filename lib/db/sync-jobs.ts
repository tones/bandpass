import { getDb } from './index';

export type JobType = 'user_sync' | 'enrichment' | 'audio_analysis';
export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

export interface SyncJob {
  id: number;
  jobType: JobType;
  fanId: number | null;
  status: JobStatus;
  progressDone: number;
  progressTotal: number;
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
  error: string | null;
  created_at: string;
  updated_at: string;
}

function rowToJob(row: SyncJobRow): SyncJob {
  return {
    id: row.id,
    jobType: row.job_type as JobType,
    fanId: row.fan_id,
    status: row.status as JobStatus,
    progressDone: row.progress_done,
    progressTotal: row.progress_total,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createJob(jobType: JobType, fanId?: number): number {
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO sync_jobs (job_type, fan_id, status) VALUES (?, ?, 'running')",
  ).run(jobType, fanId ?? null);
  return result.lastInsertRowid as number;
}

export function updateJobProgress(jobId: number, done: number, total: number): void {
  const db = getDb();
  db.prepare(
    "UPDATE sync_jobs SET progress_done = ?, progress_total = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(done, total, jobId);
}

export function completeJob(jobId: number): void {
  const db = getDb();
  db.prepare(
    "UPDATE sync_jobs SET status = 'done', updated_at = datetime('now') WHERE id = ?",
  ).run(jobId);
}

export function failJob(jobId: number, error: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE sync_jobs SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(error, jobId);
}

export function getActiveJob(jobType: JobType, fanId?: number): SyncJob | null {
  const db = getDb();
  const row = fanId != null
    ? db.prepare(
        "SELECT * FROM sync_jobs WHERE job_type = ? AND fan_id = ? AND status = 'running' ORDER BY id DESC LIMIT 1",
      ).get(jobType, fanId) as SyncJobRow | undefined
    : db.prepare(
        "SELECT * FROM sync_jobs WHERE job_type = ? AND status = 'running' ORDER BY id DESC LIMIT 1",
      ).get(jobType) as SyncJobRow | undefined;
  return row ? rowToJob(row) : null;
}

export function getLatestJob(jobType: JobType, fanId?: number): SyncJob | null {
  const db = getDb();
  const row = fanId != null
    ? db.prepare(
        "SELECT * FROM sync_jobs WHERE job_type = ? AND fan_id = ? ORDER BY id DESC LIMIT 1",
      ).get(jobType, fanId) as SyncJobRow | undefined
    : db.prepare(
        "SELECT * FROM sync_jobs WHERE job_type = ? ORDER BY id DESC LIMIT 1",
      ).get(jobType) as SyncJobRow | undefined;
  return row ? rowToJob(row) : null;
}

export function hasActiveUserSync(fanId: number): boolean {
  const db = getDb();
  const row = db.prepare(
    "SELECT 1 FROM sync_jobs WHERE job_type = 'user_sync' AND fan_id = ? AND status = 'running' LIMIT 1",
  ).get(fanId);
  return !!row;
}
