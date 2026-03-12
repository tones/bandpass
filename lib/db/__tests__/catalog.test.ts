import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedFeedItem, seedCatalogRelease } from './helpers';

let testDb: Database.Database;

vi.mock('../index', () => ({
  getDb: () => testDb,
}));

import {
  getCachedDiscography,
  cacheDiscography,
  getCachedAlbumTracks,
  cacheAlbumTracks,
  getArtistsFromFeed,
  ensureCatalogRelease,
} from '../catalog';

beforeEach(() => {
  testDb = createTestDb();
});

describe('cacheDiscography + getCachedDiscography', () => {
  it('stores and retrieves releases', () => {
    const releases = cacheDiscography('testband', 'Test Band', 'https://testband.bandcamp.com', [
      { title: 'Album One', url: 'https://testband.bandcamp.com/album/one', imageUrl: 'https://img/1.jpg', releaseType: 'album' },
      { title: 'Single', url: 'https://testband.bandcamp.com/track/single', imageUrl: 'https://img/2.jpg', releaseType: 'track' },
    ]);

    expect(releases).toHaveLength(2);
    expect(releases[0].title).toBe('Album One');
    expect(releases[0].bandSlug).toBe('testband');
    expect(releases[0].bandName).toBe('Test Band');
    expect(releases[0].releaseType).toBe('album');
    expect(releases[1].title).toBe('Single');
    expect(releases[1].releaseType).toBe('track');

    const cached = getCachedDiscography('testband');
    expect(cached).toHaveLength(2);
    expect(cached![0].title).toBe('Album One');
  });

  it('re-caching replaces old data', () => {
    cacheDiscography('testband', 'Test Band', 'https://testband.bandcamp.com', [
      { title: 'Old Album', url: 'https://url/old', imageUrl: '', releaseType: 'album' },
    ]);
    expect(getCachedDiscography('testband')).toHaveLength(1);

    cacheDiscography('testband', 'Test Band', 'https://testband.bandcamp.com', [
      { title: 'New Album A', url: 'https://url/a', imageUrl: '', releaseType: 'album' },
      { title: 'New Album B', url: 'https://url/b', imageUrl: '', releaseType: 'album' },
    ]);

    const cached = getCachedDiscography('testband');
    expect(cached).toHaveLength(2);
    expect(cached![0].title).toBe('New Album A');
  });

  it('returns null for unknown slug', () => {
    expect(getCachedDiscography('nonexistent')).toBeNull();
  });

  it('different slugs are independent', () => {
    cacheDiscography('band-a', 'Band A', 'https://a.bandcamp.com', [
      { title: 'A1', url: 'https://a/1', imageUrl: '', releaseType: 'album' },
    ]);
    cacheDiscography('band-b', 'Band B', 'https://b.bandcamp.com', [
      { title: 'B1', url: 'https://b/1', imageUrl: '', releaseType: 'album' },
      { title: 'B2', url: 'https://b/2', imageUrl: '', releaseType: 'album' },
    ]);

    expect(getCachedDiscography('band-a')).toHaveLength(1);
    expect(getCachedDiscography('band-b')).toHaveLength(2);
  });
});

describe('getCachedDiscography staleness', () => {
  it('returns null when scraped_at is older than 24 hours', () => {
    const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19);

    seedCatalogRelease(testDb, {
      bandSlug: 'stale',
      title: 'Old Album',
      scrapedAt: staleDate,
    });

    expect(getCachedDiscography('stale')).toBeNull();
  });

  it('returns data when scraped_at is within 24 hours', () => {
    const freshDate = new Date(Date.now() - 23 * 60 * 60 * 1000)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19);

    seedCatalogRelease(testDb, {
      bandSlug: 'fresh',
      title: 'Fresh Album',
      scrapedAt: freshDate,
    });

    const result = getCachedDiscography('fresh');
    expect(result).toHaveLength(1);
    expect(result![0].title).toBe('Fresh Album');
  });
});

