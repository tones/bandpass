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

  return db;
}
