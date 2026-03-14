import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../index', () => ({
  queryOne: vi.fn(),
}));

import { queryOne } from '../../index';
import { getAudioAnalysisPendingCount, getAudioAnalysisDoneCount } from '../audio';

describe('audio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAudioAnalysisPendingCount', () => {
    it('returns count of tracks with stream_url but no bpm_status', async () => {
      vi.mocked(queryOne).mockResolvedValue({ c: '1234' });
      const count = await getAudioAnalysisPendingCount();
      expect(count).toBe(1234);
      const [sql] = vi.mocked(queryOne).mock.calls[0];
      expect(sql).toContain('bpm_status IS NULL');
      expect(sql).toContain('stream_url IS NOT NULL');
    });
  });

  describe('getAudioAnalysisDoneCount', () => {
    it('returns count of tracks with bpm_status = done', async () => {
      vi.mocked(queryOne).mockResolvedValue({ c: '500' });
      const count = await getAudioAnalysisDoneCount();
      expect(count).toBe(500);
      const [sql] = vi.mocked(queryOne).mock.calls[0];
      expect(sql).toContain("bpm_status = 'done'");
    });
  });
});
