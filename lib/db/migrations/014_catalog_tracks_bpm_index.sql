CREATE INDEX IF NOT EXISTS idx_catalog_tracks_release_bpm
  ON catalog_tracks (release_id, bpm)
  WHERE bpm IS NOT NULL;
