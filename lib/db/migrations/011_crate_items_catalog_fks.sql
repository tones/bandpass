-- Migration 011: Replace polymorphic feed_item_id with typed release_id/track_id FKs
-- This migration creates minimal catalog_releases entries from feed/wishlist data
-- where needed so that no crate items are lost.

-- Step 1: Add new columns (nullable, no constraints yet)
ALTER TABLE crate_items ADD COLUMN IF NOT EXISTS release_id INTEGER;
ALTER TABLE crate_items ADD COLUMN IF NOT EXISTS track_id INTEGER;

-- Step 2a: Backfill catalog-release-{id} rows (only if FK target exists)
UPDATE crate_items ci
SET release_id = CAST(SUBSTRING(ci.feed_item_id FROM 17) AS INTEGER)
FROM catalog_releases cr
WHERE ci.feed_item_id LIKE 'catalog-release-%'
  AND cr.id = CAST(SUBSTRING(ci.feed_item_id FROM 17) AS INTEGER);

-- Step 2b: Backfill catalog-track-{id} rows (only if FK target exists)
UPDATE crate_items ci
SET track_id = CAST(SUBSTRING(ci.feed_item_id FROM 15) AS INTEGER)
FROM catalog_tracks ct
WHERE ci.feed_item_id LIKE 'catalog-track-%'
  AND ct.id = CAST(SUBSTRING(ci.feed_item_id FROM 15) AS INTEGER);

-- Step 3: Create missing catalog_releases from feed_items data.
-- Some feed items in crates may not have a catalog entry yet because
-- enrichment only covers collection/wishlist albums.
-- First, link any feed_items to existing catalog entries by album_url:
UPDATE feed_items fi
SET release_id = cr.id
FROM catalog_releases cr
WHERE fi.album_url = cr.url
  AND fi.release_id IS NULL
  AND fi.album_url IS NOT NULL
  AND fi.album_url != '';

-- Now insert new catalog entries for feed items in crates that still have
-- no catalog match. Use DISTINCT ON album_url to avoid duplication.
INSERT INTO catalog_releases (band_slug, band_name, band_url, title, url, image_url, release_type, source, bandcamp_id)
SELECT DISTINCT ON (fi.album_url)
  COALESCE(NULLIF(SPLIT_PART(REPLACE(fi.artist_url, 'https://', ''), '.', 1), ''), 'unknown'),
  COALESCE(NULLIF(fi.artist_name, ''), 'Unknown Artist'),
  COALESCE(NULLIF(fi.artist_url, ''), ''),
  COALESCE(NULLIF(fi.album_title, ''), 'Untitled'),
  fi.album_url,
  COALESCE(fi.album_image_url, ''),
  'album',
  'crate-migration',
  fi.album_id
FROM crate_items ci
JOIN crates c ON c.id = ci.crate_id
JOIN feed_items fi ON fi.id = ci.feed_item_id AND fi.fan_id = c.fan_id
WHERE ci.release_id IS NULL
  AND ci.track_id IS NULL
  AND fi.release_id IS NULL
  AND fi.album_url IS NOT NULL
  AND fi.album_url != '';

-- Link those feed_items to the newly created catalog entries:
UPDATE feed_items fi
SET release_id = cr.id
FROM catalog_releases cr
WHERE fi.album_url = cr.url
  AND fi.release_id IS NULL
  AND fi.album_url IS NOT NULL
  AND fi.album_url != '';

-- Step 4a: Backfill feed-item-based crate rows via feed_items.release_id
-- (scoped through crates.fan_id for the composite PK)
UPDATE crate_items ci
SET release_id = fi.release_id
FROM crates c
JOIN feed_items fi ON fi.fan_id = c.fan_id
WHERE ci.crate_id = c.id
  AND ci.feed_item_id = fi.id
  AND fi.release_id IS NOT NULL
  AND ci.release_id IS NULL
  AND ci.track_id IS NULL;

-- Step 4b: Backfill wishlist-based crate rows via wishlist_items.release_id
UPDATE crate_items ci
SET release_id = wi.release_id
FROM crates c
JOIN wishlist_items wi ON wi.fan_id = c.fan_id
WHERE ci.crate_id = c.id
  AND ci.feed_item_id = wi.id
  AND wi.release_id IS NOT NULL
  AND ci.release_id IS NULL
  AND ci.track_id IS NULL;

-- Step 5: Deduplicate -- if the same release_id appears twice in one crate
-- (e.g. same album bookmarked as a feed item AND as catalog-release-{id}),
-- keep only the earliest added_at row.
DELETE FROM crate_items ci
USING crate_items ci2
WHERE ci.crate_id = ci2.crate_id
  AND ci.release_id IS NOT NULL
  AND ci.release_id = ci2.release_id
  AND ci.added_at > ci2.added_at;

-- Same for track_id duplicates
DELETE FROM crate_items ci
USING crate_items ci2
WHERE ci.crate_id = ci2.crate_id
  AND ci.track_id IS NOT NULL
  AND ci.track_id = ci2.track_id
  AND ci.added_at > ci2.added_at;

-- Step 6: Remove any rows that still have no catalog link (orphans)
DELETE FROM crate_items WHERE release_id IS NULL AND track_id IS NULL;

-- Step 7: Drop the old primary key and column, add constraints
ALTER TABLE crate_items DROP CONSTRAINT crate_items_pkey;
ALTER TABLE crate_items DROP COLUMN feed_item_id;

ALTER TABLE crate_items ADD CONSTRAINT crate_items_exactly_one
  CHECK (num_nonnulls(release_id, track_id) = 1);

ALTER TABLE crate_items ADD CONSTRAINT crate_items_release_fk
  FOREIGN KEY (release_id) REFERENCES catalog_releases(id);

ALTER TABLE crate_items ADD CONSTRAINT crate_items_track_fk
  FOREIGN KEY (track_id) REFERENCES catalog_tracks(id);

ALTER TABLE crate_items ADD CONSTRAINT crate_items_release_unique
  UNIQUE (crate_id, release_id);

ALTER TABLE crate_items ADD CONSTRAINT crate_items_track_unique
  UNIQUE (crate_id, track_id);

CREATE INDEX IF NOT EXISTS idx_crate_items_release ON crate_items(release_id) WHERE release_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crate_items_track ON crate_items(track_id) WHERE track_id IS NOT NULL;
