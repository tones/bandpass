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

const FETCH_TIMEOUT_MS = 10_000;

async function analyzeTrack(req: AnalyzeRequest) {
  const headers: Record<string, string> = {};
  if (req.cookie) {
    headers['Cookie'] = `identity=${req.cookie}`;
  }

  // Phase 1: Fetch audio
  let mp3Buffer: Buffer;
  try {
    const controller = new AbortController();
    const fetchTimer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let resp: Response;
    try {
      resp = await fetch(req.streamUrl, {
        headers,
        redirect: 'follow',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(fetchTimer);
    }

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    mp3Buffer = Buffer.from(await resp.arrayBuffer());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`fetch failed: ${msg}`);
  }

  // Phase 2: Decode MP3 to PCM
  let pcm: Float32Array;
  try {
    const decode = (await import('audio-decode')).default;
    const audioBuffer = await decode(mp3Buffer);
    pcm = audioBuffer.getChannelData(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`decode failed: ${msg}`);
  }

  // Phase 3: BPM + Key analysis
  const essentia = await getEssentia();
  const signal = essentia.arrayToVector(pcm);

  try {
    const bpmResult = essentia.PercivalBpmEstimator(signal);
    const bpm = normalizeBpm(bpmResult.bpm);

    const keyResult = essentia.KeyExtractor(signal);
    const musicalKey = formatKey(keyResult.key, keyResult.scale);
    const keyCamelot = toCamelot(keyResult.key, keyResult.scale);

    return { bpm, musicalKey, keyCamelot };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`analysis failed: ${msg}`);
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
