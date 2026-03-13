import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'bandpass.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaVersion = (db.pragma('user_version') as { user_version: number }[])[0].user_version;

  if (schemaVersion < 1) {
    db.exec(`
      DROP TABLE IF EXISTS feed_items;
      DROP TABLE IF EXISTS sync_state;

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

      PRAGMA user_version = 1;
    `);
  }

  if (schemaVersion < 2) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shortlist (
        fan_id INTEGER NOT NULL,
        feed_item_id TEXT NOT NULL,
        added_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (fan_id, feed_item_id)
      );

      PRAGMA user_version = 2;
    `);
  }

  if (schemaVersion < 3) {
    db.exec(`
      ALTER TABLE sync_state ADD COLUMN deep_sync_complete INTEGER NOT NULL DEFAULT 0;

      PRAGMA user_version = 3;
    `);
  }

  if (schemaVersion < 4) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS catalog_releases (
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

      CREATE INDEX IF NOT EXISTS idx_catalog_band ON catalog_releases(band_slug);

      CREATE TABLE IF NOT EXISTS catalog_tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        release_id INTEGER NOT NULL,
        track_num INTEGER,
        title TEXT NOT NULL,
        duration REAL,
        stream_url TEXT,
        FOREIGN KEY (release_id) REFERENCES catalog_releases(id) ON DELETE CASCADE
      );

      PRAGMA user_version = 4;
    `);
  }

  if (schemaVersion < 5) {
    db.exec(`
      ALTER TABLE catalog_tracks ADD COLUMN track_url TEXT;

      PRAGMA user_version = 5;
    `);
  }

  if (schemaVersion < 6) {
    db.exec(`
      ALTER TABLE sync_state ADD COLUMN collection_synced INTEGER NOT NULL DEFAULT 0;
      DELETE FROM feed_items WHERE story_type = 'also_purchased';

      PRAGMA user_version = 6;
    `);
  }

  if (schemaVersion < 7) {
    db.exec(`
      ALTER TABLE catalog_releases ADD COLUMN release_date TEXT;
      ALTER TABLE catalog_releases ADD COLUMN tags TEXT DEFAULT '[]';

      PRAGMA user_version = 7;
    `);
  }

  if (schemaVersion < 8) {
    // Normalize existing release dates from "31 Oct 2025 00:00:00 GMT" to "2025-10-31"
    const rows = db.prepare(
      `SELECT id, release_date FROM catalog_releases WHERE release_date IS NOT NULL`
    ).all() as Array<{ id: number; release_date: string }>;

    const update = db.prepare(`UPDATE catalog_releases SET release_date = ? WHERE id = ?`);
    const migrateAll = db.transaction(() => {
      for (const row of rows) {
        const d = new Date(row.release_date);
        if (!isNaN(d.getTime())) {
          update.run(d.toISOString().slice(0, 10), row.id);
        }
      }
    });
    migrateAll();

    db.exec(`PRAGMA user_version = 8;`);
  }

  if (schemaVersion < 9) {
    db.exec(`
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
        synced_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (id, fan_id)
      );

      ALTER TABLE sync_state ADD COLUMN wishlist_synced INTEGER NOT NULL DEFAULT 0;
    `);

    const fans = db.prepare(
      `SELECT DISTINCT fan_id FROM shortlist`
    ).all() as Array<{ fan_id: number }>;

    const insertCrate = db.prepare(
      `INSERT INTO crates (fan_id, name, source) VALUES (?, 'My Crate', 'user')`
    );
    const migrateFanItems = db.prepare(`
      INSERT INTO crate_items (crate_id, feed_item_id, added_at)
      SELECT ?, feed_item_id, added_at FROM shortlist WHERE fan_id = ?
    `);

    const migrateShortlist = db.transaction(() => {
      for (const { fan_id } of fans) {
        const result = insertCrate.run(fan_id);
        migrateFanItems.run(result.lastInsertRowid, fan_id);
      }
    });
    migrateShortlist();

    db.exec(`
      DROP TABLE shortlist;
      PRAGMA user_version = 9;
    `);
  }

  if (schemaVersion < 10) {
    db.exec(`
      CREATE TABLE enrichment_queue (
        album_url TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        processed_at TEXT
      );

      ALTER TABLE wishlist_items ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';

      PRAGMA user_version = 10;
    `);
  }

  if (schemaVersion < 11) {
    db.exec(`
      ALTER TABLE catalog_releases ADD COLUMN source TEXT NOT NULL DEFAULT 'enrichment';

      PRAGMA user_version = 11;
    `);
  }

  if (schemaVersion < 12) {
    db.exec(`
      UPDATE catalog_releases SET source = 'enrichment' WHERE source != 'enrichment';

      PRAGMA user_version = 12;
    `);
  }

  if (schemaVersion < 13) {
    db.exec(`
      ALTER TABLE catalog_tracks ADD COLUMN bpm REAL;
      ALTER TABLE catalog_tracks ADD COLUMN musical_key TEXT;
      ALTER TABLE catalog_tracks ADD COLUMN key_camelot TEXT;
      ALTER TABLE catalog_tracks ADD COLUMN bpm_status TEXT;

      ALTER TABLE feed_items ADD COLUMN bpm REAL;
      ALTER TABLE feed_items ADD COLUMN musical_key TEXT;

      ALTER TABLE wishlist_items ADD COLUMN bpm REAL;
      ALTER TABLE wishlist_items ADD COLUMN musical_key TEXT;

      PRAGMA user_version = 13;
    `);
  }

  return db;
}
