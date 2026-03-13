import { normalizeBpm, toCamelot, formatKey } from './camelot';

export interface AudioAnalysis {
  bpm: number;
  musicalKey: string;
  keyCamelot: string | null;
}

let essentiaInstance: InstanceType<typeof import('essentia.js').Essentia> | null = null;

async function getEssentia() {
  if (essentiaInstance) return essentiaInstance;
  const { Essentia, EssentiaWASM } = await import('essentia.js');
  essentiaInstance = new Essentia(EssentiaWASM);
  return essentiaInstance;
}

/**
 * Analyze an MP3 audio stream for BPM and musical key.
 * Downloads the MP3, decodes to PCM, and runs Essentia.js WASM algorithms.
 */
export async function analyzeTrack(
  streamUrl: string,
  cookie?: string,
): Promise<AudioAnalysis> {
  const headers: Record<string, string> = {};
  if (cookie) {
    headers['Cookie'] = `identity=${cookie}`;
  }

  const resp = await fetch(streamUrl, { headers, redirect: 'follow' });
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