describe('cacheAlbumTracks + getCachedAlbumTracks', () => {
  it('stores and retrieves tracks including trackUrl', () => {
    const releaseId = seedCatalogRelease(testDb);

    const tracks = cacheAlbumTracks(releaseId, [
      { trackNum: 1, title: 'First', duration: 240.5, streamUrl: 'https://s/1.mp3', trackUrl: 'https://b.com/track/first' },
      { trackNum: 2, title: 'Second', duration: 180.0, streamUrl: null, trackUrl: null },
    ]);

    expect(tracks).toHaveLength(2);
    expect(tracks[0].trackNum).toBe(1);
    expect(tracks[0].title).toBe('First');
    expect(tracks[0].duration).toBe(240.5);
    expect(tracks[0].streamUrl).toBe('https://s/1.mp3');
    expect(tracks[0].trackUrl).toBe('https://b.com/track/first');
    expect(tracks[1].streamUrl).toBeNull();
    expect(tracks[1].trackUrl).toBeNull();
  });

  it('returns null for unknown release ID', () => {
    expect(getCachedAlbumTracks(99999)).toBeNull();
  });

  it('re-caching replaces old tracks', () => {
    const releaseId = seedCatalogRelease(testDb);

    cacheAlbumTracks(releaseId, [
      { trackNum: 1, title: 'Old Track', duration: 100, streamUrl: null, trackUrl: null },
    ]);
    expect(getCachedAlbumTracks(releaseId)).toHaveLength(1);

    cacheAlbumTracks(releaseId, [
      { trackNum: 1, title: 'New A', duration: 200, streamUrl: 'https://s/a.mp3', trackUrl: null },
      { trackNum: 2, title: 'New B', duration: 300, streamUrl: 'https://s/b.mp3', trackUrl: null },
    ]);

    const cached = getCachedAlbumTracks(releaseId);
    expect(cached).toHaveLength(2);
    expect(cached![0].title).toBe('New A');
  });

  it('orders tracks by track_num', () => {
    const releaseId = seedCatalogRelease(testDb);

    cacheAlbumTracks(releaseId, [
      { trackNum: 3, title: 'Third', duration: 100, streamUrl: null, trackUrl: null },
      { trackNum: 1, title: 'First', duration: 100, streamUrl: null, trackUrl: null },
      { trackNum: 2, title: 'Second', duration: 100, streamUrl: null, trackUrl: null },
    ]);

    const cached = getCachedAlbumTracks(releaseId);
    expect(cached!.map((t) => t.trackNum)).toEqual([1, 2, 3]);
  });
});

describe('getArtistsFromFeed', () => {
  const fanId = 100;

  it('groups by artist_url and counts correctly', () => {
    seedFeedItem(testDb, fanId, { id: 'a1', artistName: 'Band A' });
    seedFeedItem(testDb, fanId, { id: 'a2', artistName: 'Band A' });
    seedFeedItem(testDb, fanId, { id: 'a3', artistName: 'Band A' });
    seedFeedItem(testDb, fanId, { id: 'b1', artistName: 'Band B' });

    // seedFeedItem doesn't set artist_url, so we need to update directly
    testDb.prepare("UPDATE feed_items SET artist_url = 'https://banda.bandcamp.com' WHERE id LIKE 'a%' AND fan_id = ?").run(fanId);
    testDb.prepare("UPDATE feed_items SET artist_url = 'https://bandb.bandcamp.com' WHERE id = 'b1' AND fan_id = ?").run(fanId);

    const artists = getArtistsFromFeed(fanId);
    expect(artists).toHaveLength(2);
    expect(artists[0]).toEqual({
      artistName: 'Band A',
      artistUrl: 'https://banda.bandcamp.com',
      trackCount: 3,
    });
    expect(artists[1]).toEqual({
      artistName: 'Band B',
      artistUrl: 'https://bandb.bandcamp.com',
      trackCount: 1,
    });
  });

  it('excludes items with empty artist_url', () => {
    seedFeedItem(testDb, fanId, { id: 'x', artistName: 'No URL' });

    const artists = getArtistsFromFeed(fanId);
    expect(artists).toEqual([]);
  });

  it('returns empty array when no feed items', () => {
    expect(getArtistsFromFeed(fanId)).toEqual([]);
  });
});

