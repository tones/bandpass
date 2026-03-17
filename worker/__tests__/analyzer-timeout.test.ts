import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter, Readable, Writable } from 'stream';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../../lib/audio/camelot', () => ({
  normalizeBpm: (bpm: number) => bpm,
  toCamelot: (_key: string, _scale: string) => '8A',
  formatKey: (key: string, scale: string) => `${key}${scale === 'minor' ? 'm' : ''}`,
}));

import { spawn } from 'child_process';
import { EssentiaProcess } from '../analyzer';

function createMockProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdin: Writable;
    stdout: Readable;
    stderr: Readable;
    exitCode: number | null;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdin = new Writable({ write(_chunk, _enc, cb) { cb(); } });
  proc.stdout = new Readable({ read() {} });
  proc.stderr = new Readable({ read() {} });
  proc.exitCode = null;
  proc.kill = vi.fn(() => { proc.exitCode = -1; });
  return proc;
}

async function startAnalyzer(id = 0) {
  const proc = createMockProcess();
  vi.mocked(spawn).mockReturnValue(proc as never);

  const analyzer = new EssentiaProcess(id);
  const ensurePromise = analyzer.ensure();
  proc.stderr.push('essentia-analyzer ready\n');
  await ensurePromise;

  return { analyzer, proc };
}

describe('EssentiaProcess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects with timeout error when analyzer hangs', async () => {
    const { analyzer } = await startAnalyzer(0);

    await expect(
      analyzer.analyze('https://example.com/track.mp3', 100),
    ).rejects.toThrow('Analysis timed out after 0.1s');
  }, 2000);

  it('kills the hung process on timeout', async () => {
    const { analyzer, proc } = await startAnalyzer(1);

    await analyzer.analyze('https://example.com/track.mp3', 100).catch(() => {});

    expect(proc.kill).toHaveBeenCalled();
  }, 2000);

  it('forces respawn on next call after timeout', async () => {
    const proc1 = createMockProcess();
    const proc2 = createMockProcess();
    vi.mocked(spawn)
      .mockReturnValueOnce(proc1 as never)
      .mockReturnValueOnce(proc2 as never);

    const analyzer = new EssentiaProcess(2);
    const ensurePromise = analyzer.ensure();
    proc1.stderr.push('essentia-analyzer ready\n');
    await ensurePromise;

    await analyzer.analyze('https://example.com/track.mp3', 100).catch(() => {});

    expect(spawn).toHaveBeenCalledTimes(1);

    const ensurePromise2 = analyzer.ensure();
    proc2.stderr.push('essentia-analyzer ready\n');
    await ensurePromise2;

    expect(spawn).toHaveBeenCalledTimes(2);
  }, 2000);

  it('clears timeout on successful response', async () => {
    const { analyzer, proc } = await startAnalyzer(3);

    const analyzePromise = analyzer.analyze('https://example.com/track.mp3', 5000);

    await new Promise((r) => setTimeout(r, 10));
    proc.stdout.push(JSON.stringify({
      bpm: 120,
      key: 'C',
      scale: 'minor',
      timing: 'audio=180.0s download=100ms load=200ms bpm=500ms key=100ms total=900ms',
    }) + '\n');

    const result = await analyzePromise;

    expect(result.bpm).toBe(120);
    expect(result.musicalKey).toBe('Cm');
    expect(result.keyCamelot).toBe('8A');
    expect(proc.kill).not.toHaveBeenCalled();
  }, 2000);
});
