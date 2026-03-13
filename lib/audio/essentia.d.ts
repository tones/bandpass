declare module 'essentia.js' {
  export class Essentia {
    constructor(wasm: unknown);
    arrayToVector(arr: Float32Array): { delete(): void };
    PercivalBpmEstimator(signal: { delete(): void }): { bpm: number };
    KeyExtractor(signal: { delete(): void }): { key: string; scale: string; strength: number };
    shutdown(): void;
  }
  export const EssentiaWASM: unknown;
}
