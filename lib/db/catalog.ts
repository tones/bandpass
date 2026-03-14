import { query, queryOne, execute, transaction } from './index';

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
  bpm: number | null;
  musicalKey: string | null;
  keyCamelot: string | null;
  audioStorageKey: string | null;
}

const STALE_HOURS = 24;

export async function getCachedDiscography(slug: string): Promise<CatalogRelease[] | null> {
  const freshCheck = await queryOne<{ scraped_at: Date | string }>(`
    SELECT scraped_at FROM catalog_releases
    WHERE band_slug = $1 AND source = 'discography'
    ORDER BY scraped_at DESC LIMIT 1
  `, [slug]);

  if (!freshCheck) return null;

  const scrapedAt = freshCheck.scraped_at instanceof Date ? freshCheck.scraped_at : new Date(freshCheck.scraped_at);
  const ageMs = Date.now() - scrapedAt.getTime();
  if (ageMs > STALE_HOURS * 60 * 60 * 1000) return null;

  const rows = await query<{
    id: number;
    band_slug: string;
    band_name: string;
    band_url: string;
    title: string;
    url: string;
    image_url: string;
    release_type: string;
    scraped_at: Date | string;
    release_date: string | null;
    tags: string | string[];
  }>(`
    SELECT * FROM catalog_releases
    WHERE band_slug = $1
    ORDER BY
      CASE WHEN release_date IS NULL THEN 1 ELSE 0 END,
      release_date DESC
  `, [slug]);

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
  scraped_at: Date | string;
  release_date: string | null;
  tags: string | string[];
}): CatalogRelease {
  let tags: string[] = [];
  if (Array.isArray(row.tags)) {
    tags = row.tags;
  } else if (typeof row.tags === 'string') {
    try {
      tags = JSON.parse(row.tags || '[]');
    } catch {
      tags = [];
    }
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
    scrapedAt: row.scraped_at instanceof Date ? row.scraped_at.toISOString() : row.scraped_at,
    releaseDate: row.release_date,
    tags,
  };
}

export async function cacheDiscography(
  slug: string,
  bandName: string,
  bandUrl: string,
  releases: Array<{
    title: string;
    url: string;
    imageUrl: string;
    releaseType: 'album' | 'track';
  }>,
): Promise<CatalogRelease[]> {
  const existing = await query<{ url: string; release_date: string | null; tags: string | string[] }>(
    "SELECT url, release_date, tags FROM catalog_releases WHERE band_slug = $1",
    [slug],
  );
  const preserved = new Map(existing.map((r) => [r.url, { releaseDate: r.release_date, tags: r.tags }]));

  await transaction(async (client) => {
    await client.query("DELETE FROM catalog_releases WHERE band_slug = $1 AND source = 'discography'", [slug]);
    for (const r of releases) {
      const enrichmentExists = await client.query(
        "SELECT 1 FROM catalog_releases WHERE url = $1 AND source = 'enrichment'",
        [r.url],
      );
      if (enrichmentExists.rows.length > 0) continue;

      const prev = preserved.get(r.url);
      const tagsVal = prev?.tags != null ? (typeof prev.tags === 'string' ? prev.tags : JSON.stringify(prev.tags)) : '[]';
      await client.query(
        `INSERT INTO catalog_releases (band_slug, band_name, band_url, title, url, image_url, release_type, release_date, tags, source)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'discography')`,
        [slug, bandName, bandUrl, r.title, r.url, r.imageUrl, r.releaseType, prev?.releaseDate ?? null, tagsVal],
      );
    }
  });

  return (await getCachedDiscography(slug)) ?? [];
}

export async function getCachedAlbumTracks(releaseId: number): Promise<CatalogTrack[] | null> {
  const rows = await query<{
    id: number;
    release_id: number;
    track_num: number;
    title: string;
    duration: number;
    stream_url: string | null;
    track_url: string | null;
    bpm: number | null;
    musical_key: string | null;
    key_camelot: string | null;
    audio_storage_key: string | null;
  }>(`
    SELECT * FROM catalog_tracks WHERE release_id = $1 ORDER BY track_num
  `, [releaseId]);

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
  bpm: number | null;
  musical_key: string | null;
  key_camelot: string | null;
  audio_storage_key: string | null;
}): CatalogTrack {
  return {
    id: row.id,
    releaseId: row.release_id,
    trackNum: row.track_num,
    title: row.title,
    duration: row.duration,
    streamUrl: row.stream_url,
    trackUrl: row.track_url,
    bpm: row.bpm ?? null,
    musicalKey: row.musical_key ?? null,
    keyCamelot: row.key_camelot ?? null,
    audioStorageKey: row.audio_storage_key ?? null,
  };
}

