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
      last_sync_at TEXT
    );
  `);

  return db;
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
