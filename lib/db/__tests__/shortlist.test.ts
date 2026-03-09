import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedCatalogRelease, seedCatalogTrack } from './helpers';

let testDb: Database.Database;

vi.mock('../index', () => ({
  getDb: () => testDb,
}));

import {
  catalogTrackShortlistId,
  getShortlistCatalogItems,
  addToShortlist,
  removeFromShortlist,
  isShortlisted,
  getShortlist,
  getShortlistCount,
} from '../shortlist';

const fanId = 100;

beforeEach(() => {
  testDb = createTestDb();
});

describe('catalogTrackShortlistId', () => {
  it('returns catalog-track-{id} format', () => {
    expect(catalogTrackShortlistId(42)).toBe('catalog-track-42');
    expect(catalogTrackShortlistId(0)).toBe('catalog-track-0');
    expect(catalogTrackShortlistId(99999)).toBe('catalog-track-99999');
  });
});

describe('getShortlistCatalogItems', () => {
  it('joins shortlist with catalog_tracks and catalog_releases', () => {
    const releaseId = seedCatalogRelease(testDb, {
      bandSlug: 'ghostfunk',
      bandName: 'Ghost Funk Orchestra',
      bandUrl: 'https://ghostfunk.bandcamp.com',
      title: 'A New Kind of Love',
      url: 'https://ghostfunk.bandcamp.com/album/a-new-kind-of-love',
      imageUrl: 'https://img/cover.jpg',
    });
    const trackId = seedCatalogTrack(testDb, releaseId, {
      trackNum: 3,
      title: 'Walk Like a Motherfucker',
      duration: 245.5,
      streamUrl: 'https://stream/track3.mp3',
      trackUrl: 'https://ghostfunk.bandcamp.com/track/walk-like-a-motherfucker',
    });

    const shortlistId = catalogTrackShortlistId(trackId);
    addToShortlist(fanId, shortlistId);

    const items = getShortlistCatalogItems(fanId);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      shortlistId,
      trackId,
      trackTitle: 'Walk Like a Motherfucker',
      trackDuration: 245.5,
      streamUrl: 'https://stream/track3.mp3',
      trackUrl: 'https://ghostfunk.bandcamp.com/track/walk-like-a-motherfucker',
      releaseTitle: 'A New Kind of Love',
      releaseUrl: 'https://ghostfunk.bandcamp.com/album/a-new-kind-of-love',
      imageUrl: 'https://img/cover.jpg',
      bandName: 'Ghost Funk Orchestra',
      bandUrl: 'https://ghostfunk.bandcamp.com',
    });
  });

  it('ignores non-catalog shortlist entries', () => {
    addToShortlist(fanId, 'feed-item-123');
    addToShortlist(fanId, 'another-feed-item');

    const items = getShortlistCatalogItems(fanId);
    expect(items).toEqual([]);
  });

  it('returns empty array when no catalog items shortlisted', () => {
    expect(getShortlistCatalogItems(fanId)).toEqual([]);
  });

  it('returns multiple catalog items from different releases', () => {
    const release1 = seedCatalogRelease(testDb, { bandSlug: 'a', title: 'Album A' });
    const release2 = seedCatalogRelease(testDb, { bandSlug: 'b', title: 'Album B' });
    const track1 = seedCatalogTrack(testDb, release1, { title: 'Track 1' });
    const track2 = seedCatalogTrack(testDb, release2, { title: 'Track 2' });

    addToShortlist(fanId, catalogTrackShortlistId(track1));
    addToShortlist(fanId, catalogTrackShortlistId(track2));

    const items = getShortlistCatalogItems(fanId);
    expect(items).toHaveLength(2);
    const titles = items.map((i) => i.trackTitle).sort();
    expect(titles).toEqual(['Track 1', 'Track 2']);
  });

  it('handles null streamUrl and trackUrl', () => {
    const releaseId = seedCatalogRelease(testDb);
    const trackId = seedCatalogTrack(testDb, releaseId, {
      title: 'No Stream',
      streamUrl: null,
      trackUrl: null,
    });

    addToShortlist(fanId, catalogTrackShortlistId(trackId));

    const items = getShortlistCatalogItems(fanId);
    expect(items).toHaveLength(1);
    expect(items[0].streamUrl).toBeNull();
    expect(items[0].trackUrl).toBeNull();
  });
});

describe('shortlist functions with catalog IDs', () => {
  it('addToShortlist and isShortlisted work with catalog track IDs', () => {
    const id = catalogTrackShortlistId(42);
    expect(isShortlisted(fanId, id)).toBe(false);

    addToShortlist(fanId, id);
    expect(isShortlisted(fanId, id)).toBe(true);
  });

  it('removeFromShortlist works with catalog track IDs', () => {
    const id = catalogTrackShortlistId(42);
    addToShortlist(fanId, id);
    expect(isShortlisted(fanId, id)).toBe(true);

    removeFromShortlist(fanId, id);
    expect(isShortlisted(fanId, id)).toBe(false);
  });

  it('getShortlist includes catalog track IDs', () => {
    addToShortlist(fanId, 'feed-item-1');
    addToShortlist(fanId, catalogTrackShortlistId(10));
    addToShortlist(fanId, catalogTrackShortlistId(20));

    const all = getShortlist(fanId);
    expect(all.size).toBe(3);
    expect(all.has('feed-item-1')).toBe(true);
    expect(all.has('catalog-track-10')).toBe(true);
    expect(all.has('catalog-track-20')).toBe(true);
  });

  it('getShortlistCount counts both feed and catalog items', () => {
    addToShortlist(fanId, 'feed-item-1');
    addToShortlist(fanId, catalogTrackShortlistId(10));

    expect(getShortlistCount(fanId)).toBe(2);
  });
});
