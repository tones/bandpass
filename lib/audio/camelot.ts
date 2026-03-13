const CAMELOT_MAP: Record<string, string> = {
  'C major': '8B', 'G major': '9B', 'D major': '10B', 'A major': '11B',
  'E major': '12B', 'B major': '1B', 'F# major': '2B', 'Gb major': '2B',
  'Db major': '3B', 'C# major': '3B', 'Ab major': '4B', 'G# major': '4B',
  'Eb major': '5B', 'D# major': '5B', 'Bb major': '6B', 'A# major': '6B',
  'F major': '7B',
  'A minor': '8A', 'E minor': '9A', 'B minor': '10A', 'F# minor': '11A',
  'Gb minor': '11A', 'C# minor': '12A', 'Db minor': '12A', 'G# minor': '1A',
  'Ab minor': '1A', 'Eb minor': '2A', 'D# minor': '2A', 'Bb minor': '3A',
  'A# minor': '3A', 'F minor': '4A', 'C minor': '5A', 'G minor': '6A',
  'D minor': '7A',
};

/** Convert Essentia key + scale (e.g. "F", "minor") to Camelot notation (e.g. "4A"). */
export function toCamelot(key: string, scale: string): string | null {
  return CAMELOT_MAP[`${key} ${scale}`] ?? null;
}

/** Format key + scale as a compact string (e.g. "Fm", "Cmaj"). */
export function formatKey(key: string, scale: string): string {
  return `${key}${scale === 'minor' ? 'm' : ''}`;
}

/** Normalize BPM to a DJ-friendly range (70-180) by doubling or halving. */
export function normalizeBpm(bpm: number): number {
  if (bpm <= 0) return 0;
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}
