import { BandcampAPI } from './api';
import { getIdentityCookie } from '@/lib/session';

export async function getBandcamp(): Promise<BandcampAPI> {
  const cookie = await getIdentityCookie();
  if (!cookie) {
    throw new Error('Not authenticated');
  }
  return new BandcampAPI(cookie);
}
