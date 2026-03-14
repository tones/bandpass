-- Add FK columns linking feed/wishlist items to canonical catalog data
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS release_id INTEGER REFERENCES catalog_releases(id);
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS track_id INTEGER REFERENCES catalog_tracks(id);
ALTER TABLE wishlist_items ADD COLUMN IF NOT EXISTS release_id INTEGER REFERENCES catalog_releases(id);

CREATE INDEX IF NOT EXISTS idx_feed_release ON feed_items(release_id);
CREATE INDEX IF NOT EXISTS idx_feed_track ON feed_items(track_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_release ON wishlist_items(release_id);
CREATE INDEX IF NOT EXISTS idx_catalog_releases_url ON catalog_releases(url);

-- Backfill: link feed_items to catalog_releases by album_url
UPDATE feed_items fi
SET release_id = cr.id
FROM catalog_releases cr
WHERE fi.album_url = cr.url
  AND fi.release_id IS NULL;

-- Backfill: link feed_items to catalog_tracks by stream_url (scoped to matched release)
UPDATE feed_items fi
SET track_id = ct.id
FROM catalog_tracks ct
WHERE fi.track_stream_url = ct.stream_url
  AND ct.release_id = fi.release_id
  AND fi.track_id IS NULL
  AND fi.release_id IS NOT NULL;

-- Backfill: link wishlist_items to catalog_releases by item_url
UPDATE wishlist_items wi
SET release_id = cr.id
FROM catalog_releases cr
WHERE wi.item_url = cr.url
  AND wi.release_id IS NULL;
