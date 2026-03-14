/**
 * Spike: validate S3 upload + presigned URL workflow for audio storage.
 *
 * Prerequisites:
 *   - AWS credentials set as env vars (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 *   - S3 bucket created with CORS configured for bandpass origins
 *
 * Usage:
 *   AWS_ACCESS_KEY_ID=xxx AWS_SECRET_ACCESS_KEY=xxx \
 *   AWS_S3_BUCKET=bandpass-audio AWS_S3_REGION=us-west-2 \
 *   npx tsx scripts/spike-s3.ts [optional-bandcamp-stream-url]
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BUCKET = process.env.AWS_S3_BUCKET;
const REGION = process.env.AWS_S3_REGION || 'us-west-2';

if (!BUCKET) {
  console.error('Missing AWS_S3_BUCKET env var');
  process.exit(1);
}

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error('Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY env vars');
  process.exit(1);
}

const s3 = new S3Client({ region: REGION });

async function main() {
  console.log('=== S3 Audio Storage Spike ===\n');
  console.log(`Bucket: ${BUCKET}`);
  console.log(`Region: ${REGION}\n`);

  // Step 1: Get a test MP3
  const testUrl = process.argv[2];
  let mp3Buffer: Buffer;

  if (testUrl) {
    console.log('1. Downloading MP3 from provided URL...');
    console.log(`   URL: ${testUrl.substring(0, 80)}...`);
    const t0 = performance.now();
    const resp = await fetch(testUrl);
    if (!resp.ok) {
      console.error(`   FAILED: HTTP ${resp.status} -- URL may be expired`);
      process.exit(1);
    }
    mp3Buffer = Buffer.from(await resp.arrayBuffer());
    console.log(
      `   Downloaded ${(mp3Buffer.length / 1024 / 1024).toFixed(2)} MB in ${Math.round(performance.now() - t0)}ms`,
    );
  } else {
    console.log('1. No URL provided, generating a minimal test MP3...');
    mp3Buffer = createMinimalMp3();
    console.log(`   Generated ${mp3Buffer.length} bytes`);
  }

  // Step 2: Upload to S3
  const key = `tracks/spike-test-${Date.now()}.mp3`;
  console.log(`\n2. Uploading to S3 as "${key}"...`);
  const uploadStart = performance.now();
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: mp3Buffer,
      ContentType: 'audio/mpeg',
    }),
  );
  const uploadMs = Math.round(performance.now() - uploadStart);
  console.log(`   Uploaded in ${uploadMs}ms`);

  // Step 3: Verify the object exists
  console.log('\n3. Verifying object exists (HeadObject)...');
  const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  console.log(`   Content-Type: ${head.ContentType}`);
  console.log(`   Content-Length: ${head.ContentLength} bytes`);

  // Step 4: Generate presigned GET URL (1 hour expiry)
  console.log('\n4. Generating presigned GET URL (1 hour expiry)...');
  const presignedUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 3600 },
  );
  console.log(`\n   Presigned URL:\n   ${presignedUrl}`);

  // Step 5: Verify the presigned URL works via HTTP fetch
  console.log('\n5. Fetching via presigned URL to verify...');
  const verifyResp = await fetch(presignedUrl);
  console.log(`   Status: ${verifyResp.status}`);
  console.log(`   Content-Type: ${verifyResp.headers.get('content-type')}`);
  console.log(`   Content-Length: ${verifyResp.headers.get('content-length')}`);

  if (verifyResp.ok) {
    const body = Buffer.from(await verifyResp.arrayBuffer());
    console.log(`   Body size: ${body.length} bytes`);
    console.log(`   Matches upload: ${body.length === mp3Buffer.length}`);
  } else {
    console.error('   FAILED to fetch presigned URL');
  }

  console.log('\n=== Results ===');
  console.log(`Upload size:  ${(mp3Buffer.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Upload time:  ${uploadMs}ms`);
  console.log(`S3 key:       ${key}`);
  console.log(`\nPresigned URL (paste in browser to test playback):\n${presignedUrl}`);

  if (!testUrl) {
    console.log(
      '\nNote: This was a minimal test file. Re-run with a Bandcamp stream URL as an argument to test real audio.',
    );
  }
}

function createMinimalMp3(): Buffer {
  // Minimal valid MP3 frame: MPEG1 Layer3 128kbps 44100Hz stereo
  // Frame header: FF FB 90 04
  const frameSize = 417;
  const frame = Buffer.alloc(frameSize);
  frame[0] = 0xff;
  frame[1] = 0xfb;
  frame[2] = 0x90;
  frame[3] = 0x04;
  return Buffer.concat([frame, frame, frame, frame, frame]);
}

main().catch((err) => {
  console.error('Spike failed:', err);
  process.exit(1);
});
