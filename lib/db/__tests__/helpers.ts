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
      bpm REAL,
      musical_key TEXT,
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
      deep_sync_complete INTEGER NOT NULL DEFAULT 0,
      collection_synced INTEGER NOT NULL DEFAULT 0,
      wishlist_synced INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE crates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fan_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_crates_fan ON crates(fan_id);

    CREATE TABLE crate_items (
      crate_id INTEGER NOT NULL REFERENCES crates(id) ON DELETE CASCADE,
      feed_item_id TEXT NOT NULL,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (crate_id, feed_item_id)
    );

    CREATE TABLE wishlist_items (
      id TEXT NOT NULL,
      fan_id INTEGER NOT NULL,
      tralbum_id INTEGER NOT NULL,
      tralbum_type TEXT NOT NULL,
      title TEXT NOT NULL,
      artist_name TEXT NOT NULL,
      artist_url TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      item_url TEXT NOT NULL,
      featured_track_title TEXT,
      featured_track_duration REAL,
      stream_url TEXT,
      also_collected_count INTEGER DEFAULT 0,
      is_preorder INTEGER DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]',
      bpm REAL,
      musical_key TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (id, fan_id)
    );

    CREATE TABLE enrichment_queue (
      album_url TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT
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
      scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
      release_date TEXT,
      tags TEXT DEFAULT '[]',
      source TEXT NOT NULL DEFAULT 'discography'
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
      bpm REAL,
      musical_key TEXT,
      key_camelot TEXT,
      bpm_status TEXT,
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

export function seedCrate(
  db: Database.Database,
  fanId: number,
  overrides: Partial<{
    name: string;
    source: string;
  }> = {},
): number {
  const result = db.prepare(`
    INSERT INTO crates (fan_id, name, source) VALUES (?, ?, ?)
  `).run(
    fanId,
    overrides.name ?? 'My Crate',
    overrides.source ?? 'user',
  );
  return Number(result.lastInsertRowid);
}

export function seedWishlistItem(
  db: Database.Database,
  fanId: number,
  overrides: Partial<{
    id: string;
    tralbumId: number;
    tralbumType: string;
    title: string;
    artistName: string;
    artistUrl: string;
    imageUrl: string;
    itemUrl: string;
    featuredTrackTitle: string | null;
    featuredTrackDuration: number | null;
    streamUrl: string | null;
    alsoCollectedCount: number;
    isPreorder: boolean;
    tags: string[];
  }> = {},
): string {
  const id = overrides.id ?? `wl-${Math.random().toString(36).slice(2)}`;
  db.prepare(`
    INSERT OR REPLACE INTO wishlist_items (
      id, fan_id, tralbum_id, tralbum_type, title,
      artist_name, artist_url, image_url, item_url,
      featured_track_title, featured_track_duration, stream_url,
      also_collected_count, is_preorder, tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    fanId,
    overrides.tralbumId ?? 12345,
    overrides.tralbumType ?? 'a',
    overrides.title ?? 'Test Wishlist Album',
    overrides.artistName ?? 'Test Artist',
    overrides.artistUrl ?? 'https://testartist.bandcamp.com',
    overrides.imageUrl ?? 'https://f4.bcbits.com/img/a456_5.jpg',
    overrides.itemUrl ?? 'https://testartist.bandcamp.com/album/test',
    overrides.featuredTrackTitle ?? 'Featured Track',
    overrides.featuredTrackDuration ?? 240.0,
    overrides.streamUrl ?? 'https://bandcamp.com/stream_redirect?track_id=999',
    overrides.alsoCollectedCount ?? 0,
    overrides.isPreorder ? 1 : 0,
    JSON.stringify(overrides.tags ?? []),
  );
  return id;
}
