/**
 * Spike script: validates that we can download a Bandcamp MP3,
 * decode it, and extract BPM + key using Essentia.js WASM.
 *
 * Usage: npx tsx scripts/test-audio-analysis.ts
 */

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'bandpass.db');

const CAMELOT: Record<string, string> = {
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

function toCamelot(key: string, scale: string): string {
  return CAMELOT[`${key} ${scale}`] ?? `${key}${scale === 'minor' ? 'm' : ''}`;
}

function normalizeBpm(bpm: number): number {
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}

async function main() {
  const startTotal = performance.now();
  const memBefore = process.memoryUsage();

  console.log('=== BPM/Key Detection Spike ===\n');

  // 1. Find a track with a stream URL
  console.log('1. Finding a track in the local DB...');
  const db = new Database(DB_PATH, { readonly: true });
  const track = db.prepare(`
    SELECT ct.id, ct.title, ct.stream_url, ct.duration, cr.title as release_title, cr.band_name
    FROM catalog_tracks ct
    JOIN catalog_releases cr ON cr.id = ct.release_id
    WHERE ct.stream_url IS NOT NULL AND ct.stream_url != ''
    ORDER BY ct.id DESC LIMIT 1
  `).get() as { id: number; title: string; stream_url: string; duration: number; release_title: string; band_name: string } | undefined;
  db.close();

  if (!track) {
    console.error('No tracks with stream URLs found in DB');
    process.exit(1);
  }
  console.log(`   Track: "${track.title}" by ${track.band_name}`);
  console.log(`   Album: ${track.release_title}`);
  console.log(`   Duration: ${track.duration ? Math.round(track.duration) + 's' : 'unknown'}`);
  console.log(`   Stream URL: ${track.stream_url.substring(0, 80)}...`);

  // 2. Download the MP3
  console.log('\n2. Downloading MP3...');
  const dlStart = performance.now();
  const resp = await fetch(track.stream_url);
  if (!resp.ok) {
    console.error(`   FAILED: HTTP ${resp.status} ${resp.statusText}`);
    console.error('   Stream URLs may be expired. Try re-syncing the DB from Fly.io.');
    process.exit(1);
  }
  const mp3Buffer = Buffer.from(await resp.arrayBuffer());
  const dlTime = performance.now() - dlStart;
  console.log(`   Downloaded ${(mp3Buffer.length / 1024 / 1024).toFixed(2)} MB in ${Math.round(dlTime)}ms`);

  // 3. Decode MP3 to PCM
  console.log('\n3. Decoding MP3 to PCM...');
  const decodeStart = performance.now();
  const decode = (await import('audio-decode')).default;
  const audioBuffer = await decode(mp3Buffer);
  const decodeTime = performance.now() - decodeStart;
  const pcm = audioBuffer.getChannelData(0); // mono, first channel
  console.log(`   Sample rate: ${audioBuffer.sampleRate} Hz`);
  console.log(`   Channels: ${audioBuffer.numberOfChannels}`);
  console.log(`   Duration: ${audioBuffer.duration.toFixed(2)}s`);
  console.log(`   PCM samples: ${pcm.length} (${(pcm.length * 4 / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`   Decoded in ${Math.round(decodeTime)}ms`);

  // 4. Initialize Essentia.js
  console.log('\n4. Initializing Essentia.js WASM...');
  const essentiaStart = performance.now();
  const { Essentia, EssentiaWASM } = await import('essentia.js');
  const essentia = new Essentia(EssentiaWASM);
  const essentiaInitTime = performance.now() - essentiaStart;
  console.log(`   Essentia version: ${essentia.version}`);
  console.log(`   Initialized in ${Math.round(essentiaInitTime)}ms`);

  // 5. Convert audio to Essentia vector
  console.log('\n5. Running BPM detection (PercivalBpmEstimator)...');
  const bpmStart = performance.now();
  const signal = essentia.arrayToVector(pcm);
  const bpmResult = essentia.PercivalBpmEstimator(signal);
  const rawBpm = bpmResult.bpm;
  const bpm = normalizeBpm(rawBpm);
  const bpmTime = performance.now() - bpmStart;
  console.log(`   Raw BPM: ${rawBpm}`);
  console.log(`   Normalized BPM: ${bpm}`);
  console.log(`   Analysis took ${Math.round(bpmTime)}ms`);

  // 6. Run key detection
  console.log('\n6. Running key detection (KeyExtractor)...');
  const keyStart = performance.now();
  const keyResult = essentia.KeyExtractor(signal);
  const keyTime = performance.now() - keyStart;
  const camelot = toCamelot(keyResult.key, keyResult.scale);
  console.log(`   Key: ${keyResult.key} ${keyResult.scale}`);
  console.log(`   Strength: ${keyResult.strength.toFixed(3)}`);
  console.log(`   Camelot: ${camelot}`);
  console.log(`   Analysis took ${Math.round(keyTime)}ms`);

  // 7. Memory and summary
  const memAfter = process.memoryUsage();
  const totalTime = performance.now() - startTotal;

  console.log('\n=== Summary ===');
  console.log(`Track:     "${track.title}" by ${track.band_name}`);
  console.log(`BPM:       ${bpm} (raw: ${rawBpm})`);
  console.log(`Key:       ${keyResult.key} ${keyResult.scale} (${camelot})`);
  console.log(`\nTiming:`);
  console.log(`  Download:    ${Math.round(dlTime)}ms`);
  console.log(`  Decode:      ${Math.round(decodeTime)}ms`);
  console.log(`  Essentia init: ${Math.round(essentiaInitTime)}ms`);
  console.log(`  BPM analysis:  ${Math.round(bpmTime)}ms`);
  console.log(`  Key analysis:  ${Math.round(keyTime)}ms`);
  console.log(`  Total:       ${Math.round(totalTime)}ms`);
  console.log(`\nMemory (RSS):`);
  console.log(`  Before: ${(memBefore.rss / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  After:  ${(memAfter.rss / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Delta:  ${((memAfter.rss - memBefore.rss) / 1024 / 1024).toFixed(1)} MB`);
  console.log(`\nHeap used: ${(memAfter.heapUsed / 1024 / 1024).toFixed(1)} MB`);

  essentia.shutdown();
  process.exit(0);
}

main().catch((err) => {
  console.error('Spike failed:', err);
  process.exit(1);
});
