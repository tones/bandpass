import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../index', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

import { queryOne, execute } from '../index';
import {
  createJob,
  updateJobProgress,
  incrementJobErrors,
  completeJob,
  failJob,
  getActiveJob,
  getLatestJob,
  hasActiveUserSync,
  requestJobCancel,
  updateHeartbeat,
  cleanupStaleJobs,
} from '../sync-jobs';

function makeJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    job_type: 'user_sync',
    fan_id: 10,
    status: 'running',
    progress_done: 5,
    progress_total: 100,
    progress_errors: 2,
    sub_phase: 'feed',
    error: null,
    created_at: '2025-01-15T12:00:00Z',
    updated_at: '2025-01-15T12:05:00Z',
    last_heartbeat: '2025-01-15T12:04:55Z',
    ...overrides,
  };
}

describe('sync-jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createJob', () => {
    it('inserts a running job and returns id', async () => {
      vi.mocked(queryOne).mockResolvedValue({ id: 42 });

      const id = await createJob('user_sync', 10);

      expect(id).toBe(42);
      expect(queryOne).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO sync_jobs"),
        ['user_sync', 10],
      );
    });

    it('passes null fan_id when not provided', async () => {
      vi.mocked(queryOne).mockResolvedValue({ id: 1 });
      await createJob('audio_analysis');
      expect(queryOne).toHaveBeenCalledWith(expect.any(String), ['audio_analysis', null]);
    });

    it('throws when insert fails', async () => {
      vi.mocked(queryOne).mockResolvedValue(null);
      await expect(createJob('user_sync')).rejects.toThrow('Failed to insert sync job');
    });
  });

  describe('updateJobProgress', () => {
    it('updates done, total, and sub_phase', async () => {
      await updateJobProgress(1, 50, 200, 'enrichment');
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('progress_done'),
        [50, 200, 'enrichment', 1],
      );
    });

    it('passes null sub_phase when not provided', async () => {
      await updateJobProgress(1, 10, 100);
      expect(execute).toHaveBeenCalledWith(expect.any(String), [10, 100, null, 1]);
    });
  });

  describe('incrementJobErrors', () => {
    it('increments progress_errors', async () => {
      await incrementJobErrors(5);
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('progress_errors + 1'),
        [5],
      );
    });
  });

  describe('completeJob', () => {
    it('sets status to done', async () => {
      await completeJob(1);
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining("status = 'done'"),
        [1],
      );
    });
  });

  describe('failJob', () => {
    it('sets status to failed with error message', async () => {
      await failJob(1, 'Connection timeout');
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining("status = 'failed'"),
        ['Connection timeout', 1],
      );
    });
  });

  describe('getActiveJob', () => {
    it('returns mapped job when running job exists', async () => {
      vi.mocked(queryOne).mockResolvedValue(makeJobRow());

      const job = await getActiveJob('user_sync', 10);

      expect(job).not.toBeNull();
      expect(job!.id).toBe(1);
      expect(job!.jobType).toBe('user_sync');
      expect(job!.status).toBe('running');
      expect(job!.progressDone).toBe(5);
      expect(job!.progressTotal).toBe(100);
      expect(job!.progressErrors).toBe(2);
      expect(job!.subPhase).toBe('feed');
    });

    it('returns null when no running job', async () => {
      vi.mocked(queryOne).mockResolvedValue(null);
      expect(await getActiveJob('user_sync', 10)).toBeNull();
    });

    it('queries without fan_id when not provided', async () => {
      vi.mocked(queryOne).mockResolvedValue(null);
      await getActiveJob('audio_analysis');
      const [sql, params] = vi.mocked(queryOne).mock.calls[0];
      expect(sql).not.toContain('fan_id');
      expect(params).toEqual(['audio_analysis']);
    });

    it('converts Date objects in row to ISO strings', async () => {
      vi.mocked(queryOne).mockResolvedValue(makeJobRow({
        created_at: new Date('2025-03-01T00:00:00Z'),
        updated_at: new Date('2025-03-01T01:00:00Z'),
        last_heartbeat: new Date('2025-03-01T00:59:00Z'),
      }));

      const job = await getActiveJob('user_sync', 10);
      expect(job!.createdAt).toBe('2025-03-01T00:00:00.000Z');
      expect(job!.updatedAt).toBe('2025-03-01T01:00:00.000Z');
      expect(job!.lastHeartbeat).toBe('2025-03-01T00:59:00.000Z');
    });

    it('returns null lastHeartbeat when column is null', async () => {
      vi.mocked(queryOne).mockResolvedValue(makeJobRow({ last_heartbeat: null }));
      const job = await getActiveJob('user_sync', 10);
      expect(job!.lastHeartbeat).toBeNull();
    });
  });

  describe('getLatestJob', () => {
    it('returns latest job regardless of status', async () => {
      vi.mocked(queryOne).mockResolvedValue(makeJobRow({ status: 'done' }));
      const job = await getLatestJob('user_sync', 10);
      expect(job!.status).toBe('done');
    });

    it('queries without fan_id when not provided', async () => {
      vi.mocked(queryOne).mockResolvedValue(null);
      await getLatestJob('audio_analysis');
      const [sql, params] = vi.mocked(queryOne).mock.calls[0];
      expect(sql).not.toContain('fan_id');
      expect(params).toEqual(['audio_analysis']);
    });
  });

  describe('hasActiveUserSync', () => {
    it('returns true when running sync exists', async () => {
      vi.mocked(queryOne).mockResolvedValue({});
      expect(await hasActiveUserSync(10)).toBe(true);
    });

    it('returns false when no running sync', async () => {
      vi.mocked(queryOne).mockResolvedValue(null);
      expect(await hasActiveUserSync(10)).toBe(false);
    });
  });

  describe('requestJobCancel', () => {
    it('sets cancel_requested flag', async () => {
      await requestJobCancel(5);
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('cancel_requested = true'),
        [5],
      );
    });
  });

  describe('updateHeartbeat', () => {
    it('updates last_heartbeat timestamp', async () => {
      await updateHeartbeat(3);
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('last_heartbeat = NOW()'),
        [3],
      );
    });
  });

  describe('cleanupStaleJobs', () => {
    it('marks all running jobs as failed when no types specified', async () => {
      vi.mocked(execute).mockResolvedValue({ rowCount: 0 } as never);
      await cleanupStaleJobs();
      const [sql] = vi.mocked(execute).mock.calls[0];
      expect(sql).toContain("status = 'failed'");
      expect(sql).toContain("'Server restarted'");
      expect(sql).not.toContain('job_type IN');
    });

    it('scopes to specific job types when provided', async () => {
      vi.mocked(execute).mockResolvedValue({ rowCount: 2 } as never);
      await cleanupStaleJobs(['user_sync', 'enrichment']);
      const [sql, params] = vi.mocked(execute).mock.calls[0];
      expect(sql).toContain('job_type IN');
      expect(params).toEqual(['user_sync', 'enrichment']);
    });

    it('logs when stale jobs are cleaned up', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(execute).mockResolvedValue({ rowCount: 3 } as never);
      await cleanupStaleJobs();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('3 stale'));
      spy.mockRestore();
    });
  });
});
