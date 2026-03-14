-- Add Bandcamp's native numeric IDs to catalog tables and feed_items
ALTER TABLE catalog_releases ADD COLUMN IF NOT EXISTS bandcamp_id BIGINT;
ALTER TABLE catalog_tracks ADD COLUMN IF NOT EXISTS bandcamp_track_id BIGINT;
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS bandcamp_track_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_releases_bc_id ON catalog_releases(bandcamp_id) WHERE bandcamp_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_catalog_tracks_bc_id ON catalog_tracks(bandcamp_track_id);
