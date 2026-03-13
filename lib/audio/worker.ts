import { parentPort } from 'worker_threads';
import { normalizeBpm, toCamelot, formatKey } from './camelot';

import type { Essentia } from 'essentia.js';

let essentiaInstance: Essentia | null = null;

async function getEssentia(): Promise<Essentia> {
  if (essentiaInstance) return essentiaInstance;
  const { Essentia, EssentiaWASM } = await import('essentia.js');
  essentiaInstance = new Essentia(EssentiaWASM);
  return essentiaInstance;
}

interface AnalyzeRequest {
  trackId: number;
  streamUrl: string;
  cookie?: string;
}

async function analyzeTrack(req: AnalyzeRequest) {
  const headers: Record<string, string> = {};
  if (req.cookie) {
    headers['Cookie'] = `identity=${req.cookie}`;
  }

  const resp = await fetch(req.streamUrl, { headers, redirect: 'follow' });
  if (!resp.ok) {
    throw new Error(`Failed to fetch audio: HTTP ${resp.status}`);
  }

  const mp3Buffer = Buffer.from(await resp.arrayBuffer());
  const decode = (await import('audio-decode')).default;
  const audioBuffer = await decode(mp3Buffer);
  const pcm = audioBuffer.getChannelData(0);

  const essentia = await getEssentia();
  const signal = essentia.arrayToVector(pcm);

  try {
    const bpmResult = essentia.PercivalBpmEstimator(signal);
    const bpm = normalizeBpm(bpmResult.bpm);

    const keyResult = essentia.KeyExtractor(signal);
    const musicalKey = formatKey(keyResult.key, keyResult.scale);
    const keyCamelot = toCamelot(keyResult.key, keyResult.scale);

    return { bpm, musicalKey, keyCamelot };
  } finally {
    signal.delete();
  }
}

if (parentPort) {
  const port = parentPort;
  port.on('message', async (msg: AnalyzeRequest) => {
    try {
      const result = await analyzeTrack(msg);
      port.postMessage({
        trackId: msg.trackId,
        streamUrl: msg.streamUrl,
        bpm: result.bpm,
        musicalKey: result.musicalKey,
        keyCamelot: result.keyCamelot,
      });
    } catch (err) {
      port.postMessage({
        trackId: msg.trackId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
