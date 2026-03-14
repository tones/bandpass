import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';

const PRESIGNED_EXPIRY_S = 3600;

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({ region: process.env.AWS_S3_REGION || 'us-east-2' });
  return client;
}

function getBucket(): string {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error('AWS_S3_BUCKET is not set');
  return bucket;
}

export function isS3Configured(): boolean {
  return !!(
    process.env.AWS_S3_BUCKET &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );
}

export function trackKey(trackId: number): string {
  return `tracks/${trackId}.mp3`;
}

export async function uploadTrackFromFile(
  trackId: number,
  filePath: string,
): Promise<string> {
  const key = trackKey(trackId);

  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentType: 'audio/mpeg',
    }),
  );

  return key;
}

export async function getPresignedUrl(key: string): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    { expiresIn: PRESIGNED_EXPIRY_S },
  );
}
