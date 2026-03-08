// lib/bandcamp/service.ts
import { BandcampAPI } from './api';

let instance: BandcampAPI | null = null;

export function getBandcamp(): BandcampAPI {
  if (!instance) {
    const cookie = process.env.BANDCAMP_IDENTITY;
    if (!cookie) {
      throw new Error(
        'BANDCAMP_IDENTITY environment variable is not set. ' +
        'Copy your identity cookie from Bandcamp DevTools into .env.local',
      );
    }
    instance = new BandcampAPI(cookie);
  }
  return instance;
}
