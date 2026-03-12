import { getDb } from './index';

function normalizeDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toISOString().slice(0, 10);
}

export interface CatalogRelease {
  id: number;
  bandSlug: string;
  bandName: string;
  bandUrl: string;
  title: string;
  url: string;
  imageUrl: string;
  releaseType: 'album' | 'track';
  scrapedAt: string;
  releaseDate: string | null;
  tags: string[];
}

export interface CatalogTrack {
  id: number;
  releaseId: number;
  trackNum: number;
  title: string;
  duration: number;
  streamUrl: string | null;
  trackUrl: string | null;
}

const STALE_HOURS = 24;

export function getCachedDiscography(slug: string): CatalogRelease[] | null {
  const db = getDb();

  const freshCheck = db.prepare(`
    SELECT scraped_at FROM catalog_releases
    WHERE band_slug = ? AND source = 'discography'
    ORDER BY scraped_at DESC LIMIT 1
  `).get(slug) as { scraped_at: string } | undefined;

  if (!freshCheck) return null;

  const scrapedAt = new Date(freshCheck.scraped_at + 'Z');
  const ageMs = Date.now() - scrapedAt.getTime();
  if (ageMs > STALE_HOURS * 60 * 60 * 1000) return null;

  const rows = db.prepare(`
    SELECT * FROM catalog_releases
    WHERE band_slug = ?
    ORDER BY 
      CASE WHEN release_date IS NULL THEN 1 ELSE 0 END,
      release_date DESC
  `).all(slug) as Array<{
    id: number;
    band_slug: string;
    band_name: string;
    band_url: string;
    title: string;
    url: string;
    image_url: string;
    release_type: string;
    scraped_at: string;
    release_date: string | null;
    tags: string;
  }>;

  if (rows.length === 0) return null;

  return rows.map(rowToRelease);
}

function rowToRelease(row: {
  id: number;
  band_slug: string;
  band_name: string;
  band_url: string;
  title: string;
  url: string;
  image_url: string;
  release_type: string;
  scraped_at: string;
  release_date: string | null;
  tags: string;
}): CatalogRelease {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags || '[]');
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    bandSlug: row.band_slug,
    bandName: row.band_name,
    bandUrl: row.band_url,
    title: row.title,
    url: row.url,
    imageUrl: row.image_url,
    releaseType: row.release_type as 'album' | 'track',
    scrapedAt: row.scraped_at,
    releaseDate: row.release_date,
    tags,
  };
}

export function cacheDiscography(
  slug: string,
  bandName: string,
  bandUrl: string,
  releases: Array<{
    title: string;
    url: string;
    imageUrl: string;
    releaseType: 'album' | 'track';
  }>,
): CatalogRelease[] {
  const db = getDb();

  db.prepare('DELETE FROM catalog_releases WHERE band_slug = ?').run(slug);

  const insert = db.prepare(`
    INSERT INTO catalog_releases (band_slug, band_name, band_url, title, url, image_url, release_type, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'discography')
  `);

  const insertMany = db.transaction(() => {
    for (const r of releases) {
      insert.run(slug, bandName, bandUrl, r.title, r.url, r.imageUrl, r.releaseType);
    }
  });
  insertMany();

  return getCachedDiscography(slug) ?? [];
}

export function getCachedAlbumTracks(releaseId: number): CatalogTrack[] | null {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM catalog_tracks WHERE release_id = ? ORDER BY track_num
  `).all(releaseId) as Array<{
    id: number;
    release_id: number;
    track_num: number;
    title: string;
    duration: number;
    stream_url: string | null;
    track_url: string | null;
  }>;

  if (rows.length === 0) return null;
  return rows.map(rowToTrack);
}

function rowToTrack(row: {
  id: number;
  release_id: number;
  track_num: number;
  title: string;
  duration: number;
  stream_url: string | null;
  track_url: string | null;
}): CatalogTrack {
  return {
    id: row.id,
    releaseId: row.release_id,
    trackNum: row.track_num,
    title: row.title,
    duration: row.duration,
    streamUrl: row.stream_url,
    trackUrl: row.track_url,
  };
}

export function cacheAlbumTracks(
  releaseId: number,
  tracks: Array<{
    trackNum: number;
    title: string;
    duration: number;
    streamUrl: string | null;
    trackUrl: string | null;
  }>,
  releaseDate?: string | null,
  tags?: string[],
): CatalogTrack[] {
  const db = getDb();

  const insertTrack = db.prepare(`
    INSERT INTO catalog_tracks (release_id, track_num, title, duration, stream_url, track_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const updateRelease = db.prepare(`
    UPDATE catalog_releases
    SET release_date = COALESCE(?, release_date),
        tags = COALESCE(?, tags)
    WHERE id = ?
  `);

  const doAll = db.transaction(() => {
    db.prepare('DELETE FROM catalog_tracks WHERE release_id = ?').run(releaseId);
    for (const t of tracks) {
      insertTrack.run(releaseId, t.trackNum, t.title, t.duration, t.streamUrl, t.trackUrl);
    }
    if (releaseDate !== undefined || tags !== undefined) {
      const normalizedDate = releaseDate ? normalizeDate(releaseDate) : null;
      updateRelease.run(
        normalizedDate,
        tags ? JSON.stringify(tags) : null,
        releaseId,
      );
    }
  });
  doAll();

  return getCachedAlbumTracks(releaseId) ?? [];
}

export function ensureCatalogRelease(
  url: string,
  bandName: string,
  bandSlug: string,
  title: string,
  imageUrl: string,
): number {
  const db = getDb();
  const existing = db.prepare(
    'SELECT id FROM catalog_releases WHERE url = ?',
  ).get(url) as { id: number } | undefined;
  if (existing) return existing.id;

  const result = db.prepare(`
    INSERT INTO catalog_releases (band_slug, band_name, band_url, title, url, image_url, release_type, source)
    VALUES (?, ?, ?, ?, ?, ?, 'album', 'enrichment')
  `).run(bandSlug, bandName, `https://${bandSlug}.bandcamp.com`, title, url, imageUrl);
  return Number(result.lastInsertRowid);
}

export function getArtistsFromFeed(fanId: number): Array<{
  artistName: string;
  artistUrl: string;
  trackCount: number;
}> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT artist_name, artist_url, COUNT(*) as track_count
    FROM feed_items
    WHERE fan_id = ? AND artist_url != ''
    GROUP BY artist_url
    ORDER BY track_count DESC
  `).all(fanId) as Array<{
    artist_name: string;
    artist_url: string;
    track_count: number;
  }>;

  return rows.map((r) => ({
    artistName: r.artist_name,
    artistUrl: r.artist_url,
    trackCount: r.track_count,
  }));
}
