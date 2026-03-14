# Phase 3 Follow-up: Stop Dual-Writing BPM/Key + Final Cleanup

**Prerequisite**: The audio enrichment queue has finished processing, so most
`catalog_tracks` rows now have `bandcamp_track_id` populated. Verify with:

```sql
SELECT COUNT(*) AS total,
       COUNT(bandcamp_track_id) AS with_bc_track_id
FROM catalog_tracks;
```

Target: >80% coverage before proceeding.

## Step 1: Backfill `feed_items.track_id`

Once `catalog_tracks.bandcamp_track_id` is populated, link feed items to their
tracks. This is a single SQL statement:

```sql
UPDATE feed_items fi
SET track_id = ct.id
FROM catalog_tracks ct
WHERE ct.bandcamp_track_id = fi.bandcamp_track_id
  AND fi.track_id IS NULL
  AND fi.bandcamp_track_id IS NOT NULL;
```

Verify coverage:

```sql
SELECT COUNT(*) AS total,
       COUNT(track_id) AS with_track_id
FROM feed_items;
```

## Step 2: Stop dual-writing BPM/key

Currently, `feed_items.bpm` and `feed_items.musical_key` are never written by
the enrichment worker (audio analysis results go straight to `catalog_tracks`).
However, the read queries already use `COALESCE(ct.bpm, fi.bpm)`, so there is
no active dual-write to remove for BPM/key -- the inline columns are just
legacy nulls from before audio analysis existed.

Verify this is still true by checking `lib/db/sync.ts` and `worker/main.ts`
for any writes to `feed_items.bpm` or `feed_items.musical_key`.

## Step 3: Drop redundant inline columns

Once confident that reads go through catalog JOINs and coverage is high:

```sql
-- Only do this after validating that no code writes to these columns
-- and that JOIN coverage is sufficient
ALTER TABLE feed_items DROP COLUMN IF EXISTS tags;
ALTER TABLE feed_items DROP COLUMN IF EXISTS bpm;
ALTER TABLE feed_items DROP COLUMN IF EXISTS musical_key;
ALTER TABLE wishlist_items DROP COLUMN IF EXISTS tags;
ALTER TABLE wishlist_items DROP COLUMN IF EXISTS bpm;
ALTER TABLE wishlist_items DROP COLUMN IF EXISTS musical_key;
```

**Warning**: Before dropping columns, update the read queries to remove the
CASE/COALESCE fallback logic (since there's nothing to fall back to). The
queries should just read directly from the catalog tables via the JOINs.
Also update `INSERT_ITEM` and `UPSERT_WISHLIST_ITEM` to stop writing these
columns.

This is a significant change -- double-check all queries in:
- `lib/db/queries.ts` (getFeedItems, getTagCounts)
- `lib/db/crates.ts` (getCrateItems, getCrateWishlistItems, getWishlistItems)
- `lib/db/sync.ts` (INSERT_ITEM, UPSERT_WISHLIST_ITEM, enrichFeedItems)

## Step 4: Normalize crate_items foreign keys

Currently `crate_items.feed_item_id` is a TEXT column that encodes different
item types as strings: plain feed item IDs, `catalog-track-{id}`, and
`catalog-release-{id}`. This should be refactored to use proper typed columns:

- Add `item_type ENUM('feed_item', 'catalog_track', 'catalog_release')`
- Add `catalog_track_id INTEGER REFERENCES catalog_tracks(id)`
- Add `catalog_release_id INTEGER REFERENCES catalog_releases(id)`
- Migrate existing string-encoded IDs to the new columns
- Update all crate query functions in `lib/db/crates.ts`
- Drop the old `feed_item_id` column

This is independent of the other steps and can be done at any time.
