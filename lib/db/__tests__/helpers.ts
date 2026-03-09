import Database from 'better-sqlite3';

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE feed_items (
      id TEXT NOT NULL,
      fan_id INTEGER NOT NULL,
      story_type TEXT NOT NULL,
      date TEXT NOT NULL,
      album_id INTEGER,
      album_title TEXT DEFAULT '',
      album_url TEXT DEFAULT '',
      album_image_url TEXT DEFAULT '',
      artist_id INTEGER,
      artist_name TEXT DEFAULT '',
      artist_url TEXT DEFAULT '',
      track_title TEXT,
      track_duration REAL,
      track_stream_url TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      price_amount REAL,
      price_currency TEXT,
      fan_name TEXT,
      fan_username TEXT,
      also_collected_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (id, fan_id)
    );

    CREATE INDEX idx_feed_fan_date ON feed_items(fan_id, date DESC);
    CREATE INDEX idx_feed_fan_type ON feed_items(fan_id, story_type);

    CREATE TABLE sync_state (
      fan_id INTEGER PRIMARY KEY,
      oldest_story_date INTEGER,
      newest_story_date INTEGER,
      total_items INTEGER NOT NULL DEFAULT 0,
      is_syncing INTEGER NOT NULL DEFAULT 0,
      last_sync_at TEXT,
      deep_sync_complete INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE shortlist (
      fan_id INTEGER NOT NULL,
      feed_item_id TEXT NOT NULL,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (fan_id, feed_item_id)
    );

    CREATE TABLE catalog_releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      band_slug TEXT NOT NULL,
      band_name TEXT NOT NULL,
      band_url TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      image_url TEXT DEFAULT '',
      release_type TEXT NOT NULL DEFAULT 'album',
      scraped_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_catalog_band ON catalog_releases(band_slug);

    CREATE TABLE catalog_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      release_id INTEGER NOT NULL,
      track_num INTEGER,
      title TEXT NOT NULL,
      duration REAL,
      stream_url TEXT,
      track_url TEXT,
      FOREIGN KEY (release_id) REFERENCES catalog_releases(id) ON DELETE CASCADE
    );
  `);

  return db;
}

export function seedCatalogRelease(
  db: Database.Database,
  overrides: Partial<{
    bandSlug: string;
    bandName: string;
    bandUrl: string;
    title: string;
    url: string;
    imageUrl: string;
    releaseType: string;
    scrapedAt: string;
  }> = {},
): number {
  const result = db.prepare(`
    INSERT INTO catalog_releases (band_slug, band_name, band_url, title, url, image_url, release_type, scraped_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    overrides.bandSlug ?? 'testband',
    overrides.bandName ?? 'Test Band',
    overrides.bandUrl ?? 'https://testband.bandcamp.com',
    overrides.title ?? 'Test Album',
    overrides.url ?? 'https://testband.bandcamp.com/album/test-album',
    overrides.imageUrl ?? 'https://f4.bcbits.com/img/a123_5.jpg',
    overrides.releaseType ?? 'album',
    overrides.scrapedAt ?? new Date().toISOString().replace('T', ' ').slice(0, 19),
  );
  return Number(result.lastInsertRowid);
}

export function seedCatalogTrack(
  db: Database.Database,
  releaseId: number,
  overrides: Partial<{
    trackNum: number;
    title: string;
    duration: number;
    streamUrl: string | null;
    trackUrl: string | null;
  }> = {},
): number {
  const result = db.prepare(`
    INSERT INTO catalog_tracks (release_id, track_num, title, duration, stream_url, track_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    releaseId,
    overrides.trackNum ?? 1,
    overrides.title ?? 'Test Track',
    overrides.duration ?? 180.0,
    'streamUrl' in overrides ? overrides.streamUrl : 'https://example.com/stream.mp3',
    'trackUrl' in overrides ? overrides.trackUrl : 'https://testband.bandcamp.com/track/test-track',
  );
  return Number(result.lastInsertRowid);
}

export function seedFeedItem(
  db: Database.Database,
  fanId: number,
  overrides: Partial<{
    id: string;
    storyType: string;
    date: string;
    albumTitle: string;
    artistName: string;
    trackTitle: string | null;
    tags: string[];
    priceAmount: number | null;
    priceCurrency: string | null;
    fanName: string | null;
    fanUsername: string | null;
  }> = {},
) {
  const id = overrides.id ?? `item-${Math.random().toString(36).slice(2)}`;
  db.prepare(`
    INSERT OR REPLACE INTO feed_items (
      id, fan_id, story_type, date,
      album_title, artist_name,
      track_title, tags,
      price_amount, price_currency,
      fan_name, fan_username, also_collected_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    id,
    fanId,
    overrides.storyType ?? 'new_release',
    overrides.date ?? new Date().toISOString(),
    overrides.albumTitle ?? 'Test Album',
    overrides.artistName ?? 'Test Artist',
    overrides.trackTitle ?? null,
    JSON.stringify(overrides.tags ?? []),
    overrides.priceAmount ?? null,
    overrides.priceCurrency ?? null,
    overrides.fanName ?? null,
    overrides.fanUsername ?? null,
  );
  return id;
}