describe('getCachedDiscography source filtering', () => {
  it('returns null when only enrichment-sourced rows exist', () => {
    testDb.prepare(`
      INSERT INTO catalog_releases (band_slug, band_name, band_url, title, url, image_url, release_type, source)
      VALUES ('testband', 'Test', 'https://testband.bandcamp.com', 'Enriched Album', 'https://testband.bandcamp.com/album/e', '', 'album', 'enrichment')
    `).run();

    expect(getCachedDiscography('testband')).toBeNull();
  });

  it('returns data when discography-sourced rows exist', () => {
    cacheDiscography('testband', 'Test', 'https://testband.bandcamp.com', [
      { title: 'Full Album', url: 'https://testband.bandcamp.com/album/full', imageUrl: '', releaseType: 'album' },
    ]);

    const result = getCachedDiscography('testband');
    expect(result).toHaveLength(1);
    expect(result![0].title).toBe('Full Album');
  });

  it('enrichment rows do not prevent a full scrape from being triggered', () => {
    ensureCatalogRelease(
      'https://testband.bandcamp.com/album/enriched',
      'Test', 'testband', 'Enriched', '',
    );

    expect(getCachedDiscography('testband')).toBeNull();
  });

  it('cacheDiscography replaces enrichment rows with full discography', () => {
    ensureCatalogRelease(
      'https://testband.bandcamp.com/album/enriched',
      'Test', 'testband', 'Enriched', '',
    );

    const countBefore = (testDb.prepare('SELECT COUNT(*) AS c FROM catalog_releases WHERE band_slug = ?').get('testband') as { c: number }).c;
    expect(countBefore).toBe(1);

    cacheDiscography('testband', 'Test', 'https://testband.bandcamp.com', [
      { title: 'Album A', url: 'https://testband.bandcamp.com/album/a', imageUrl: '', releaseType: 'album' },
      { title: 'Album B', url: 'https://testband.bandcamp.com/album/b', imageUrl: '', releaseType: 'album' },
    ]);

    const result = getCachedDiscography('testband');
    expect(result).toHaveLength(2);
  });

  it('ensureCatalogRelease sets source to enrichment', () => {
    ensureCatalogRelease(
      'https://testband.bandcamp.com/album/e',
      'Test', 'testband', 'E', '',
    );

    const row = testDb.prepare('SELECT source FROM catalog_releases WHERE band_slug = ?').get('testband') as { source: string };
    expect(row.source).toBe('enrichment');
  });
});

describe('ensureCatalogRelease', () => {
  const url = 'https://testband.bandcamp.com/album/test';
  const bandName = 'Test Band';
  const bandSlug = 'testband';
  const title = 'Test Album';
  const imageUrl = 'https://f4.bcbits.com/img/a123.jpg';

  it('creates a new release when none exists for the URL', () => {
    const id = ensureCatalogRelease(url, bandName, bandSlug, title, imageUrl);
    expect(id).toBeGreaterThan(0);

    const row = testDb.prepare('SELECT * FROM catalog_releases WHERE id = ?').get(id) as {
      band_slug: string;
      band_name: string;
      title: string;
      url: string;
      image_url: string;
    };
    expect(row.band_slug).toBe(bandSlug);
    expect(row.band_name).toBe(bandName);
    expect(row.title).toBe(title);
    expect(row.url).toBe(url);
    expect(row.image_url).toBe(imageUrl);
  });

  it('returns existing release ID when URL already exists', () => {
    const first = ensureCatalogRelease(url, bandName, bandSlug, title, imageUrl);
    const second = ensureCatalogRelease(url, bandName, bandSlug, title, imageUrl);
    expect(first).toBe(second);

    const count = (testDb.prepare('SELECT COUNT(*) AS c FROM catalog_releases WHERE url = ?').get(url) as { c: number }).c;
    expect(count).toBe(1);
  });

  it('creates separate releases for different URLs', () => {
    const id1 = ensureCatalogRelease(url, bandName, bandSlug, title, imageUrl);
    const id2 = ensureCatalogRelease(url + '-2', bandName, bandSlug, 'Another Album', imageUrl);
    expect(id1).not.toBe(id2);
  });
});
