import { BandcampAPI } from './api';
import { BandcampClient } from './client';
import { getIdentityCookie } from '@/lib/auth';

export async function getBandcamp(): Promise<BandcampAPI> {
  const cookie = await getIdentityCookie();
  if (!cookie) {
    throw new Error('Not authenticated');
  }
  return new BandcampAPI(cookie);
}

export async function getBandcampClient(): Promise<BandcampClient> {
  const cookie = await getIdentityCookie();
  if (!cookie) {
    throw new Error('Not authenticated');
  }
  return new BandcampClient(cookie);
}
