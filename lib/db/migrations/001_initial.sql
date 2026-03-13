CREATE TABLE IF NOT EXISTS feed_items (
  id TEXT NOT NULL,
  fan_id INTEGER NOT NULL,
  story_type TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  album_id BIGINT,
  album_title TEXT DEFAULT '',
  album_url TEXT DEFAULT '',
  album_image_url TEXT DEFAULT '',
  artist_id BIGINT,
  artist_name TEXT DEFAULT '',
  artist_url TEXT DEFAULT '',
  track_title TEXT,
  track_duration REAL,
  track_stream_url TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  price_amount REAL,
  price_currency TEXT,
  fan_name TEXT,
  fan_username TEXT,
  also_collected_count INTEGER NOT NULL DEFAULT 0,
  bpm REAL,
  musical_key TEXT,
  PRIMARY KEY (id, fan_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_fan_date ON feed_items(fan_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_feed_fan_type ON feed_items(fan_id, story_type);

CREATE TABLE IF NOT EXISTS sync_state (
  fan_id INTEGER PRIMARY KEY,
  oldest_story_date INTEGER,
  newest_story_date INTEGER,
  total_items INTEGER NOT NULL DEFAULT 0,
  is_syncing BOOLEAN NOT NULL DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  deep_sync_complete BOOLEAN NOT NULL DEFAULT false,
  collection_synced BOOLEAN NOT NULL DEFAULT false,
  wishlist_synced BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS catalog_releases (
  id SERIAL PRIMARY KEY,
  band_slug TEXT NOT NULL,
  band_name TEXT NOT NULL,
  band_url TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  image_url TEXT DEFAULT '',
  release_type TEXT NOT NULL DEFAULT 'album',
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  release_date TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'enrichment'
);

CREATE INDEX IF NOT EXISTS idx_catalog_band ON catalog_releases(band_slug);

CREATE TABLE IF NOT EXISTS catalog_tracks (
  id SERIAL PRIMARY KEY,
  release_id INTEGER NOT NULL REFERENCES catalog_releases(id) ON DELETE CASCADE,
  track_num INTEGER,
  title TEXT NOT NULL,
  duration REAL,
  stream_url TEXT,
  track_url TEXT,
  bpm REAL,
  musical_key TEXT,
  key_camelot TEXT,
  bpm_status TEXT
);

CREATE TABLE IF NOT EXISTS crates (
  id SERIAL PRIMARY KEY,
  fan_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crates_fan ON crates(fan_id);

CREATE TABLE IF NOT EXISTS crate_items (
  crate_id INTEGER NOT NULL REFERENCES crates(id) ON DELETE CASCADE,
  feed_item_id TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (crate_id, feed_item_id)
);

CREATE TABLE IF NOT EXISTS wishlist_items (
  id TEXT NOT NULL,
  fan_id INTEGER NOT NULL,
  tralbum_id BIGINT NOT NULL,
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
  is_preorder BOOLEAN DEFAULT false,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  bpm REAL,
  musical_key TEXT,
  PRIMARY KEY (id, fan_id)
);

CREATE TABLE IF NOT EXISTS enrichment_queue (
  album_url TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id SERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,
  fan_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  progress_done INTEGER DEFAULT 0,
  progress_total INTEGER DEFAULT 0,
  progress_errors INTEGER DEFAULT 0,
  sub_phase TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