export async function cacheAlbumTracks(
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
): Promise<CatalogTrack[]> {
  await transaction(async (client) => {
    await client.query('DELETE FROM catalog_tracks WHERE release_id = $1', [releaseId]);
    for (const t of tracks) {
      await client.query(
        `INSERT INTO catalog_tracks (release_id, track_num, title, duration, stream_url, track_url)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [releaseId, t.trackNum, t.title, t.duration, t.streamUrl, t.trackUrl],
      );
    }
    if (releaseDate !== undefined || tags !== undefined) {
      const normalizedDate = releaseDate ? normalizeDate(releaseDate) : null;
      await client.query(
        `UPDATE catalog_releases
        SET release_date = COALESCE($1, release_date),
            tags = COALESCE($2::jsonb, tags)
        WHERE id = $3`,
        [normalizedDate, tags ? JSON.stringify(tags) : null, releaseId],
      );
    }
  });

  return (await getCachedAlbumTracks(releaseId)) ?? [];
}

export async function ensureCatalogRelease(
  url: string,
  bandName: string,
  bandSlug: string,
  title: string,
  imageUrl: string,
): Promise<number> {
  const existing = await queryOne<{ id: number }>('SELECT id FROM catalog_releases WHERE url = $1', [url]);
  if (existing) return existing.id;

  const result = await query<{ id: number }>(`
    INSERT INTO catalog_releases (band_slug, band_name, band_url, title, url, image_url, release_type, source)
    VALUES ($1, $2, $3, $4, $5, $6, 'album', 'enrichment')
    RETURNING id
  `, [bandSlug, bandName, `https://${bandSlug}.bandcamp.com`, title, url, imageUrl]);
  return result[0].id;
}

export async function getArtistsFromFeed(fanId: number): Promise<Array<{
  artistName: string;
  artistUrl: string;
  trackCount: number;
}>> {
  const rows = await query<{
    artist_name: string;
    artist_url: string;
    track_count: number;
  }>(`
    SELECT artist_name, artist_url, COUNT(*)::int as track_count
    FROM feed_items
    WHERE fan_id = $1 AND artist_url != ''
    GROUP BY artist_url
    ORDER BY track_count DESC
  `, [fanId]);

  return rows.map((r) => ({
    artistName: r.artist_name,
    artistUrl: r.artist_url,
    trackCount: r.track_count,
  }));
}

export interface ReleaseNeedingRefresh {
  releaseId: number;
  releaseUrl: string;
}

export async function getReleasesNeedingStreamRefresh(): Promise<ReleaseNeedingRefresh[]> {
  const rows = await query<{ release_id: number; release_url: string }>(`
    SELECT DISTINCT cr.id AS release_id, cr.url AS release_url
    FROM catalog_tracks ct
    JOIN catalog_releases cr ON cr.id = ct.release_id
    WHERE ct.bpm_status IS NULL
    ORDER BY cr.id
  `);
  return rows.map((r) => ({ releaseId: r.release_id, releaseUrl: r.release_url }));
}

export async function refreshStreamUrls(
  releaseId: number,
  freshTracks: Array<{ trackNum: number; streamUrl: string | null; trackUrl: string | null }>,
): Promise<void> {
  await transaction(async (client) => {
    for (const t of freshTracks) {
      await client.query(
        'UPDATE catalog_tracks SET stream_url = $1, track_url = COALESCE($2, track_url) WHERE release_id = $3 AND track_num = $4',
        [t.streamUrl, t.trackUrl, releaseId, t.trackNum],
      );
    }
  });
}

export async function markNoStreamTracks(releaseId?: number): Promise<number> {
  if (releaseId != null) {
    const result = await execute(
      "UPDATE catalog_tracks SET bpm_status = 'no_stream' WHERE release_id = $1 AND bpm_status IS NULL AND (stream_url IS NULL OR stream_url = '')",
      [releaseId],
    );
    return result.rowCount;
  }
  const result = await execute(
    "UPDATE catalog_tracks SET bpm_status = 'no_stream' WHERE bpm_status IS NULL AND (stream_url IS NULL OR stream_url = '')",
  );
  return result.rowCount;
}

export async function getPendingTracksForRelease(releaseId: number): Promise<Array<{ id: number; stream_url: string }>> {
  return query<{ id: number; stream_url: string }>(
    "SELECT id, stream_url FROM catalog_tracks WHERE release_id = $1 AND stream_url IS NOT NULL AND stream_url != '' AND bpm_status IS NULL ORDER BY track_num",
    [releaseId],
  );
}
