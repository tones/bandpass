import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';
import { normalizeBpm, toCamelot, formatKey } from '../lib/audio/camelot';

export const ANALYZE_TIMEOUT_MS = 120_000;

export type AnalyzeResult = {
  bpm: number;
  musicalKey: string;
  keyCamelot: string | null;
  tempFile?: string;
};

type RawResult = {
  bpm: number;
  key: string;
  scale: string;
  timing: string;
  file?: string;
};

export class EssentiaProcess {
  private proc: ChildProcess | null = null;
  private rl: Interface | null = null;
  private pending: {
    resolve: (v: RawResult) => void;
    reject: (e: Error) => void;
  } | null = null;

  constructor(public readonly id: number = 0) {}

  get tag() { return `[analyzer-${this.id}]`; }

  async ensure(): Promise<void> {
    if (this.proc && this.proc.exitCode === null) return;
    await this.start();
  }

  private start(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`${this.tag} Spawning Python Essentia analyzer...`);
      this.proc = spawn('python3', ['worker/analyze.py'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.rl = createInterface({ input: this.proc.stdout! });
      this.rl.on('line', (line) => {
        if (!this.pending) return;
        const { resolve: res, reject: rej } = this.pending;
        this.pending = null;
        try {
          const result = JSON.parse(line);
          if (result.error) rej(new Error(result.error));
          else res(result);
        } catch {
          rej(new Error(`Invalid JSON from analyzer: ${line}`));
        }
      });

      let resolved = false;
      const stderrRl = createInterface({ input: this.proc.stderr! });
      stderrRl.on('line', (line) => {
        if (line.includes('essentia-analyzer ready')) {
          resolved = true;
          console.log(`${this.tag} Python Essentia analyzer ready`);
          resolve();
        } else {
          console.log(`  ${this.tag} [python] ${line}`);
        }
      });

      this.proc.on('exit', (code) => {
        console.log(`${this.tag} Python analyzer exited with code ${code}`);
        if (!resolved) {
          resolved = true;
          reject(new Error(`Analyzer ${this.id} exited before ready (code ${code})`));
        }
        if (this.pending) {
          this.pending.reject(new Error(`Analyzer ${this.id} exited (code ${code})`));
          this.pending = null;
        }
      });

      this.proc.on('error', (err) => {
        console.error(`${this.tag} Failed to spawn Python analyzer:`, err.message);
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`Analyzer ${this.id} did not start within 10s`));
        }
      }, 10_000);
    });
  }

  async analyze(
    streamUrl: string,
    timeoutMs = ANALYZE_TIMEOUT_MS,
  ): Promise<AnalyzeResult> {
    await this.ensure();

    const raw = await new Promise<RawResult>(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending = null;
          this.kill();
          this.proc = null;
          reject(new Error(`Analysis timed out after ${timeoutMs / 1000}s`));
        }, timeoutMs);

        this.pending = {
          resolve: (v) => { clearTimeout(timer); resolve(v); },
          reject: (e) => { clearTimeout(timer); reject(e); },
        };
        this.proc!.stdin!.write(JSON.stringify({ url: streamUrl }) + '\n');
      },
    );

    console.log(`  ${this.tag} [timing] ${raw.timing}`);

    return {
      bpm: normalizeBpm(raw.bpm),
      musicalKey: formatKey(raw.key, raw.scale),
      keyCamelot: toCamelot(raw.key, raw.scale),
      tempFile: raw.file,
    };
  }

  kill() {
    if (this.proc && this.proc.exitCode === null) {
      this.proc.stdin!.end();
      this.proc.kill();
    }
  }
}

export class AnalyzerPool {
  private pool: EssentiaProcess[] = [];
  private available: EssentiaProcess[] = [];
  private waiters: ((p: EssentiaProcess) => void)[] = [];

  constructor(private size: number) {}

  async start() {
    console.log(`Starting analyzer pool with ${this.size} processes...`);
    for (let i = 0; i < this.size; i++) {
      const p = new EssentiaProcess(i);
      await p.ensure();
      this.pool.push(p);
      this.available.push(p);
    }
    console.log(`Analyzer pool ready (${this.size} processes)`);
  }

  acquire(): Promise<EssentiaProcess> {
    const p = this.available.pop();
    if (p) return Promise.resolve(p);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  release(p: EssentiaProcess) {
    const waiter = this.waiters.shift();
    if (waiter) waiter(p);
    else this.available.push(p);
  }

  killAll() {
    this.pool.forEach((p) => p.kill());
  }
}
